from dataclasses import dataclass, field
from datetime import date

import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_percentage_error, mean_squared_error


@dataclass
class ForecastResult:
    model_name: str
    sku_id: int
    horizon_days: int
    forecast_dates: list[date]
    predicted_quantities: list[float]
    lower_bounds: list[float] | None = None
    upper_bounds: list[float] | None = None
    mape: float | None = None
    rmse: float | None = None


def run_prophet(
    df: pd.DataFrame,
    sku_id: int,
    horizon_days: int = 90,
    confidence_level: float = 0.95,
) -> ForecastResult:
    """Fit a Prophet model on the provided time series and return forecast results."""
    ...


def run_xgboost(
    df: pd.DataFrame,
    sku_id: int,
    horizon_days: int = 90,
) -> ForecastResult:
    """Fit an XGBoost model with lag features and return forecast results."""
    ...


def run_arima(
    df: pd.DataFrame,
    sku_id: int,
    horizon_days: int = 90,
) -> ForecastResult:
    """Fit an auto-ARIMA model via statsmodels and return forecast results."""
    ...


def ensemble_forecast(results: list[ForecastResult], weights: list[float] | None = None) -> ForecastResult:
    """Combine multiple ForecastResult objects into a weighted ensemble."""
    ...


def compute_metrics(actuals: list[float], predictions: list[float]) -> dict[str, float]:
    """Return MAPE and RMSE for the given actuals and predictions."""
    ...


def prepare_time_series(df: pd.DataFrame, date_col: str, qty_col: str) -> pd.DataFrame:
    """Resample a raw sales DataFrame to a daily time series with no gaps."""
    ...
