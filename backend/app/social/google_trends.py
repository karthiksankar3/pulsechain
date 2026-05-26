from datetime import datetime

import pandas as pd
from pytrends.request import TrendReq


def fetch_trends(
    keywords: list[str],
    timeframe: str = "today 3-m",
    geo: str = "",
) -> pd.DataFrame:
    """Fetch Google Trends interest-over-time data for the given keywords.

    Returns a DataFrame indexed by date with one column per keyword.
    """
    ...


def normalize_trends_score(series: pd.Series) -> pd.Series:
    """Normalize a raw trends series to a 0–1 range."""
    ...


def get_related_queries(keyword: str, geo: str = "") -> dict[str, pd.DataFrame]:
    """Return top and rising related queries for a keyword from Google Trends."""
    ...
