from datetime import date, datetime
from typing import Optional

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class DemandPlan(Base):
    __tablename__ = "demand_plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    sku_id: Mapped[int] = mapped_column(ForeignKey("skus.id"), index=True)
    period_month: Mapped[date] = mapped_column(Date, index=True)
    system_forecast: Mapped[float] = mapped_column(Float)
    override_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    final_value: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String, default="draft")
    reason: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    changed_by: Mapped[str] = mapped_column(String, default="planner")
    version: Mapped[int] = mapped_column(Integer, default=1)
    session_id: Mapped[str] = mapped_column(String, default="demo", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
