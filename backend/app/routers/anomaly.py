from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.services.anomaly_detection import AnomalyDetector

router = APIRouter(prefix="/anomaly", tags=["anomaly"])
_detector = AnomalyDetector()


@router.get("/summary")
def get_summary(db: Session = Depends(get_db)) -> dict:
    return _detector.get_anomaly_summary(db)


@router.get("/portfolio")
def get_portfolio(
    days_back: int = Query(default=365, ge=1, le=1826),
    db: Session = Depends(get_db),
) -> list[dict]:
    return _detector.get_portfolio_anomalies(db, days_back=days_back)


@router.get("/skus/{sku_id}")
def get_sku_anomalies(
    sku_id: int,
    db: Session = Depends(get_db),
) -> list[dict]:
    return _detector.detect_anomalies(sku_id, db)


@router.get("/skus/{sku_id}/timeline")
def get_timeline(
    sku_id: int,
    db: Session = Depends(get_db),
) -> list[dict]:
    return _detector.get_anomaly_timeline(sku_id, db)


@router.get("/skus/{sku_id}/trends")
def get_trends(
    sku_id: int,
    db: Session = Depends(get_db),
) -> list[dict]:
    return _detector.detect_trend_breaks(sku_id, db)
