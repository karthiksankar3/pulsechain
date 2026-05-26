from datetime import datetime

from newsapi import NewsApiClient

from app.core.config import get_settings

settings = get_settings()


def get_news_client() -> NewsApiClient:
    """Instantiate and return a NewsAPI client."""
    ...


def fetch_news_articles(
    keywords: list[str],
    from_date: datetime | None = None,
    to_date: datetime | None = None,
    language: str = "en",
    page_size: int = 100,
) -> list[dict]:
    """Fetch news articles matching the given keywords.

    Each dict contains: title, description, url, publishedAt, source.
    """
    ...


def score_article_sentiment(title: str, description: str | None) -> float:
    """Return a sentiment score in [-1, 1] for the given article."""
    ...


def aggregate_news_signal(articles: list[dict]) -> float:
    """Aggregate article-level sentiment into a single news signal value."""
    ...
