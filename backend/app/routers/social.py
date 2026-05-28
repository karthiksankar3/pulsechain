from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
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
def get_forecast_adjustment(sku_id: int, db: Session = Depends(get_db)) -> dict:
    return _engine.get_forecast_adjustment(sku_id, db)


@router.get("/forecast-adjustments")
def get_all_forecast_adjustments(db: Session = Depends(get_db)) -> list[dict]:
    skus = db.query(SKU).all()
    return [_engine.get_forecast_adjustment(sku.id, db) for sku in skus]
