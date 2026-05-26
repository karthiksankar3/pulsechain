from sqlalchemy.orm import Session

from app.models.inventory import InventorySnapshot
from app.models.sku import SKU


def calculate_days_of_supply(quantity_on_hand: float, avg_daily_demand: float) -> float | None:
    """Return days of supply given on-hand quantity and average daily demand.

    Returns None when average daily demand is zero.
    """
    ...


def detect_stockout_risk(
    sku_id: int,
    db: Session,
    horizon_days: int = 30,
) -> dict:
    """Evaluate stockout risk for a SKU over the given horizon.

    Returns a dict with keys: sku_id, risk_level, days_until_stockout, recommended_order_qty.
    """
    ...


def get_reorder_alerts(db: Session) -> list[dict]:
    """Return a list of SKUs that have fallen below their reorder point."""
    ...


def compute_inventory_kpis(db: Session) -> dict:
    """Compute portfolio-level inventory KPIs including total value and fill rate."""
    ...
