from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Forecast(Base):
    __tablename__ = "forecasts"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    sku_id: Mapped[int] = mapped_column(ForeignKey("skus.id"), index=True, nullable=False)
    model_name: Mapped[str] = mapped_column(String(100), nullable=False)
    forecast_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    horizon_days: Mapped[int] = mapped_column(Integer, default=90)
    predicted_quantity: Mapped[float] = mapped_column(Float, nullable=False)
    lower_bound: Mapped[float | None] = mapped_column(Float)
    upper_bound: Mapped[float | None] = mapped_column(Float)
    confidence_level: Mapped[float] = mapped_column(Float, default=0.95)
    mape: Mapped[float | None] = mapped_column(Float)
    rmse: Mapped[float | None] = mapped_column(Float)
    session_id: Mapped[str] = mapped_column(String(50), index=True, default="demo", server_default=text("'demo'"))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    sku = relationship("SKU", backref="forecasts")
