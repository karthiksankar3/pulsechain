import random
from datetime import datetime, timedelta, timezone

try:
    import praw
    _PRAW_OK = True
except Exception:
    _PRAW_OK = False

from app.core.config import get_settings

settings = get_settings()

_PLACEHOLDER_IDS = {"your_reddit_client_id", "", "your_reddit_client_id_here"}
TARGET_SUBREDDITS = ["india", "IndiaHealth", "pharmacy", "medicine", "health"]

_NEGATIVE_KW = {
    "shortage", "unavailable", "stockout", "out of stock", "recall",
    "adverse", "death", "toxic", "overdose", "side effect",
}

_DEMO_POSTS = [
    {"title": "Can't find paracetamol 500mg anywhere in South Delhi pharmacies", "subreddit": "india", "score": 312},
    {"title": "Ibuprofen works better than paracetamol for my back pain  |  personal experience", "subreddit": "IndiaHealth", "score": 87},
    {"title": "Dengue season is back  |  fever medicines flying off shelves in Mumbai", "subreddit": "india", "score": 456},
    {"title": "Diclofenac gel  |  does the generic work as well as Voveran?", "subreddit": "IndiaHealth", "score": 65},
    {"title": "Paracetamol shortage in Mumbai too  |  pharmacist says supply in 2 weeks", "subreddit": "india", "score": 289},
    {"title": "Doctor prescribed Diazepam for my anxiety  |  long term effects?", "subreddit": "medicine", "score": 34},
    {"title": "Respiratory medicines shortage ahead of monsoon  |  should I stock up?", "subreddit": "IndiaHealth", "score": 178},
    {"title": "Anti-inflammatory drug prices hiked again  |  NPPA intervention needed", "subreddit": "india", "score": 234},
    {"title": "Best OTC pain relief options: Aspirin vs Ibuprofen vs Paracetamol", "subreddit": "pharmacy", "score": 145},
    {"title": "COVID wave causing run on antipyretics across north India", "subreddit": "india", "score": 567},
    {"title": "Anxiety medication availability improving after govt directive", "subreddit": "medicine", "score": 92},
    {"title": "Diclofenac side effects after 3 months of use  |  my experience", "subreddit": "IndiaHealth", "score": 43},
    {"title": "Government hospitals running low on essential medicines again", "subreddit": "india", "score": 389},
    {"title": "Aspirin for heart health  |  cardiologist explains the dosage", "subreddit": "health", "score": 123},
    {"title": "Flu season started early  |  which antihistamine works best?", "subreddit": "IndiaHealth", "score": 76},
    {"title": "Dengue outbreak in Bengaluru  |  paracetamol recommended by doctors", "subreddit": "india", "score": 521},
    {"title": "Respiratory drug shortage in tier-2 cities during monsoon", "subreddit": "pharmacy", "score": 167},
    {"title": "Insomnia treatment in India  |  what options are available?", "subreddit": "IndiaHealth", "score": 54},
]


def _sentiment(title: str, score: int) -> float:
    tl = title.lower()
    if any(kw in tl for kw in _NEGATIVE_KW):
        return round(random.uniform(-0.8, -0.3), 2)
    if score > 200:
        return round(random.uniform(0.1, 0.6), 2)
    return round(random.uniform(-0.15, 0.3), 2)


class RedditService:

    def __init__(self) -> None:
        self._demo = True
        if _PRAW_OK and settings.reddit_client_id not in _PLACEHOLDER_IDS:
            try:
                self._reddit = praw.Reddit(
                    client_id=settings.reddit_client_id,
                    client_secret=settings.reddit_client_secret,
                    user_agent=settings.reddit_user_agent,
                    read_only=True,
                )
                list(self._reddit.subreddit("india").hot(limit=1))
                self._demo = False
            except Exception:
                pass

    def fetch_mentions(self, term: str, limit: int = 50) -> list[dict]:
        if not self._demo:
            try:
                combined = self._reddit.subreddit("+".join(TARGET_SUBREDDITS))
                results = []
                for post in combined.search(term, limit=limit, sort="new"):
                    results.append({
                        "title": post.title,
                        "subreddit": post.subreddit.display_name,
                        "score": post.score,
                        "created_utc": post.created_utc,
                        "url": f"https://reddit.com{post.permalink}",
                        "sentiment_score": _sentiment(post.title, post.score),
                    })
                return results
            except Exception:
                pass

        # Synthetic: match by term keyword in title
        term_lower = term.lower()
        now = datetime.now(timezone.utc)
        matched = [
            p for p in _DEMO_POSTS
            if term_lower in p["title"].lower()
        ] or _DEMO_POSTS[:4]

        return [
            {
                "title": p["title"],
                "subreddit": p["subreddit"],
                "score": p["score"],
                "created_utc": (now - timedelta(days=random.randint(0, 7))).timestamp(),
                "url": f"https://reddit.com/r/{p['subreddit']}",
                "sentiment_score": _sentiment(p["title"], p["score"]),
            }
            for p in matched[:limit]
        ]

    def get_weekly_mention_count(self, terms: list[str]) -> dict[str, int]:
        return {term: len(self.fetch_mentions(term, limit=20)) for term in terms}

    def analyze_drug_sentiment(self, drug_name: str) -> dict:
        mentions = self.fetch_mentions(drug_name, limit=30)
        if not mentions:
            return {
                "drug_name": drug_name, "total_mentions": 0,
                "positive_pct": 0.0, "negative_pct": 0.0, "neutral_pct": 100.0,
                "top_posts": [],
            }
        pos = [m for m in mentions if m["sentiment_score"] > 0.1]
        neg = [m for m in mentions if m["sentiment_score"] < -0.1]
        total = len(mentions)
        return {
            "drug_name": drug_name,
            "total_mentions": total,
            "positive_pct": round(len(pos) / total * 100, 1),
            "negative_pct": round(len(neg) / total * 100, 1),
            "neutral_pct": round((total - len(pos) - len(neg)) / total * 100, 1),
            "top_posts": sorted(mentions, key=lambda x: x["score"], reverse=True)[:3],
        }

    def get_outbreak_signals(self) -> list[dict]:
        outbreak_terms = [
            "dengue", "covid", "flu outbreak", "viral fever",
            "respiratory infection", "fever surge",
        ]
        signals = []
        for term in outbreak_terms:
            mentions = self.fetch_mentions(term, limit=20)
            count = len(mentions)
            signals.append({
                "term": term,
                "mention_count": count,
                "signal_strength": round(min(1.0, count / 10), 2),
                "sample_posts": [m["title"] for m in mentions[:2]],
            })
        return sorted(signals, key=lambda x: x["mention_count"], reverse=True)
