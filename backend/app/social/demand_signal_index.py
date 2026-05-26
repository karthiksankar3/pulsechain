from datetime import datetime

from sqlalchemy.orm import Session

from app.models.social import DemandSignal, DemandSignalIndex
from app.social.google_trends import fetch_trends, normalize_trends_score
from app.social.news_signals import aggregate_news_signal, fetch_news_articles
from app.social.reddit_signals import aggregate_reddit_signal, fetch_subreddit_mentions


DEFAULT_WEIGHTS: dict[str, float] = {
    "trends": 0.4,
    "reddit": 0.3,
    "news": 0.3,
}


def compute_composite_score(
    trends_score: float | None,
    reddit_score: float | None,
    news_score: float | None,
    weights: dict[str, float] = DEFAULT_WEIGHTS,
) -> float:
    """Compute a weighted composite demand signal score from sub-source scores."""
    ...


def build_signal_index(
    sku_id: int,
    keywords: list[str],
    db: Session,
    weights: dict[str, float] = DEFAULT_WEIGHTS,
) -> DemandSignalIndex:
    """Fetch all external signals, compute the composite index, and persist to DB."""
    ...


def get_signal_trend(
    sku_id: int,
    days: int,
    db: Session,
) -> list[DemandSignalIndex]:
    """Return the composite signal index time series for a SKU over the last N days."""
    ...
