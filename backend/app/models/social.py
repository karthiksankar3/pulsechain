from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class DemandSignal(Base):
    """Raw demand signal captured from an external social/news source."""

    __tablename__ = "demand_signals"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    sku_id: Mapped[int | None] = mapped_column(ForeignKey("skus.id"), index=True)
    source: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    keyword: Mapped[str] = mapped_column(String(255), nullable=False)
    signal_value: Mapped[float] = mapped_column(Float, nullable=False)
    sentiment_score: Mapped[float | None] = mapped_column(Float)
    volume: Mapped[int | None] = mapped_column(Integer)
    raw_payload: Mapped[str | None] = mapped_column(Text)
    captured_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    sku = relationship("SKU", backref="demand_signals")


class DemandSignalIndex(Base):
    """Aggregated composite demand signal index per SKU per day."""

    __tablename__ = "demand_signal_indices"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    sku_id: Mapped[int] = mapped_column(ForeignKey("skus.id"), index=True, nullable=False)
    index_date: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    composite_score: Mapped[float] = mapped_column(Float, nullable=False)
    trends_score: Mapped[float | None] = mapped_column(Float)
    reddit_score: Mapped[float | None] = mapped_column(Float)
    news_score: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    sku = relationship("SKU", backref="demand_signal_indices")
