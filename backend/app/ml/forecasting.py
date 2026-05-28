from __future__ import annotations

import warnings
from dataclasses import dataclass, field
from datetime import date, timedelta

import numpy as np
import pandas as pd
from sqlalchemy.orm import Session

from app.models.sales import SalesRecord

warnings.filterwarnings("ignore")


@dataclass
class ForecastResult:
    model_name: str
    sku_id: int
    dates: list[str]
    forecast: list[float]
    lower_bound: list[float]
    upper_bound: list[float]
    mape: float
    feature_importance: dict = field(default_factory=dict)


def _mape(actual: np.ndarray, predicted: np.ndarray) -> float:
    mask = actual != 0
    if mask.sum() == 0:
        return 0.0
    return float(np.mean(np.abs((actual[mask] - predicted[mask]) / actual[mask])) * 100)


def _wmape(actual: np.ndarray, predicted: np.ndarray) -> float:
    denom = np.sum(np.abs(actual))
    if denom == 0:
        return 0.0
    return float(np.sum(np.abs(actual - predicted)) / denom * 100)


def _mae(actual: np.ndarray, predicted: np.ndarray) -> float:
    return float(np.mean(np.abs(actual - predicted)))


def _rmse(actual: np.ndarray, predicted: np.ndarray) -> float:
    return float(np.sqrt(np.mean((actual - predicted) ** 2)))


def _bias(actual: np.ndarray, predicted: np.ndarray) -> float:
    return float(np.mean(predicted - actual))


