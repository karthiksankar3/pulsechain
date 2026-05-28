import math
from datetime import date, timedelta
from statistics import mean, stdev

import numpy as np
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.inventory import InventorySnapshot
from app.models.sales import SalesRecord
from app.models.sku import SKU

LEAD_TIME_DAYS = 14

Z_VALUES: dict[float, float] = {
    0.80: 0.842,
    0.85: 1.036,
    0.90: 1.282,
    0.91: 1.341,
    0.92: 1.405,
    0.93: 1.476,
    0.94: 1.555,
    0.95: 1.645,
    0.96: 1.751,
    0.97: 1.881,
    0.98: 2.054,
    0.99: 2.326,
}

ATC_PRICES: dict[str, float] = {
    "M01AB": 45.0,
    "M01AE": 38.0,
    "N02BE": 12.0,
    "N02BA": 8.0,
    "N02AA": 95.0,
    "R03": 67.0,
    "N05B": 55.0,
    "N05C": 48.0,
    "R06": 35.0,
}


def _z_value(service_level: float) -> float:
    sl = round(service_level, 2)
    if sl in Z_VALUES:
        return Z_VALUES[sl]
    keys = sorted(Z_VALUES.keys())
    for i in range(len(keys) - 1):
        lo, hi = keys[i], keys[i + 1]
        if lo <= sl <= hi:
            t = (sl - lo) / (hi - lo)
            return Z_VALUES[lo] + t * (Z_VALUES[hi] - Z_VALUES[lo])
    return Z_VALUES[0.95]


def _max_sale_date(sku_id: int, db: Session) -> date | None:
    return db.query(func.max(SalesRecord.sale_date)).filter(
        SalesRecord.sku_id == sku_id
    ).scalar()


def _daily_quantities(sku_id: int, db: Session, days: int) -> list[float]:
    ref = _max_sale_date(sku_id, db)
    if not ref:
        return []
    cutoff = ref - timedelta(days=days)
    records = (
        db.query(SalesRecord)
        .filter(
            SalesRecord.sku_id == sku_id,
            SalesRecord.sale_date > cutoff,
            SalesRecord.sale_date <= ref,
        )
        .all()
    )
    return [r.quantity for r in records]


def _latest_snapshot(sku_id: int, db: Session) -> InventorySnapshot | None:
    return (
        db.query(InventorySnapshot)
        .filter(InventorySnapshot.sku_id == sku_id)
        .order_by(InventorySnapshot.snapshot_at.desc())
        .first()
    )


def _get_session_skus(session_id: str, db: Session) -> list[SKU]:
    """Return SKUs for session; fall back to demo if session has none."""
    skus = db.query(SKU).filter(SKU.session_id == session_id).all()
    if not skus and session_id != "demo":
        skus = db.query(SKU).filter(SKU.session_id == "demo").all()
    return skus


def calculate_dos(sku_id: int, db: Session) -> float:
    records = (
        db.query(SalesRecord)
        .filter(SalesRecord.sku_id == sku_id)
        .order_by(SalesRecord.sale_date)
        .all()
    )
    if not records:
        return 0.0
    total_quantity = sum(r.quantity for r in records)
    min_date = records[0].sale_date
    max_date = records[-1].sale_date
    actual_days = (max_date - min_date).days or 1
    avg_daily = total_quantity / actual_days
    if avg_daily <= 0:
        return 0.0
    snapshot = _latest_snapshot(sku_id, db)
    if not snapshot:
        return 0.0
    return round(snapshot.quantity_on_hand / avg_daily, 1)


def calculate_safety_stock(sku_id: int, service_level: float, db: Session) -> dict:
    qtys = _daily_quantities(sku_id, db, 364)
    demand_std = stdev(qtys) if len(qtys) > 1 else 0.0
    z = _z_value(service_level)
    safety_stock = z * demand_std * math.sqrt(LEAD_TIME_DAYS)
    return {
        "safety_stock_units": round(safety_stock, 1),
        "service_level": service_level,
        "lead_time_days": LEAD_TIME_DAYS,
        "demand_std": round(demand_std, 2),
    }


def calculate_expiry_risk(sku_id: int, db: Session) -> dict:
    snapshot = _latest_snapshot(sku_id, db)
    current_stock = snapshot.quantity_on_hand if snapshot else 0.0

    shelf_days = (sku_id % 8) * 7 + 15
    if snapshot:
        expiry_date = snapshot.snapshot_at.date() + timedelta(days=shelf_days)
        days_until_expiry = (expiry_date - date.today()).days
    else:
        expiry_date = None
        days_until_expiry = None

    qtys_30 = _daily_quantities(sku_id, db, 30)
    daily_demand = sum(qtys_30) / 30 if qtys_30 else 0.0

    if days_until_expiry is not None and current_stock > 0:
        consumable = max(0.0, days_until_expiry) * daily_demand
        units_at_risk = max(0.0, current_stock - consumable)
        risk_score = min(1.0, units_at_risk / current_stock)
    else:
        units_at_risk = 0.0
        risk_score = 0.0

    return {
        "risk_score": round(risk_score, 4),
        "units_at_risk": round(units_at_risk, 1),
        "days_until_expiry": days_until_expiry,
        "expiry_date": expiry_date.isoformat() if expiry_date else None,
    }


