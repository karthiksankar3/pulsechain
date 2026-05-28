from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class SalesRecord(Base):
    __tablename__ = "sales_records"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    sku_id: Mapped[int] = mapped_column(ForeignKey("skus.id"), index=True, nullable=False)
    region: Mapped[str | None] = mapped_column(String(100))
    channel: Mapped[str | None] = mapped_column(String(100))
    sale_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    revenue: Mapped[float | None] = mapped_column(Float)
    units_returned: Mapped[float] = mapped_column(Float, default=0.0)
    session_id: Mapped[str] = mapped_column(String(50), index=True, default="demo", server_default=text("'demo'"))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    sku = relationship("SKU", backref="sales_records")
