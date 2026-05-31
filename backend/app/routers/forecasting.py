from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_session_id, verify_token
from app.ml.forecasting import ForecastingEngine
from app.models.forecast import Forecast
from app.models.sales import SalesRecord
from app.models.sku import SKU
from app.models.user import User
from app.schemas.forecast import (
    ForecastChartPoint,
    ForecastRequest,
    ForecastResponse,
    ForecastPoint,
    HistoricalPoint,
    ModelAccuracy,
    PortfolioItem,
    SKUAccuracy,
    SKUChartData,
    SKUResponse,
)

router = APIRouter(prefix="/forecasting", tags=["forecasting"])

_oauth2 = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)
engine = ForecastingEngine()


def _optional_user(
    token: Optional[str] = Depends(_oauth2),
    db: Session = Depends(get_db),
) -> Optional[User]:
    if not token:
        return None
    subject = verify_token(token)
    if subject is None:
        return None
    return db.query(User).filter(User.id == int(subject)).first()


def _session_skus(session_id: str, db: Session) -> list[SKU]:
    try:
        skus = db.query(SKU).filter(SKU.session_id == session_id).order_by(SKU.code).all()
        if not skus and session_id != "demo":
            skus = db.query(SKU).filter(SKU.session_id == "demo").order_by(SKU.code).all()
        return skus
    except Exception:
        db.rollback()
        return db.query(SKU).order_by(SKU.code).all()


def _resolve_sku(sku_id: int, session_id: str, db: Session) -> SKU:
    try:
        sku = db.query(SKU).filter(SKU.id == sku_id, SKU.session_id == session_id).first()
        if sku is None and session_id != "demo":
            sku = db.query(SKU).filter(SKU.id == sku_id, SKU.session_id == "demo").first()
    except Exception:
        db.rollback()
        sku = db.query(SKU).filter(SKU.id == sku_id).first()
    if sku is None:
        raise HTTPException(status_code=404, detail=f"SKU {sku_id} not found")
    return sku


# ------------------------------------------------------------------ #
# GET /forecasting/skus                                                #
# ------------------------------------------------------------------ #

@router.get("/skus", response_model=list[SKUResponse])
def list_skus(
    db: Session = Depends(get_db),
    session_id: str = Depends(get_session_id),
    _: Optional[User] = Depends(_optional_user),
) -> list[SKUResponse]:
    skus = _session_skus(session_id, db)
    return [
        SKUResponse(
            id=s.id,
            name=s.name,
            atc_code=s.code,
            therapy_area=s.therapeutic_area,
        )
        for s in skus
    ]


# ------------------------------------------------------------------ #
# POST /forecasting/run                                                #
# ------------------------------------------------------------------ #

