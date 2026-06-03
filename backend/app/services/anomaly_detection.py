import statistics
from datetime import date, timedelta
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.sales import SalesRecord
from app.models.sku import SKU


class AnomalyDetector:
    WINDOW = 28  # rolling window in data-points

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _rolling_stats(
        self, values: list[float]
    ) -> list[tuple[Optional[float], Optional[float]]]:
        """Return (mean, std) at each index using a backward-looking window."""
        result: list[tuple[Optional[float], Optional[float]]] = []
        for i in range(len(values)):
            window = values[max(0, i - self.WINDOW): i]
            if len(window) < 4:
                result.append((None, None))
            else:
                mean = statistics.mean(window)
                std = statistics.stdev(window) if len(window) > 1 else 0.0
                result.append((mean, std))
        return result

    def _classify(self, actual: float, mean: float, std: float) -> tuple[str, str, str]:
        """Return (type, probable_cause, recommended_action)."""
        severity = (actual - mean) / std if std else 0

        if actual > mean + 3 * std:
            atype = "DEMAND_SPIKE"
            if severity > 5:
                cause = "Possible epidemic/outbreak event"
                action = "Alert supply chain team — expedite procurement"
            elif severity >= 3:
                cause = "Promotional lift or bulk order"
                action = "Confirm with sales team — adjust safety stock"
            else:
                cause = "Minor demand variation"
                action = "Monitor for repeat — no immediate action"
        else:
            atype = "DEMAND_DROP"
            if actual == 0:
                cause = "Stockout artifact — zero stock period"
                action = "Review inventory records — verify stockout dates"
            elif severity > -3:
                cause = "Demand softening — monitor closely"
                action = "Review market signals — check competitor activity"
            else:
                cause = "Significant demand decline — investigate"
                action = "Urgent review — check distribution and channel issues"

        return atype, cause, action

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def detect_anomalies(self, sku_id: int, db: Session) -> list[dict]:
        rows = (
            db.query(SalesRecord.sale_date, SalesRecord.quantity)
            .filter(SalesRecord.sku_id == sku_id)
            .order_by(SalesRecord.sale_date)
            .all()
        )
        if not rows:
            return []

        dates = [r.sale_date for r in rows]
        values = [r.quantity for r in rows]
        stats = self._rolling_stats(values)
        anomalies: list[dict] = []

        for i, (dt, actual) in enumerate(zip(dates, values)):
            mean, std = stats[i]
            if mean is None or std is None or std == 0:
                continue

            upper = mean + 3 * std
            lower = mean - 2 * std

            if actual <= upper and actual >= lower:
                continue

            severity = round((actual - mean) / std, 2)
            atype, cause, action = self._classify(actual, mean, std)
            deviation_pct = round((actual - mean) / mean * 100, 1) if mean != 0 else 0.0

            anomalies.append({
                "date": str(dt),
                "actual": round(actual, 2),
                "expected": round(mean, 2),
                "deviation_pct": deviation_pct,
                "severity": severity,
                "type": atype,
                "probable_cause": cause,
                "recommended_action": action,
            })

        return anomalies

    def get_portfolio_anomalies(self, db: Session, days_back: int = 365) -> list[dict]:
        # Use last date in dataset as reference so historical data is handled correctly
        latest = db.query(func.max(SalesRecord.sale_date)).scalar()
        if latest:
            cutoff = latest - timedelta(days=days_back)
        else:
            cutoff = date.today() - timedelta(days=days_back)

        skus = db.query(SKU).order_by(SKU.code).all()
        all_anomalies: list[dict] = []

        for sku in skus:
            for a in self.detect_anomalies(sku.id, db):
                if date.fromisoformat(a["date"]) >= cutoff:
                    a["sku_id"] = sku.id
                    a["sku_name"] = sku.name
                    a["atc_code"] = sku.code
                    all_anomalies.append(a)

        all_anomalies.sort(key=lambda x: abs(x["severity"]), reverse=True)
        return all_anomalies

    def get_anomaly_summary(self, db: Session) -> dict:
        # All-time anomalies
        all_anomalies = self.get_portfolio_anomalies(db, days_back=9999)

        if not all_anomalies:
            return {
                "total_anomalies": 0,
                "spikes": 0,
                "drops": 0,
                "critical_anomalies": 0,
                "most_anomalous_sku": "N/A",
                "latest_anomaly": None,
                "anomaly_rate": 0.0,
            }

        spikes = sum(1 for a in all_anomalies if a["type"] == "DEMAND_SPIKE")
        drops = sum(1 for a in all_anomalies if a["type"] == "DEMAND_DROP")
        critical = sum(1 for a in all_anomalies if abs(a["severity"]) > 4)

        sku_counts: dict[str, int] = {}
        for a in all_anomalies:
            sku_counts[a["sku_name"]] = sku_counts.get(a["sku_name"], 0) + 1
        most_anomalous = max(sku_counts, key=lambda k: sku_counts[k])

        sorted_by_date = sorted(all_anomalies, key=lambda x: x["date"], reverse=True)
        latest = sorted_by_date[0]

        total_obs = db.query(func.count(SalesRecord.id)).scalar() or 1
        rate = round(len(all_anomalies) / total_obs * 100, 2)

        return {
            "total_anomalies": len(all_anomalies),
            "spikes": spikes,
            "drops": drops,
            "critical_anomalies": critical,
            "most_anomalous_sku": most_anomalous,
            "latest_anomaly": latest,
            "anomaly_rate": rate,
        }

    def detect_trend_breaks(self, sku_id: int, db: Session) -> list[dict]:
        rows = (
            db.query(SalesRecord.sale_date, SalesRecord.quantity)
            .filter(SalesRecord.sku_id == sku_id)
            .order_by(SalesRecord.sale_date)
            .all()
        )
        if len(rows) < 30:
            return []

        values = [r.quantity for r in rows]
        dates = [r.sale_date for r in rows]

        global_mean = statistics.mean(values)
        global_std = statistics.stdev(values) if len(values) > 1 else 0.0
        if global_std == 0:
            return []

        threshold = 5 * global_std
        cusum = 0.0
        breaks: list[dict] = []

        for dt, val in zip(dates, values):
            prev = cusum
            cusum += val - global_mean

            # Crossed the threshold from below → new trend break
            if abs(cusum) > threshold and abs(prev) <= threshold:
                direction = "UP" if cusum > 0 else "DOWN"
                magnitude = round(abs(cusum) / global_mean * 100, 1) if global_mean > 0 else 0.0
                breaks.append({
                    "date": str(dt),
                    "direction": direction,
                    "magnitude": magnitude,
                    "cusum_value": round(cusum, 2),
                    "description": (
                        f"Sustained {'upward' if direction == 'UP' else 'downward'} trend detected — "
                        f"{magnitude}% cumulative deviation from baseline"
                    ),
                })
                cusum = 0.0  # Reset after detection

        return breaks

    def get_anomaly_timeline(self, sku_id: int, db: Session) -> list[dict]:
        rows = (
            db.query(SalesRecord.sale_date, SalesRecord.quantity)
            .filter(SalesRecord.sku_id == sku_id)
            .order_by(SalesRecord.sale_date)
            .all()
        )
        if not rows:
            return []

        dates = [r.sale_date for r in rows]
        values = [r.quantity for r in rows]
        stats = self._rolling_stats(values)

        # Pre-build anomaly lookup
        anomaly_map: dict[str, str] = {
            a["date"]: a["type"] for a in self.detect_anomalies(sku_id, db)
        }

        timeline: list[dict] = []
        for i, (dt, actual) in enumerate(zip(dates, values)):
            mean, std = stats[i]
            date_str = str(dt)
            is_anomaly = date_str in anomaly_map

            upper = round(mean + 3 * std, 4) if mean is not None and std is not None else None
            lower = round(mean - 2 * std, 4) if mean is not None and std is not None else None
            band = round(upper - lower, 4) if upper is not None and lower is not None else None

            timeline.append({
                "date": date_str,
                "actual": round(actual, 4),
                "rolling_mean": round(mean, 4) if mean is not None else None,
                "upper_bound": upper,
                "lower_bound": lower,
                "band": band,
                "is_anomaly": is_anomaly,
                "anomaly_type": anomaly_map.get(date_str),
            })

        return timeline
