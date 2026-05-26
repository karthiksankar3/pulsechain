from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.routers.auth import get_current_user
from app.models.user import User
from app.schemas.social import DemandSignalIndexRead, DemandSignalRead

router = APIRouter(prefix="/social", tags=["social"])


@router.get("/signals", response_model=list[DemandSignalRead])
def list_signals(
    sku_id: int | None = Query(None),
    source: str | None = Query(None),
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[DemandSignalRead]:
    """Return paginated demand signals, optionally filtered by SKU or source."""
    ...


@router.get("/index/{sku_id}", response_model=list[DemandSignalIndexRead])
def get_signal_index(
    sku_id: int,
    days: int = Query(30, le=365),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[DemandSignalIndexRead]:
    """Return the composite demand signal index time series for a SKU."""
    ...


@router.post("/refresh/{sku_id}")
def refresh_signals(
    sku_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Trigger a fresh pull of external signals for the given SKU."""
    ...
