import random
import time
from datetime import date, timedelta

try:
    from pytrends.request import TrendReq
    _PYTRENDS_OK = True
except Exception:
    _PYTRENDS_OK = False

THERAPY_TERMS: dict[str, list[str]] = {
    "Respiratory": ["respiratory drugs", "fever", "flu", "cold"],
    "Pain Management": ["paracetamol", "ibuprofen", "pain relief", "aspirin"],
    "CNS": ["diazepam", "anxiety medication", "insomnia"],
    "Musculoskeletal": ["diclofenac", "anti-inflammatory"],
    "General": ["fever", "dengue", "covid", "cold"],
}

_BASELINES: dict[str, int] = {
    "paracetamol": 46, "ibuprofen": 38, "diclofenac": 33, "aspirin": 28,
    "diazepam": 22, "fever": 72, "pain relief": 58, "anti-inflammatory": 42,
    "respiratory drugs": 63, "anxiety medication": 31, "flu": 53, "cold": 57,
    "dengue": 40, "covid": 50, "respiratory infection": 55, "pain": 68,
    "inflammation": 44, "anxiety": 37, "insomnia": 27,
}

_STATE_NAMES: dict[str, str] = {
    "IN-MH": "Maharashtra", "IN-DL": "Delhi", "IN-KA": "Karnataka",
    "IN-TN": "Tamil Nadu", "IN-GJ": "Gujarat", "IN-RJ": "Rajasthan",
    "IN-UP": "Uttar Pradesh", "IN-WB": "West Bengal",
}


def _synth_weekly(keyword: str, weeks: int = 12) -> list[dict]:
    baseline = float(_BASELINES.get(keyword.lower(), 35))
    rng = random.Random(sum(ord(c) for c in keyword))
    today = date.today()
    rows: list[dict] = []
    val = baseline
    for i in range(weeks, 0, -1):
        d = today - timedelta(weeks=i)
        val = max(5.0, min(100.0, val + rng.uniform(-10, 12)))
        rows.append({"date": d.isoformat(), "value": round(val, 1)})
    return rows


class GoogleTrendsService:

    def __init__(self) -> None:
        self._demo = True
        if _PYTRENDS_OK:
            try:
                self._pt = TrendReq(hl="en-US", tz=330, timeout=(10, 25), retries=1)
                self._demo = False
            except Exception:
                pass

    def fetch_weekly_trends(
        self, keywords: list[str], timeframe: str = "today 3-m", geo: str = "IN"
    ) -> dict[str, list[dict]]:
        if not self._demo and keywords:
            try:
                result: dict[str, list[dict]] = {}
                for i in range(0, len(keywords), 5):
                    batch = keywords[i: i + 5]
                    self._pt.build_payload(batch, timeframe=timeframe, geo=geo)
                    df = self._pt.interest_over_time()
                    for kw in batch:
                        if df is not None and not df.empty and kw in df.columns:
                            result[kw] = [
                                {"date": str(idx.date()), "value": float(row[kw])}
                                for idx, row in df.iterrows()
                            ]
                        else:
                            result[kw] = _synth_weekly(kw)
                    if i + 5 < len(keywords):
                        time.sleep(2)
                return result
            except Exception:
                pass
        return {kw: _synth_weekly(kw) for kw in keywords}

    def fetch_geographic_breakdown(self, keyword: str, geo: str = "IN") -> dict[str, float]:
        if not self._demo:
            try:
                self._pt.build_payload([keyword], timeframe="today 3-m", geo=geo)
                df = self._pt.interest_by_region(resolution="REGION", inc_low_vol=True)
                if df is not None and not df.empty:
                    rev = {v: k for k, v in _STATE_NAMES.items()}
                    out: dict[str, float] = {}
                    for idx, row in df.iterrows():
                        code = rev.get(str(idx))
                        if code:
                            out[code] = float(row.get(keyword, 0))
                    if out:
                        return out
            except Exception:
                pass
        baseline = float(_BASELINES.get(keyword.lower(), 35))
        rng = random.Random(sum(ord(c) for c in keyword) + 42)
        return {
            code: round(max(10.0, min(100.0, baseline + rng.uniform(-25, 25))), 1)
            for code in _STATE_NAMES
        }

    def fetch_related_queries(self, keyword: str) -> dict:
        _RELATED: dict[str, list[str]] = {
            "fever": ["dengue fever", "fever medicine", "high fever", "fever tablet", "dengue symptoms"],
            "paracetamol": ["paracetamol 500mg", "dolo 650", "crocin", "paracetamol overdose", "pcm tablet"],
            "ibuprofen": ["brufen tablet", "ibuprofen 400mg", "combiflam", "ibuprofen dosage", "advil"],
            "diclofenac": ["diclofenac gel", "voveran", "diclofenac sodium", "voltaren", "diclofenac tablet"],
            "anxiety": ["anxiety medication india", "anxiety tablet", "alprazolam", "benzodiazepine", "anxiolytics"],
        }
        if not self._demo:
            try:
                self._pt.build_payload([keyword], timeframe="today 3-m", geo="IN")
                related = self._pt.related_queries()
                if related and keyword in related:
                    rising = related[keyword].get("rising")
                    if rising is not None and not rising.empty:
                        return {"rising": rising.head(5).to_dict("records")}
            except Exception:
                pass
        queries = _RELATED.get(keyword.lower(), [f"{keyword} india", f"{keyword} tablet", f"{keyword} dosage", f"best {keyword}", f"{keyword} side effects"])
        return {"rising": [{"query": q, "value": random.randint(50, 200)} for q in queries[:5]]}

    def get_pharma_signal(self, therapy_area: str) -> dict:
        terms = THERAPY_TERMS.get(therapy_area, ["fever", "medicine"])
        trend_data = self.fetch_weekly_trends(terms[:4], geo="IN")

        # Build chart data: weekly average across terms
        all_dates: set[str] = set()
        for rows in trend_data.values():
            for r in rows:
                all_dates.add(r["date"])
        sorted_dates = sorted(all_dates)

        weekly_chart: list[dict] = []
        for d in sorted_dates:
            scores = []
            for term in terms:
                for r in trend_data.get(term, []):
                    if r["date"] == d:
                        scores.append(r["value"])
                        break
            avg = round(sum(scores) / len(scores), 1) if scores else 0.0
            weekly_chart.append({"date": d, "score": avg})

        # Signal score = average of last 4 weeks across terms
        latest_scores = []
        for term in terms:
            rows = trend_data.get(term, [])
            if rows:
                recent = [r["value"] for r in rows[-4:]]
                latest_scores.append(sum(recent) / len(recent))
        signal_score = round(sum(latest_scores) / len(latest_scores), 1) if latest_scores else 0.0

        # Trend direction
        top_term = terms[0]
        trend_direction = "stable"
        chart_vals = [r["score"] for r in weekly_chart]
        if len(chart_vals) >= 8:
            recent_avg = sum(chart_vals[-4:]) / 4
            prior_avg = sum(chart_vals[-8:-4]) / 4
            if prior_avg > 0:
                if recent_avg > prior_avg * 1.05:
                    trend_direction = "up"
                elif recent_avg < prior_avg * 0.95:
                    trend_direction = "down"

        return {
            "therapy_area": therapy_area,
            "signal_score": signal_score,
            "top_term": top_term,
            "trend_direction": trend_direction,
            "weekly_chart": weekly_chart,
        }

    def get_all_signals(self) -> list[dict]:
        return sorted(
            [self.get_pharma_signal(area) for area in THERAPY_TERMS],
            key=lambda x: x["signal_score"],
            reverse=True,
        )