@router.post("/run", response_model=ForecastResponse)
def run_forecast(
    payload: ForecastRequest,
    db: Session = Depends(get_db),
    session_id: str = Depends(get_session_id),
    _current_user: Optional[User] = Depends(_optional_user),
) -> ForecastResponse:
    sku = _resolve_sku(payload.sku_id, session_id, db)
    # Use the SKU's actual session for storing the forecast
    eff_session = sku.session_id

    model_name = payload.model_name.lower()
    if model_name not in ("prophet", "arima", "xgboost", "ensemble"):
        raise HTTPException(status_code=422, detail="model_name must be prophet|arima|xgboost|ensemble")

    try:
        if model_name == "ensemble":
            result = engine.run_ensemble(db, payload.sku_id, payload.horizon_days)
        else:
            df = engine.prepare_time_series(db, payload.sku_id)
            runner = {
                "prophet": engine.run_prophet,
                "arima": engine.run_arima,
                "xgboost": engine.run_xgboost,
            }[model_name]
            result = runner(df, horizon_days=payload.horizon_days, sku_id=payload.sku_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    now = datetime.now(timezone.utc)
    new_rows = [
        Forecast(
            sku_id=payload.sku_id,
            model_name=result.model_name,
            forecast_date=datetime.strptime(d, "%Y-%m-%d").date(),
            horizon_days=payload.horizon_days,
            predicted_quantity=f,
            lower_bound=lb,
            upper_bound=ub,
            confidence_level=payload.confidence_level,
            mape=result.mape,
            session_id=eff_session,
        )
        for d, f, lb, ub in zip(
            result.dates, result.forecast, result.lower_bound, result.upper_bound
        )
    ]
    db.bulk_save_objects(new_rows)
    db.commit()

    points = [
        ForecastPoint(
            forecast_date=datetime.strptime(d, "%Y-%m-%d").date(),
            predicted_quantity=f,
            lower_bound=lb,
            upper_bound=ub,
        )
        for d, f, lb, ub in zip(
            result.dates, result.forecast, result.lower_bound, result.upper_bound
        )
    ]

    return ForecastResponse(
        sku_id=payload.sku_id,
        model_name=result.model_name,
        horizon_days=payload.horizon_days,
        confidence_level=payload.confidence_level,
        points=points,
        mape=result.mape,
        generated_at=now,
    )


# ------------------------------------------------------------------ #
# GET /forecasting/skus/{sku_id}/latest                                #
# ------------------------------------------------------------------ #

@router.get("/skus/{sku_id}/latest", response_model=SKUChartData)
def get_latest_forecast(
    sku_id: int,
    model_name: str = Query(default="ensemble"),
    horizon_days: int = Query(default=90),
    db: Session = Depends(get_db),
    session_id: str = Depends(get_session_id),
    _: Optional[User] = Depends(_optional_user),
) -> SKUChartData:
    sku = _resolve_sku(sku_id, session_id, db)

    rows = (
        db.query(SalesRecord.sale_date, SalesRecord.quantity)
        .filter(SalesRecord.sku_id == sku_id)
        .order_by(SalesRecord.sale_date)
        .all()
    )
    historical = [
        HistoricalPoint(date=str(r.sale_date), actual=round(r.quantity, 4))
        for r in rows
    ]

    try:
        model_key = model_name.lower()
        if model_key == "ensemble":
            result = engine.run_ensemble(db, sku_id, horizon_days)
        else:
            df = engine.prepare_time_series(db, sku_id)
            runner = {
                "prophet": engine.run_prophet,
                "arima": engine.run_arima,
                "xgboost": engine.run_xgboost,
            }.get(model_key, engine.run_ensemble)
            if model_key in ("prophet", "arima", "xgboost"):
                result = runner(df, horizon_days=horizon_days, sku_id=sku_id)  # type: ignore[call-arg]
            else:
                result = engine.run_ensemble(db, sku_id, horizon_days)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    forecast_points = [
        ForecastChartPoint(date=d, forecast=f, lower=lb, upper=ub)
        for d, f, lb, ub in zip(
            result.dates, result.forecast, result.lower_bound, result.upper_bound
        )
    ]

    return SKUChartData(
        sku_id=sku_id,
        sku_name=sku.name,
        atc_code=sku.code,
        model_name=result.model_name,
        historical=historical,
        forecast=forecast_points,
        mape=result.mape,
    )


# ------------------------------------------------------------------ #
# GET /forecasting/skus/{sku_id}/accuracy                             #
# ------------------------------------------------------------------ #

@router.get("/skus/{sku_id}/accuracy", response_model=SKUAccuracy)
def get_sku_accuracy(
    sku_id: int,
    db: Session = Depends(get_db),
    session_id: str = Depends(get_session_id),
    _: Optional[User] = Depends(_optional_user),
) -> SKUAccuracy:
    _resolve_sku(sku_id, session_id, db)

    models_list = ["arima", "xgboost", "prophet", "ensemble"]
    accuracy_rows: list[ModelAccuracy] = []

    for mname in models_list:
        try:
            metrics = engine.calculate_accuracy(db, sku_id, mname)
            accuracy_rows.append(
                ModelAccuracy(
                    model_name=mname,
                    mape=metrics["mape"],
                    wmape=metrics["wmape"],
                    mae=metrics["mae"],
                    rmse=metrics["rmse"],
                    bias=metrics["bias"],
                    sample_size=metrics["sample_size"],
                )
            )
        except Exception:
            accuracy_rows.append(
                ModelAccuracy(
                    model_name=mname,
                    mape=0.0, wmape=0.0, mae=0.0, rmse=0.0, bias=0.0,
                    sample_size=0,
                )
            )

    return SKUAccuracy(sku_id=sku_id, models=accuracy_rows)


# ------------------------------------------------------------------ #
# GET /forecasting/portfolio                                           #
# ------------------------------------------------------------------ #

@router.get("/portfolio", response_model=list[PortfolioItem])
def get_portfolio(
    db: Session = Depends(get_db),
    session_id: str = Depends(get_session_id),
    _: Optional[User] = Depends(_optional_user),
) -> list[PortfolioItem]:
    skus = _session_skus(session_id, db)
    items: list[PortfolioItem] = []

    for sku in skus:
        recent = (
            db.query(SalesRecord.quantity)
            .filter(SalesRecord.sku_id == sku.id)
            .order_by(SalesRecord.sale_date.desc())
            .limit(56)
            .all()
        )
        vals = [r.quantity for r in recent]

        if len(vals) >= 28:
            last_28 = vals[:28]
            prev_28 = vals[28:] if len(vals) >= 56 else vals[:28]
            forecast_28 = round(float(sum(last_28)), 2)
            prev_sum = float(sum(prev_28)) if prev_28 else forecast_28
            if prev_sum == 0:
                trend = "stable"
            elif forecast_28 > prev_sum * 1.05:
                trend = "up"
            elif forecast_28 < prev_sum * 0.95:
                trend = "down"
            else:
                trend = "stable"
        else:
            forecast_28 = round(float(sum(vals)), 2) if vals else None
            trend = "stable"

        eff_session = sku.session_id
        stored = (
            db.query(Forecast.mape)
            .filter(
                Forecast.sku_id == sku.id,
                Forecast.mape.isnot(None),
                Forecast.session_id == eff_session,
            )
            .order_by(Forecast.created_at.desc())
            .first()
        )
        mape_val = float(stored.mape) if stored else None

        items.append(
            PortfolioItem(
                id=sku.id,
                name=sku.name,
                atc_code=sku.code,
                therapy_area=sku.therapeutic_area,
                latest_forecast_28days=forecast_28,
                mape=mape_val,
                trend_direction=trend,
            )
        )

    return items
