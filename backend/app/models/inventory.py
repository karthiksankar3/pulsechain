from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class InventorySnapshot(Base):
    __tablename__ = "inventory_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    sku_id: Mapped[int] = mapped_column(ForeignKey("skus.id"), index=True, nullable=False)
    warehouse_code: Mapped[str | None] = mapped_column(String(100))
    snapshot_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    quantity_on_hand: Mapped[float] = mapped_column(Float, nullable=False)
    quantity_reserved: Mapped[float] = mapped_column(Float, default=0.0)
    quantity_in_transit: Mapped[float] = mapped_column(Float, default=0.0)
    days_of_supply: Mapped[float | None] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(50), default="normal")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    sku = relationship("SKU", backref="inventory_snapshots")