def calculate_stockout_probability(sku_id: int, horizon_days: int, db: Session) -> float:
    qtys = _daily_quantities(sku_id, db, 90)
    if not qtys:
        return 0.0
    demand_mean = sum(qtys) / 90
    demand_std = stdev(qtys) if len(qtys) > 1 else demand_mean * 0.3

    snapshot = _latest_snapshot(sku_id, db)
    current_stock = snapshot.quantity_on_hand if snapshot else 0.0

    rng = np.random.default_rng(seed=sku_id * 7 + horizon_days)
    demands = rng.normal(demand_mean, demand_std, size=(1000, horizon_days))
    demands = np.maximum(demands, 0.0)
    cumulative = np.cumsum(demands, axis=1)
    stockouts = np.any(cumulative >= current_stock, axis=1)
    return round(float(stockouts.mean()), 4)


def run_abc_xyz_analysis(db: Session, session_id: str = "demo") -> list[dict]:
    skus = _get_session_skus(session_id, db)

    sku_revenue: dict[int, float] = {}
    sku_cv: dict[int, float] = {}
    total_revenue = 0.0

    for sku in skus:
        price = ATC_PRICES.get(sku.code, 20.0)
        total_qty = (
            db.query(func.sum(SalesRecord.quantity))
            .filter(SalesRecord.sku_id == sku.id)
            .scalar()
        ) or 0.0
        revenue = total_qty * price
        sku_revenue[sku.id] = revenue
        total_revenue += revenue

        records = db.query(SalesRecord).filter(SalesRecord.sku_id == sku.id).all()
        weekly: dict[tuple, float] = {}
        for r in records:
            wk = r.sale_date.isocalendar()[:2]
            weekly[wk] = weekly.get(wk, 0.0) + r.quantity
        weekly_vals = list(weekly.values())
        if len(weekly_vals) > 1:
            avg_w = mean(weekly_vals)
            cv = stdev(weekly_vals) / avg_w if avg_w > 0 else 0.0
        else:
            cv = 0.0
        sku_cv[sku.id] = cv

    sorted_skus = sorted(skus, key=lambda s: sku_revenue[s.id], reverse=True)

    results: list[dict] = []
    cumulative = 0.0
    for sku in sorted_skus:
        revenue = sku_revenue[sku.id]
        rev_pct = revenue / total_revenue * 100 if total_revenue > 0 else 0.0

        if cumulative < 70:
            abc_class = "A"
        elif cumulative < 90:
            abc_class = "B"
        else:
            abc_class = "C"
        cumulative += rev_pct

        cv = sku_cv[sku.id]
        if cv < 0.5:
            xyz_class = "X"
        elif cv <= 1.0:
            xyz_class = "Y"
        else:
            xyz_class = "Z"

        results.append({
            "sku_id": sku.id,
            "sku_name": sku.name,
            "atc_code": sku.code,
            "abc_class": abc_class,
            "xyz_class": xyz_class,
            "cv": round(cv, 3),
            "revenue_contribution_pct": round(rev_pct, 2),
        })

    return results


def get_portfolio_health(db: Session, session_id: str = "demo") -> dict:
    skus = _get_session_skus(session_id, db)

    stockout_risk_count = 0
    expiry_risk_count = 0
    overstock_count = 0
    low_stock_count = 0
    dos_list: list[float] = []
    total_inventory_value = 0.0

    for sku in skus:
        dos = calculate_dos(sku.id, db)
        dos_list.append(dos)

        if dos > 120:
            overstock_count += 1
        elif dos < 30:
            low_stock_count += 1

        sp = calculate_stockout_probability(sku.id, 30, db)
        if sp > 0.3:
            stockout_risk_count += 1

        expiry = calculate_expiry_risk(sku.id, db)
        if expiry["risk_score"] > 0.05:
            expiry_risk_count += 1

        snapshot = _latest_snapshot(sku.id, db)
        price = ATC_PRICES.get(sku.code, 20.0)
        if snapshot:
            total_inventory_value += snapshot.quantity_on_hand * price

    avg_dos = sum(dos_list) / len(dos_list) if dos_list else 0.0

    return {
        "total_skus": len(skus),
        "stockout_risk_count": stockout_risk_count,
        "expiry_risk_count": expiry_risk_count,
        "overstock_count": overstock_count,
        "low_stock_count": low_stock_count,
        "avg_dos": round(avg_dos, 1),
        "total_inventory_value": round(total_inventory_value, 2),
    }
