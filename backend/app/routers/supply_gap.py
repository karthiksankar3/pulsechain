from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.services.supply_demand_gap import SupplyDemandGapAnalyzer

router = APIRouter(prefix="/supply-gap", tags=["supply-gap"])
_analyzer = SupplyDemandGapAnalyzer()


@router.get("/summary")
def get_summary(db: Session = Depends(get_db)) -> dict:
    return _analyzer.get_gap_summary(db)


@router.get("/portfolio")
def get_portfolio(db: Session = Depends(get_db)) -> list[dict]:
    return _analyzer.get_portfolio_gaps(db)


@router.get("/skus/{sku_id}")
def get_sku_gap(sku_id: int, db: Session = Depends(get_db)) -> dict:
    result = _analyzer.calculate_gap(sku_id, db)
    if not result:
        raise HTTPException(status_code=404, detail=f"SKU {sku_id} not found")
    return result


@router.get("/skus/{sku_id}/waterfall")
def get_waterfall(sku_id: int, db: Session = Depends(get_db)) -> list[dict]:
    result = _analyzer.get_gap_waterfall(sku_id, db)
    if not result:
        raise HTTPException(status_code=404, detail=f"SKU {sku_id} not found")
    return result
