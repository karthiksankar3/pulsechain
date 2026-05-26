from datetime import datetime

from pydantic import BaseModel


class DemandSignalRead(BaseModel):
    id: int
    sku_id: int | None = None
    source: str
    keyword: str
    signal_value: float
    sentiment_score: float | None = None
    volume: int | None = None
    captured_at: datetime
    created_at: datetime

    model_config = {"from_attributes": True}


class DemandSignalIndexRead(BaseModel):
    id: int
    sku_id: int
    index_date: datetime
    composite_score: float
    trends_score: float | None = None
    reddit_score: float | None = None
    news_score: float | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class SignalQueryParams(BaseModel):
    sku_id: int | None = None
    source: str | None = None
    keyword: str | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    limit: int = 100
