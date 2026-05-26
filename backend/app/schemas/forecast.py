from datetime import date, datetime

from pydantic import BaseModel


class ForecastRequest(BaseModel):
    sku_id: int
    model_name: str = "prophet"
    horizon_days: int = 90
    confidence_level: float = 0.95


class ForecastPoint(BaseModel):
    forecast_date: date
    predicted_quantity: float
    lower_bound: float | None = None
    upper_bound: float | None = None


class ForecastResponse(BaseModel):
    sku_id: int
    model_name: str
    horizon_days: int
    confidence_level: float
    points: list[ForecastPoint]
    mape: float | None = None
    rmse: float | None = None
    generated_at: datetime

    model_config = {"from_attributes": True}


class ForecastRead(BaseModel):
    id: int
    sku_id: int
    model_name: str
    forecast_date: date
    predicted_quantity: float
    lower_bound: float | None = None
    upper_bound: float | None = None
    confidence_level: float
    mape: float | None = None
    rmse: float | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
