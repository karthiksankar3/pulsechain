from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.routers.auth import get_current_user
from app.models.user import User
from app.schemas.forecast import ForecastRequest, ForecastResponse, ForecastRead

router = APIRouter(prefix="/forecasting", tags=["forecasting"])


@router.post("/run", response_model=ForecastResponse)
def run_forecast(
    payload: ForecastRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ForecastResponse:
    """Trigger a forecast run for the given SKU and model configuration."""
    ...


@router.get("/skus/{sku_id}/latest", response_model=ForecastRead)
def get_latest_forecast(
    sku_id: int,
    model_name: str = "prophet",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ForecastRead:
    """Return the most recent stored forecast for a SKU."""
    ...


@router.get("/skus/{sku_id}/history", response_model=list[ForecastRead])
def get_forecast_history(
    sku_id: int,
    limit: int = 10,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ForecastRead]:
    """Return paginated forecast history for a SKU."""
    ...
