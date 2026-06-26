from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class DemandPlanHistory(Base):
    __tablename__ = "demand_plan_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    demand_plan_id: Mapped[int] = mapped_column(ForeignKey("demand_plans.id"), index=True)
    action: Mapped[str] = mapped_column(String)
    old_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    new_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    changed_by: Mapped[str] = mapped_column(String, default="planner")
    session_id: Mapped[str] = mapped_column(String, default="demo", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