class ForecastingEngine:
    # ------------------------------------------------------------------ #
    # Data preparation                                                     #
    # ------------------------------------------------------------------ #

    def prepare_time_series(self, db: Session, sku_id: int) -> pd.DataFrame:
        rows = (
            db.query(SalesRecord.sale_date, SalesRecord.quantity)
            .filter(SalesRecord.sku_id == sku_id)
            .order_by(SalesRecord.sale_date)
            .all()
        )
        if not rows:
            return pd.DataFrame(columns=["ds", "y"])

        df = pd.DataFrame(rows, columns=["ds", "y"])
        df["ds"] = pd.to_datetime(df["ds"])

        # Aggregate duplicates (same date → sum)
        df = df.groupby("ds", as_index=False)["y"].sum()
        df = df.sort_values("ds").reset_index(drop=True)

        # Fill missing dates
        full_range = pd.date_range(df["ds"].min(), df["ds"].max(), freq="D")
        df = df.set_index("ds").reindex(full_range).rename_axis("ds").reset_index()
        df["y"] = df["y"].ffill().fillna(0.0)

        return df

    # ------------------------------------------------------------------ #
    # Prophet                                                              #
    # ------------------------------------------------------------------ #

    def run_prophet(
        self,
        df: pd.DataFrame,
        horizon_days: int = 90,
        sku_id: int = 0,
    ) -> ForecastResult:
        from prophet import Prophet  # lazy import — avoids slow startup

        if len(df) < 14:
            return self._fallback(df, horizon_days, "prophet", sku_id)

        split = int(len(df) * 0.8)
        train = df.iloc[:split].copy()
        val = df.iloc[split:].copy()

        m = Prophet(
            yearly_seasonality=True,
            weekly_seasonality=True,
            daily_seasonality=False,
            interval_width=0.95,
        )
        m.add_seasonality(name="quarterly", period=91.25, fourier_order=5)

        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            m.fit(train)

        # Validation MAPE on holdout
        val_future = m.make_future_dataframe(periods=len(val), freq="D")
        val_future = val_future.tail(len(val))
        val_pred = m.predict(val_future)["yhat"].values
        val_actual = val["y"].values
        holdout_mape = _mape(val_actual, np.maximum(val_pred, 0))

        # Full forecast
        m2 = Prophet(
            yearly_seasonality=True,
            weekly_seasonality=True,
            daily_seasonality=False,
            interval_width=0.95,
        )
        m2.add_seasonality(name="quarterly", period=91.25, fourier_order=5)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            m2.fit(df)

        future = m2.make_future_dataframe(periods=horizon_days, freq="D")
        forecast = m2.predict(future).tail(horizon_days)

        dates = [str(d.date()) for d in forecast["ds"]]
        yhat = np.maximum(forecast["yhat"].values, 0).tolist()
        lower = np.maximum(forecast["yhat_lower"].values, 0).tolist()
        upper = np.maximum(forecast["yhat_upper"].values, 0).tolist()

        return ForecastResult(
            model_name="prophet",
            sku_id=sku_id,
            dates=dates,
            forecast=[round(v, 4) for v in yhat],
            lower_bound=[round(v, 4) for v in lower],
            upper_bound=[round(v, 4) for v in upper],
            mape=round(holdout_mape, 4),
        )

    # ------------------------------------------------------------------ #
    # ARIMA                                                                #
    # ------------------------------------------------------------------ #

    def run_arima(
        self,
        df: pd.DataFrame,
        horizon_days: int = 90,
        sku_id: int = 0,
    ) -> ForecastResult:
        from statsmodels.tsa.arima.model import ARIMA

        if len(df) < 30:
            return self._fallback(df, horizon_days, "arima", sku_id)

        split = int(len(df) * 0.8)
        train_y = df["y"].iloc[:split].values
        val_y = df["y"].iloc[split:].values

        orders = [(1, 1, 1), (2, 1, 2), (1, 1, 0), (0, 1, 1)]
        best_aic = float("inf")
        best_order = (1, 1, 1)

        for order in orders:
            try:
                res = ARIMA(train_y, order=order).fit()
                if res.aic < best_aic:
                    best_aic = res.aic
                    best_order = order
            except Exception:
                continue

        # Validate on holdout
        val_model = ARIMA(train_y, order=best_order).fit()
        val_pred = val_model.forecast(steps=len(val_y))
        holdout_mape = _mape(val_y, np.maximum(val_pred, 0))

        # Refit on full data
        full_model = ARIMA(df["y"].values, order=best_order).fit()
        fc = full_model.get_forecast(steps=horizon_days)
        yhat = fc.predicted_mean
        ci = fc.conf_int(alpha=0.05)

        last_date = df["ds"].max()
        dates = [
            str((last_date + timedelta(days=i + 1)).date()) for i in range(horizon_days)
        ]

        return ForecastResult(
            model_name="arima",
            sku_id=sku_id,
            dates=dates,
            forecast=[round(max(float(v), 0), 4) for v in yhat],
            lower_bound=[round(max(float(v), 0), 4) for v in ci.iloc[:, 0]],
            upper_bound=[round(max(float(v), 0), 4) for v in ci.iloc[:, 1]],
            mape=round(holdout_mape, 4),
        )

    # ------------------------------------------------------------------ #
    # XGBoost                                                              #
    # ------------------------------------------------------------------ #

    def run_xgboost(
        self,
        df: pd.DataFrame,
        horizon_days: int = 90,
        sku_id: int = 0,
    ) -> ForecastResult:
        import xgboost as xgb

        if len(df) < 35:
            return self._fallback(df, horizon_days, "xgboost", sku_id)

        feature_cols = [
            "lag_7", "lag_14", "lag_28",
            "rolling_mean_7", "rolling_mean_28", "rolling_std_7",
            "month", "quarter", "day_of_week", "week_of_year", "is_month_end",
        ]

        def build_features(series: pd.Series, dates: pd.Series) -> pd.DataFrame:
            fdf = pd.DataFrame({"y": series.values}, index=dates)
            fdf["lag_7"] = fdf["y"].shift(7)
            fdf["lag_14"] = fdf["y"].shift(14)
            fdf["lag_28"] = fdf["y"].shift(28)
            fdf["rolling_mean_7"] = fdf["y"].shift(1).rolling(7).mean()
            fdf["rolling_mean_28"] = fdf["y"].shift(1).rolling(28).mean()
            fdf["rolling_std_7"] = fdf["y"].shift(1).rolling(7).std().fillna(0)
            fdf["month"] = fdf.index.month
            fdf["quarter"] = fdf.index.quarter
            fdf["day_of_week"] = fdf.index.dayofweek
            fdf["week_of_year"] = fdf.index.isocalendar().week.astype(int)
            fdf["is_month_end"] = fdf.index.is_month_end.astype(int)
            return fdf.dropna(subset=feature_cols)

        feat_df = build_features(df["y"], pd.DatetimeIndex(df["ds"]))
        split = int(len(feat_df) * 0.8)
        train_feat = feat_df.iloc[:split]
        val_feat = feat_df.iloc[split:]

        model = xgb.XGBRegressor(
            n_estimators=300,
            learning_rate=0.05,
            max_depth=4,
            subsample=0.8,
            colsample_bytree=0.8,
            random_state=42,
            verbosity=0,
        )
        model.fit(train_feat[feature_cols], train_feat["y"])

        val_pred = np.maximum(model.predict(val_feat[feature_cols]), 0)
        val_actual = val_feat["y"].values
        holdout_mape = _mape(val_actual, val_pred)
        residual_std = float(np.std(val_actual - val_pred))

        # Feature importance
        importance = dict(zip(feature_cols, model.feature_importances_.tolist()))

        # Recursive future forecasting
        history = df["y"].values.tolist()
        last_date = df["ds"].max()
        future_dates: list[date] = []
        predictions: list[float] = []
        lower_bounds: list[float] = []
        upper_bounds: list[float] = []

        for i in range(horizon_days):
            fd = pd.Timestamp(last_date) + timedelta(days=i + 1)
            future_dates.append(fd.date())

            n = len(history)
            lag_7 = history[-7] if n >= 7 else history[0]
            lag_14 = history[-14] if n >= 14 else history[0]
            lag_28 = history[-28] if n >= 28 else history[0]
            rm7 = float(np.mean(history[-7:])) if n >= 7 else float(np.mean(history))
            rm28 = float(np.mean(history[-28:])) if n >= 28 else float(np.mean(history))
            rs7 = float(np.std(history[-7:])) if n >= 7 else 0.0

            row = pd.DataFrame([{
                "lag_7": lag_7, "lag_14": lag_14, "lag_28": lag_28,
                "rolling_mean_7": rm7, "rolling_mean_28": rm28, "rolling_std_7": rs7,
                "month": fd.month, "quarter": fd.quarter,
                "day_of_week": fd.dayofweek,
                "week_of_year": int(fd.isocalendar()[1]),
                "is_month_end": int(fd.is_month_end),
            }])

            pred = float(max(model.predict(row[feature_cols])[0], 0))
            predictions.append(round(pred, 4))
            lower_bounds.append(round(max(pred - 1.96 * residual_std, 0), 4))
            upper_bounds.append(round(pred + 1.96 * residual_std, 4))
            history.append(pred)

        return ForecastResult(
            model_name="xgboost",
            sku_id=sku_id,
            dates=[str(d) for d in future_dates],
            forecast=predictions,
            lower_bound=lower_bounds,
            upper_bound=upper_bounds,
            mape=round(holdout_mape, 4),
            feature_importance=importance,
        )

    # ------------------------------------------------------------------ #
    # Ensemble                                                             #
    # ------------------------------------------------------------------ #

    def run_ensemble(
        self,
        db: Session,
        sku_id: int,
        horizon_days: int = 90,
    ) -> ForecastResult:
        df = self.prepare_time_series(db, sku_id)

        results: list[ForecastResult] = []
        for runner in (self.run_prophet, self.run_arima, self.run_xgboost):
            try:
                r = runner(df, horizon_days=horizon_days, sku_id=sku_id)
                results.append(r)
            except Exception as exc:
                print(f"⚠️  {runner.__name__} failed for sku {sku_id}: {exc}")

        if not results:
            return self._fallback(df, horizon_days, "ensemble", sku_id)

        # Inverse-MAPE weighting (lower MAPE → higher weight)
        mapes = np.array([max(r.mape, 0.01) for r in results])
        inv = 1.0 / mapes
        weights = inv / inv.sum()

        n = len(results[0].dates)
        blended = np.zeros(n)
        blended_lower = np.zeros(n)
        blended_upper = np.zeros(n)

        for w, r in zip(weights, results):
            arr = np.array(r.forecast[:n])
            blended += w * arr
            blended_lower += w * np.array(r.lower_bound[:n])
            blended_upper += w * np.array(r.upper_bound[:n])

        ensemble_mape = float(np.dot(weights, mapes))

        return ForecastResult(
            model_name="ensemble",
            sku_id=sku_id,
            dates=results[0].dates[:n],
            forecast=[round(float(v), 4) for v in blended],
            lower_bound=[round(max(float(v), 0), 4) for v in blended_lower],
            upper_bound=[round(float(v), 4) for v in blended_upper],
            mape=round(ensemble_mape, 4),
        )

    # ------------------------------------------------------------------ #
    # Accuracy                                                             #
    # ------------------------------------------------------------------ #

    def calculate_accuracy(
        self,
        db: Session,
        sku_id: int,
        model_name: str,
    ) -> dict:
        df = self.prepare_time_series(db, sku_id)
        if len(df) < 30:
            return {
                "mape": 0.0, "wmape": 0.0, "mae": 0.0,
                "rmse": 0.0, "bias": 0.0, "sample_size": len(df),
            }

        split = int(len(df) * 0.8)
        val_df = df.iloc[split:].copy()

        try:
            if model_name == "prophet":
                result = self.run_prophet(df, horizon_days=len(val_df), sku_id=sku_id)
            elif model_name == "arima":
                result = self.run_arima(df, horizon_days=len(val_df), sku_id=sku_id)
            elif model_name == "xgboost":
                result = self.run_xgboost(df, horizon_days=len(val_df), sku_id=sku_id)
            else:  # ensemble
                result = self.run_ensemble(db, sku_id, horizon_days=len(val_df))
        except Exception:
            result = self._fallback(df, len(val_df), model_name, sku_id)

        n = min(len(val_df), len(result.forecast))
        actual = val_df["y"].values[:n]
        predicted = np.array(result.forecast[:n])

        return {
            "mape": round(_mape(actual, predicted), 4),
            "wmape": round(_wmape(actual, predicted), 4),
            "mae": round(_mae(actual, predicted), 4),
            "rmse": round(_rmse(actual, predicted), 4),
            "bias": round(_bias(actual, predicted), 4),
            "sample_size": n,
        }

    # ------------------------------------------------------------------ #
    # Fallback (naive forecast)                                            #
    # ------------------------------------------------------------------ #

    def _fallback(
        self,
        df: pd.DataFrame,
        horizon_days: int,
        model_name: str,
        sku_id: int,
    ) -> ForecastResult:
        if len(df) == 0:
            last_val = 0.0
            last_date = pd.Timestamp.now()
        else:
            last_val = float(df["y"].tail(7).mean())
            last_date = df["ds"].max()

        std = float(df["y"].std()) if len(df) > 1 else last_val * 0.1
        dates = [
            str((pd.Timestamp(last_date) + timedelta(days=i + 1)).date())
            for i in range(horizon_days)
        ]
        forecast = [round(last_val, 4)] * horizon_days
        lower = [round(max(last_val - 1.96 * std, 0), 4)] * horizon_days
        upper = [round(last_val + 1.96 * std, 4)] * horizon_days

        return ForecastResult(
            model_name=model_name,
            sku_id=sku_id,
            dates=dates,
            forecast=forecast,
            lower_bound=lower,
            upper_bound=upper,
            mape=0.0,
        )


# ---------------------------------------------------------------------------
# Legacy module-level helpers (kept for backward compatibility)
# ---------------------------------------------------------------------------

def compute_metrics(actuals: list[float], predictions: list[float]) -> dict[str, float]:
    a = np.array(actuals)
    p = np.array(predictions)
    return {"mape": _mape(a, p), "rmse": _rmse(a, p)}


def prepare_time_series(df: pd.DataFrame, date_col: str, qty_col: str) -> pd.DataFrame:
    result = df[[date_col, qty_col]].copy()
    result.columns = pd.Index(["ds", "y"])
    result["ds"] = pd.to_datetime(result["ds"])
    result = result.sort_values("ds").reset_index(drop=True)
    full = pd.date_range(result["ds"].min(), result["ds"].max(), freq="D")
    result = result.set_index("ds").reindex(full).rename_axis("ds").reset_index()
    result["y"] = result["y"].ffill().fillna(0.0)
    return result
