from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.routers.auth import get_current_user
from app.models.user import User

router = APIRouter(prefix="/inventory", tags=["inventory"])


@router.get("/skus/{sku_id}/snapshot")
def get_inventory_snapshot(
    sku_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Return the latest inventory snapshot for a SKU."""
    ...


@router.get("/alerts")
def get_inventory_alerts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    """Return SKUs that are below their reorder point or at risk of stockout."""
    ...


@router.get("/overview")
def get_inventory_overview(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Return a portfolio-level inventory summary with KPIs."""
    ...
