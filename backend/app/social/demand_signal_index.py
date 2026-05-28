from sqlalchemy.orm import Session

from app.models.sku import SKU
from app.social.google_trends import GoogleTrendsService, THERAPY_TERMS
from app.social.news_signals import NewsAPIService
from app.social.reddit_signals import RedditService

_SKU_THERAPY: dict[str, str] = {
    "M01AB": "Musculoskeletal",
    "M01AE": "Musculoskeletal",
    "N02BA": "Pain Management",
    "N02BE": "Pain Management",
    "N05B": "CNS",
    "N05C": "CNS",
    "R03": "Respiratory",
    "R06": "Respiratory",
}

# Lazy singletons
_trends_svc: GoogleTrendsService | None = None
_reddit_svc: RedditService | None = None
_news_svc: NewsAPIService | None = None


def _trends() -> GoogleTrendsService:
    global _trends_svc
    if _trends_svc is None:
        _trends_svc = GoogleTrendsService()
    return _trends_svc


def _reddit() -> RedditService:
    global _reddit_svc
    if _reddit_svc is None:
        _reddit_svc = RedditService()
    return _reddit_svc


def _news() -> NewsAPIService:
    global _news_svc
    if _news_svc is None:
        _news_svc = NewsAPIService()
    return _news_svc


class DemandSignalEngine:

    def calculate_index(self, therapy_area: str, geography: str = "IN") -> dict:
        signal = _trends().get_pharma_signal(therapy_area)
        trends_score = signal["signal_score"]

        terms = THERAPY_TERMS.get(therapy_area, ["medicine"])[:2]
        mentions = _reddit().get_weekly_mention_count(terms)
        total_mentions = sum(mentions.values())
        reddit_score = min(100.0, total_mentions * 5.0)

        summary = _news().get_signal_summary()
        news_score = min(
            100.0,
            summary.get("outbreak_count", 0) * 15.0
            + summary.get("shortage_count", 0) * 10.0
            + summary.get("launch_count", 0) * 5.0,
        )

        final_score = round(
            trends_score * 0.4 + reddit_score * 0.3 + news_score * 0.3, 1
        )

        if final_score > 70:
            adj = round(10.0 + (final_score - 70) * 0.5, 1)
        elif final_score < 30:
            adj = round(-5.0 - (30.0 - final_score) * 0.17, 1)
        else:
            adj = 0.0

        return {
            "therapy_area": therapy_area,
            "final_score": final_score,
            "trends_contribution": round(trends_score * 0.4, 1),
            "reddit_contribution": round(reddit_score * 0.3, 1),
            "news_contribution": round(news_score * 0.3, 1),
            "trends_score": round(trends_score, 1),
            "reddit_score": round(reddit_score, 1),
            "news_score": round(news_score, 1),
            "trend_direction": signal["trend_direction"],
            "top_term": signal["top_term"],
            "weekly_chart": signal["weekly_chart"],
            "forecast_adjustment_pct": adj,
        }

    def get_forecast_adjustment(self, sku_id: int, db: Session) -> dict:
        sku = db.query(SKU).filter(SKU.id == sku_id).first()
        if not sku:
            return {
                "sku_id": sku_id, "adjustment_pct": 0.0,
                "confidence": "low", "reasoning": "SKU not found",
            }

        therapy_area = _SKU_THERAPY.get(sku.code, "General")
        idx = self.calculate_index(therapy_area)
        score = idx["final_score"]
        adj = idx["forecast_adjustment_pct"]

        if score > 70:
            confidence = "high"
            reasoning = (
                f"Strong social demand signal ({score:.0f}/100) driven by "
                f"'{idx['top_term']}' search trends and news activity. "
                f"Recommend {adj:+.0f}% demand uplift."
            )
        elif score > 50:
            confidence = "medium"
            reasoning = (
                f"Moderate demand signal ({score:.0f}/100). "
                f"Market conditions stable with slight upward pressure."
            )
        elif score < 30:
            confidence = "medium"
            reasoning = (
                f"Weak demand signal ({score:.0f}/100). "
                f"Social mentions and search interest declining. "
                f"Consider {adj:+.0f}% demand reduction."
            )
        else:
            confidence = "low"
            reasoning = (
                f"Neutral demand signal ({score:.0f}/100). "
                f"No significant external demand drivers detected."
            )

        return {
            "sku_id": sku_id,
            "sku_name": sku.name,
            "atc_code": sku.code,
            "therapy_area": therapy_area,
            "signal_score": score,
            "adjustment_pct": adj,
            "confidence": confidence,
            "reasoning": reasoning,
        }

    def get_all_signals(self) -> list[dict]:
        return sorted(
            [self.calculate_index(area) for area in THERAPY_TERMS],
            key=lambda x: x["final_score"],
            reverse=True,
        )

    def get_ticker_items(self) -> list[dict]:
        items: list[dict] = []

        for sig in _trends().get_all_signals()[:5]:
            direction = sig["trend_direction"]
            sentiment = "positive" if direction == "up" else "negative" if direction == "down" else "neutral"
            arrow_txt = "rising" if direction == "up" else "falling" if direction == "down" else "stable"
            items.append({
                "text": (
                    f"{sig['top_term'].title()} search interest {arrow_txt} | "
                    f"{sig['therapy_area']} signal {sig['signal_score']:.0f}/100"
                ),
                "type": "trend",
                "sentiment": sentiment,
            })

        for h in _news().fetch_health_headlines(page_size=10):
            stype = h.get("signal_type", "general")
            sentiment = (
                "negative" if stype in ("shortage", "outbreak")
                else "positive" if stype == "launch"
                else "neutral"
            )
            items.append({"text": h["title"], "type": "news", "sentiment": sentiment})

        for sig in _reddit().get_outbreak_signals()[:4]:
            if sig["mention_count"] > 1:
                sample = sig["sample_posts"][0] if sig["sample_posts"] else sig["term"]
                items.append({
                    "text": f"Reddit: '{sig['term']}' trending | {sample[:60]}",
                    "type": "reddit",
                    "sentiment": "negative" if sig["signal_strength"] > 0.5 else "neutral",
                })

        return items[:20]
