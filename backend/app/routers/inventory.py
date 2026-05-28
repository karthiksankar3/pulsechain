from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.inventory import InventorySnapshot
from app.models.sku import SKU
from app.services.inventory import (
    ATC_PRICES,
    _latest_snapshot,
    calculate_dos,
    calculate_expiry_risk,
    calculate_safety_stock,
    calculate_stockout_probability,
    get_portfolio_health,
    run_abc_xyz_analysis,
)

router = APIRouter(prefix="/inventory", tags=["inventory"])


@router.get("/health")
def get_health(db: Session = Depends(get_db)) -> dict:
    return get_portfolio_health(db)


@router.get("/skus")
def list_skus(db: Session = Depends(get_db)) -> list[dict]:
    skus = db.query(SKU).all()
    abc_xyz_map = {item["sku_id"]: item for item in run_abc_xyz_analysis(db)}

    results: list[dict] = []
    for sku in skus:
        dos = calculate_dos(sku.id, db)
        ss = calculate_safety_stock(sku.id, 0.95, db)
        sp30 = calculate_stockout_probability(sku.id, 30, db)
        expiry = calculate_expiry_risk(sku.id, db)
        az = abc_xyz_map.get(sku.id, {})

        snapshot = _latest_snapshot(sku.id, db)
        current_stock = snapshot.quantity_on_hand if snapshot else 0.0

        risk_pct = sp30 * 100
        if risk_pct > 30 or dos < 15:
            status = "CRITICAL"
        elif risk_pct > 10 or dos < 30:
            status = "AT RISK"
        else:
            status = "HEALTHY"

        results.append({
            "sku_id": sku.id,
            "sku_name": sku.name,
            "atc_code": sku.code,
            "therapy_area": sku.therapeutic_area,
            "dos": dos,
            "safety_stock": ss["safety_stock_units"],
            "stockout_probability_30d": sp30,
            "expiry_risk_score": expiry["risk_score"],
            "units_at_risk": expiry["units_at_risk"],
            "days_until_expiry": expiry["days_until_expiry"],
            "expiry_date": expiry["expiry_date"],
            "abc_class": az.get("abc_class", "C"),
            "xyz_class": az.get("xyz_class", "Y"),
            "cv": az.get("cv", 0.0),
            "current_stock": current_stock,
            "status": status,
        })

    results.sort(key=lambda x: x["stockout_probability_30d"], reverse=True)
    return results


@router.get("/skus/{sku_id}")
def get_sku_detail(sku_id: int, db: Session = Depends(get_db)) -> dict:
    sku = db.query(SKU).filter(SKU.id == sku_id).first()
    if not sku:
        raise HTTPException(status_code=404, detail="SKU not found")

    dos = calculate_dos(sku_id, db)
    ss_90 = calculate_safety_stock(sku_id, 0.90, db)
    ss_95 = calculate_safety_stock(sku_id, 0.95, db)
    ss_99 = calculate_safety_stock(sku_id, 0.99, db)
    sp30 = calculate_stockout_probability(sku_id, 30, db)
    sp60 = calculate_stockout_probability(sku_id, 60, db)
    sp90 = calculate_stockout_probability(sku_id, 90, db)
    expiry = calculate_expiry_risk(sku_id, db)

    abc_xyz_all = run_abc_xyz_analysis(db)
    az = next((x for x in abc_xyz_all if x["sku_id"] == sku_id), {})

    snapshot = _latest_snapshot(sku_id, db)
    current_stock = snapshot.quantity_on_hand if snapshot else 0.0

    return {
        "sku_id": sku_id,
        "sku_name": sku.name,
        "atc_code": sku.code,
        "therapy_area": sku.therapeutic_area,
        "current_stock": current_stock,
        "dos": dos,
        "safety_stock": {
            "90pct": ss_90,
            "95pct": ss_95,
            "99pct": ss_99,
        },
        "stockout_probability": {
            "30d": sp30,
            "60d": sp60,
            "90d": sp90,
        },
        "expiry_risk": expiry,
        "abc_xyz": az,
    }


@router.get("/abc-xyz")
def get_abc_xyz(db: Session = Depends(get_db)) -> list[dict]:
    return run_abc_xyz_analysis(db)


@router.get("/safety-stock/{sku_id}")
def get_safety_stock(
    sku_id: int,
    service_level: float = Query(default=0.95, ge=0.80, le=0.99),
    db: Session = Depends(get_db),
) -> dict:
    sku = db.query(SKU).filter(SKU.id == sku_id).first()
    if not sku:
        raise HTTPException(status_code=404, detail="SKU not found")

    result = calculate_safety_stock(sku_id, service_level, db)
    result["sku_name"] = sku.name
    result["atc_code"] = sku.code
    result["explanation"] = (
        f"At {int(service_level * 100)}% service level with "
        f"{result['lead_time_days']}-day lead time and "
        f"+/-{result['demand_std']:.1f} units/day demand variability, "
        f"keep {result['safety_stock_units']:.0f} units as safety buffer."
    )
    return result
