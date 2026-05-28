from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_session_id
from app.models.sku import SKU
from app.social.demand_signal_index import DemandSignalEngine
from app.social.google_trends import GoogleTrendsService
from app.social.news_signals import NewsAPIService
from app.social.reddit_signals import RedditService

router = APIRouter(prefix="/social", tags=["social"])

DRUG_TERMS = [
    "paracetamol", "ibuprofen", "diclofenac", "aspirin", "diazepam",
    "fever", "pain relief", "anti-inflammatory", "respiratory drugs", "anxiety medication",
]

_engine = DemandSignalEngine()
_trends = GoogleTrendsService()
_news = NewsAPIService()
_reddit = RedditService()


def _session_skus(session_id: str, db: Session) -> list[SKU]:
    skus = db.query(SKU).filter(SKU.session_id == session_id).all()
    if not skus and session_id != "demo":
        skus = db.query(SKU).filter(SKU.session_id == "demo").all()
    return skus


@router.get("/trends")
def get_trends() -> dict:
    return _trends.fetch_weekly_trends(DRUG_TERMS, geo="IN")


@router.get("/signals")
def get_signals() -> list[dict]:
    return _engine.get_all_signals()


@router.get("/ticker")
def get_ticker() -> list[dict]:
    return _engine.get_ticker_items()


@router.get("/news")
def get_news() -> dict:
    return _news.get_signal_summary()


@router.get("/reddit")
def get_reddit() -> dict:
    drug_terms = ["paracetamol", "ibuprofen", "diclofenac", "fever", "respiratory drugs"]
    return {
        "outbreak_signals": _reddit.get_outbreak_signals(),
        "drug_sentiments": [_reddit.analyze_drug_sentiment(d) for d in drug_terms[:4]],
    }


@router.get("/forecast-adjustment/{sku_id}")
def get_forecast_adjustment(
    sku_id: int,
    db: Session = Depends(get_db),
    session_id: str = Depends(get_session_id),
) -> dict:
    return _engine.get_forecast_adjustment(sku_id, db)


@router.get("/forecast-adjustments")
def get_all_forecast_adjustments(
    db: Session = Depends(get_db),
    session_id: str = Depends(get_session_id),
) -> list[dict]:
    skus = _session_skus(session_id, db)
    return [_engine.get_forecast_adjustment(sku.id, db) for sku in skus]
