import random
from datetime import datetime, timedelta, timezone

try:
    from newsapi import NewsApiClient
    _NEWSAPI_OK = True
except Exception:
    _NEWSAPI_OK = False

from app.core.config import get_settings

settings = get_settings()

_PLACEHOLDER_KEYS = {"your_newsapi_key_here", "", "your_newsapi_key"}

_SIGNAL_KW: dict[str, list[str]] = {
    "outbreak": ["dengue", "covid", "flu", "epidemic", "outbreak", "surge", "spike", "fever cases"],
    "policy": ["ministry", "cdsco", "drug price", "regulation", "nppa", "dcgi", "essential medicines", "pharma policy"],
    "shortage": ["shortage", "unavailable", "stockout", "supply disruption", "out of stock", "supply crunch"],
    "launch": ["launch", "approval", "new drug", "dcgi approved", "market entry", "generic launch", "approved"],
}

_DEMO_HEADLINES = [
    {"title": "Dengue cases surge in Maharashtra; demand for paracetamol rises 40%", "source": "Times of India", "signal_type": "outbreak", "description": "Maharashtra health dept reports 2x increase in dengue cases vs last year."},
    {"title": "CDSCO approves new generic ibuprofen tablet  |  expected to cut prices by 30%", "source": "Economic Times", "signal_type": "policy", "description": "Generic version expected to increase OTC affordability."},
    {"title": "Paracetamol shortage in Delhi NCR  |  chemists warn of stockout in 2 weeks", "source": "Hindustan Times", "signal_type": "shortage", "description": "Distributors cite API shortage from key manufacturers."},
    {"title": "Domestic pharma launches new respiratory drug combinations ahead of monsoon", "source": "Business Standard", "signal_type": "launch", "description": "New combination drugs targeting monsoon respiratory infections."},
    {"title": "Ministry of Health orders emergency stockpiling of essential fever medicines", "source": "The Hindu", "signal_type": "policy", "description": "MoH directive issued ahead of monsoon and dengue season."},
    {"title": "COVID-19 subvariant causing fever spike across Karnataka and Tamil Nadu", "source": "NDTV", "signal_type": "outbreak", "description": "JN.1 subvariant driving uptick in mild fever and body pain cases."},
    {"title": "India pharma exports up 12%  |  bulk API demand drives ibuprofen price higher", "source": "Mint", "signal_type": "general", "description": "Export surge leads to domestic supply tightening."},
    {"title": "NPPA revises MRP ceiling for diclofenac under drug price control order", "source": "Financial Express", "signal_type": "policy", "description": "New price ceiling effective from July 2026."},
    {"title": "Aspirin supply disruption  |  API import delays from China hit Indian manufacturers", "source": "Reuters India", "signal_type": "shortage", "description": "Supply chain disruptions affect aspirin and salicylate availability."},
    {"title": "DCGI approves Sun Pharma extended-release anti-anxiety formulation", "source": "Pharmabiz", "signal_type": "launch", "description": "New anxiolytic formulation gets green light from regulator."},
    {"title": "Early flu season causes antihistamine demand surge of 40% across India", "source": "Moneycontrol", "signal_type": "outbreak", "description": "Early monsoon flu catching pharmacies off guard."},
    {"title": "Respiratory drug makers increase production capacity 25% for Q3 2026", "source": "Business Standard", "signal_type": "general", "description": "Capacity expansion to meet growing seasonal demand."},
    {"title": "Generic paracetamol market to grow 8% CAGR  |  pharma analyst report", "source": "Pharma Times", "signal_type": "general", "description": "Market growth driven by OTC accessibility and generics push."},
    {"title": "Government hospital analgesic stockout raises patient care concerns", "source": "Indian Express", "signal_type": "shortage", "description": "Shortage of analgesics in public hospitals in 3 states."},
]


def _detect_signal_type(title: str) -> str:
    tl = title.lower()
    for stype, kws in _SIGNAL_KW.items():
        if any(kw in tl for kw in kws):
            return stype
    return "general"


def _time_ago(dt: datetime) -> str:
    delta = datetime.now(timezone.utc) - dt.replace(tzinfo=timezone.utc)
    hours = int(delta.total_seconds() / 3600)
    if hours < 1:
        return "just now"
    if hours < 24:
        return f"{hours}h ago"
    return f"{hours // 24}d ago"


class NewsAPIService:

    def __init__(self) -> None:
        self._demo = True
        if _NEWSAPI_OK and settings.news_api_key not in _PLACEHOLDER_KEYS:
            try:
                self._client = NewsApiClient(api_key=settings.news_api_key)
                self._client.get_top_headlines(country="in", category="health", page_size=1)
                self._demo = False
            except Exception:
                pass

    def _format_article(self, art: dict) -> dict:
        title = art.get("title") or ""
        pub = art.get("publishedAt") or ""
        try:
            pub_dt = datetime.fromisoformat(pub.rstrip("Z"))
        except Exception:
            pub_dt = datetime.utcnow()
        return {
            "title": title,
            "source": (art.get("source") or {}).get("name", "Unknown"),
            "published_at": pub,
            "url": art.get("url") or "#",
            "signal_type": _detect_signal_type(title),
            "description": art.get("description") or "",
            "time_ago": _time_ago(pub_dt),
        }

    def fetch_health_headlines(self, country: str = "in", page_size: int = 20) -> list[dict]:
        if not self._demo:
            try:
                resp = self._client.get_top_headlines(country=country, category="health", page_size=page_size)
                return [self._format_article(a) for a in resp.get("articles", [])]
            except Exception:
                pass

        now = datetime.now(timezone.utc)
        results = []
        for i, h in enumerate(_DEMO_HEADLINES[:page_size]):
            pub_dt = now - timedelta(hours=i * 3 + random.randint(0, 2))
            results.append({
                "title": h["title"],
                "source": h["source"],
                "published_at": pub_dt.isoformat(),
                "url": "#",
                "signal_type": h["signal_type"],
                "description": h.get("description", ""),
                "time_ago": _time_ago(pub_dt),
            })
        return results

    def fetch_pharma_news(self, query: str = "pharmaceutical India") -> list[dict]:
        if not self._demo:
            try:
                resp = self._client.get_everything(q=query, language="en", sort_by="publishedAt", page_size=10)
                return [self._format_article(a) for a in resp.get("articles", [])]
            except Exception:
                pass
        return self.fetch_health_headlines(page_size=10)

    def get_signal_summary(self) -> dict:
        headlines = self.fetch_health_headlines(page_size=20)
        counts: dict[str, int] = {}
        for h in headlines:
            stype = h.get("signal_type", "general")
            counts[stype] = counts.get(stype, 0) + 1
        return {
            "outbreak_count": counts.get("outbreak", 0),
            "policy_count": counts.get("policy", 0),
            "shortage_count": counts.get("shortage", 0),
            "launch_count": counts.get("launch", 0),
            "total": len(headlines),
            "top_headlines": headlines[:5],
        }
