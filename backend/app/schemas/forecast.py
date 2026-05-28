from datetime import date, datetime

from pydantic import BaseModel


class ForecastRequest(BaseModel):
    sku_id: int
    model_name: str = "ensemble"
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


class SKUResponse(BaseModel):
    id: int
    name: str
    atc_code: str
    therapy_area: str | None = None

    model_config = {"from_attributes": True}


class HistoricalPoint(BaseModel):
    date: str
    actual: float


class ForecastChartPoint(BaseModel):
    date: str
    forecast: float
    lower: float
    upper: float


class SKUChartData(BaseModel):
    sku_id: int
    sku_name: str
    atc_code: str
    model_name: str
    historical: list[HistoricalPoint]
    forecast: list[ForecastChartPoint]
    mape: float | None = None


class ModelAccuracy(BaseModel):
    model_name: str
    mape: float
    wmape: float
    mae: float
    rmse: float
    bias: float
    sample_size: int


class SKUAccuracy(BaseModel):
    sku_id: int
    models: list[ModelAccuracy]


class PortfolioItem(BaseModel):
    id: int
    name: str
    atc_code: str
    therapy_area: str | None = None
    latest_forecast_28days: float | None = None
    mape: float | None = None
    trend_direction: str | None = None
