from datetime import datetime

import praw
from praw.models import Submission

from app.core.config import get_settings

settings = get_settings()


def get_reddit_client() -> praw.Reddit:
    """Instantiate and return an authenticated PRAW Reddit client."""
    ...


def fetch_subreddit_mentions(
    keywords: list[str],
    subreddits: list[str] | None = None,
    limit: int = 100,
    after_utc: float | None = None,
) -> list[dict]:
    """Search Reddit for keyword mentions and return structured post data.

    Each dict contains: id, title, score, num_comments, created_utc, subreddit, url.
    """
    ...


def score_post_sentiment(text: str) -> float:
    """Return a sentiment score in [-1, 1] for the given Reddit post text."""
    ...


def aggregate_reddit_signal(mentions: list[dict]) -> float:
    """Aggregate a list of mention dicts into a single signal value."""
    ...
