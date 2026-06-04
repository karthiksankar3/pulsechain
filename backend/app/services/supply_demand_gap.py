from __future__ import annotations

from datetime import date, timedelta

import numpy as np
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.ml.forecasting import ForecastingEngine
from app.models.forecast import Forecast
from app.models.inventory import InventorySnapshot
from app.models.sku import SKU

ATC_PRICES: dict[str, float] = {
    "M01AB": 45.0,
    "M01AE": 38.0,
    "N02BE": 12.0,
    "N02BA": 8.0,
    "N02AA": 95.0,
    "R03": 67.0,
    "N05B": 55.0,
    "N05C": 48.0,
    "R06": 35.0,
}

_engine = ForecastingEngine()


class SupplyDemandGapAnalyzer:
    HORIZON_WEEKS = 12
    HORIZON_DAYS = 84  # 12 × 7

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _get_daily_forecasts(self, sku_id: int, db: Session) -> list[float]:
        latest_created_at = (
            db.query(func.max(Forecast.created_at))
            .filter(Forecast.sku_id == sku_id, Forecast.model_name == "ensemble")
            .scalar()
        )

        if latest_created_at is not None:
            cutoff = latest_created_at - timedelta(minutes=5)
            rows = (
                db.query(Forecast.forecast_date, Forecast.predicted_quantity)
                .filter(
                    Forecast.sku_id == sku_id,
                    Forecast.model_name == "ensemble",
                    Forecast.created_at >= cutoff,
                )
                .order_by(Forecast.forecast_date)
                .limit(self.HORIZON_DAYS)
                .all()
            )
            if rows:
                forecasts = [max(float(r.predicted_quantity), 0.0) for r in rows]
                if len(forecasts) < self.HORIZON_DAYS:
                    avg = float(np.mean(forecasts)) if forecasts else 0.0
                    forecasts.extend([avg] * (self.HORIZON_DAYS - len(forecasts)))
                return forecasts[: self.HORIZON_DAYS]

        # Fallback: 28-day moving average from sales history
        try:
            df = _engine.prepare_time_series(db, sku_id)
            daily_avg = float(df["y"].tail(28).mean()) if len(df) >= 28 else float(df["y"].mean())
        except Exception:
            daily_avg = 0.0

        return [max(daily_avg, 0.0)] * self.HORIZON_DAYS

    def _get_current_stock(self, sku_id: int, db: Session) -> float:
        snapshot = (
            db.query(InventorySnapshot)
            .filter(InventorySnapshot.sku_id == sku_id)
            .order_by(InventorySnapshot.snapshot_at.desc())
            .first()
        )
        return float(snapshot.quantity_on_hand) if snapshot else 0.0

    # ------------------------------------------------------------------
    # Public methods
    # ------------------------------------------------------------------

    def recommended_order_qty(self, gap: float, weekly_demand: float) -> float:
        if gap >= 0:
            return 0.0
        return round(abs(gap) + (weekly_demand * 2), 1)

    def calculate_gap(self, sku_id: int, db: Session) -> dict:
        sku = db.query(SKU).filter(SKU.id == sku_id).first()
        if not sku:
            return {}

        daily_forecasts = self._get_daily_forecasts(sku_id, db)
        current_stock = self._get_current_stock(sku_id, db)
        today = date.today()

        weeks: list[dict] = []
        cumulative_demand = 0.0
        total_deficit = 0.0
        first_stockout_week: int | None = None

        for w in range(self.HORIZON_WEEKS):
            week_start = today + timedelta(days=w * 7)
            week_end = today + timedelta(days=w * 7 + 6)
            day_slice = daily_forecasts[w * 7 : w * 7 + 7]
            weekly_demand = sum(day_slice)

            available_supply = current_stock - cumulative_demand
            gap = available_supply - weekly_demand
            gap_type = "SURPLUS" if gap > 0 else "DEFICIT"

            if gap < -(weekly_demand * 0.5):
                gap_severity = "CRITICAL"
            elif gap < 0:
                gap_severity = "HIGH"
            elif gap < weekly_demand * 0.2:
                gap_severity = "LOW"
            else:
                gap_severity = "HEALTHY"

            if gap_type == "DEFICIT" and first_stockout_week is None:
                first_stockout_week = w + 1

            if gap < 0:
                total_deficit += abs(gap)

            rec_order = self.recommended_order_qty(gap, weekly_demand)

            weeks.append({
                "week_number": w + 1,
                "week_start": week_start.isoformat(),
                "week_end": week_end.isoformat(),
                "demand_forecast": round(weekly_demand, 1),
                "available_supply": round(available_supply, 1),
                "gap": round(gap, 1),
                "gap_type": gap_type,
                "gap_severity": gap_severity,
                "recommended_order_qty": round(rec_order, 1),
            })

            cumulative_demand += weekly_demand

        total_12_week_demand = cumulative_demand
        price = ATC_PRICES.get(sku.code, 20.0)
        gap_12_weeks = round(current_stock - total_12_week_demand, 1)

        recommended_immediate_order = 0.0
        if weeks and weeks[0]["gap"] < 0:
            recommended_immediate_order = self.recommended_order_qty(
                weeks[0]["gap"], weeks[0]["demand_forecast"]
            )

        return {
            "sku_id": sku_id,
            "sku_name": sku.name,
            "atc_code": sku.code,
            "current_stock": round(current_stock, 1),
            "unit_price": price,
            "weeks": weeks,
            "total_12_week_demand": round(total_12_week_demand, 1),
            "gap_12_weeks": gap_12_weeks,
            "total_deficit": round(total_deficit, 1),
            "first_stockout_week": first_stockout_week,
            "recommended_immediate_order": round(recommended_immediate_order, 1),
        }

    def get_portfolio_gaps(self, db: Session) -> list[dict]:
        skus = db.query(SKU).filter(SKU.session_id == "demo").order_by(SKU.code).all()
        if not skus:
            skus = db.query(SKU).order_by(SKU.code).all()

        results: list[dict] = []
        for sku in skus:
            gap_data = self.calculate_gap(sku.id, db)
            if not gap_data:
                continue

            is_critical = any(w["gap_severity"] == "CRITICAL" for w in gap_data["weeks"])
            is_high = any(w["gap_severity"] == "HIGH" for w in gap_data["weeks"])
            all_surplus = all(w["gap_type"] == "SURPLUS" for w in gap_data["weeks"])

            if is_critical:
                overall_status = "CRITICAL"
                urgency_rank = 0
            elif is_high:
                overall_status = "DEFICIT"
                urgency_rank = 1
            elif not all_surplus:
                overall_status = "LOW"
                urgency_rank = 2
            else:
                overall_status = "HEALTHY"
                urgency_rank = 3

            price = ATC_PRICES.get(sku.code, 20.0)
            total_rec_order_qty = sum(w["recommended_order_qty"] for w in gap_data["weeks"])

            results.append({
                **gap_data,
                "overall_status": overall_status,
                "urgency_rank": urgency_rank,
                "total_recommended_order_qty": round(total_rec_order_qty, 1),
                "total_recommended_order_value": round(total_rec_order_qty * price, 2),
                "needs_immediate_action": is_critical or is_high,
            })

        results.sort(key=lambda x: x["urgency_rank"])
        return results

    def get_gap_summary(self, db: Session) -> dict:
        portfolio = self.get_portfolio_gaps(db)

        critical_count = sum(1 for p in portfolio if p["overall_status"] == "CRITICAL")
        deficit_count = sum(1 for p in portfolio if p["overall_status"] == "DEFICIT")
        healthy_count = sum(
            1 for p in portfolio if p["overall_status"] in ("HEALTHY", "LOW", "SURPLUS")
        )
        surplus_count = sum(
            1 for p in portfolio
            if p["overall_status"] == "HEALTHY"
            and all(w["gap_type"] == "SURPLUS" for w in p["weeks"])
        )
        total_deficit_units = sum(p["total_deficit"] for p in portfolio)
        total_surplus_units = sum(
            sum(w["gap"] for w in p["weeks"] if w["gap"] > 0) for p in portfolio
        )
        total_rec_order_value = sum(p["total_recommended_order_value"] for p in portfolio)

        stockout_weeks = [
            p["first_stockout_week"]
            for p in portfolio
            if p["first_stockout_week"] is not None
        ]
        weeks_to_first_stockout = min(stockout_weeks) if stockout_weeks else None

        return {
            "critical_count": critical_count,
            "deficit_count": deficit_count,
            "healthy_count": healthy_count,
            "surplus_count": surplus_count,
            "total_deficit_units": round(total_deficit_units, 1),
            "total_surplus_units": round(total_surplus_units, 1),
            "total_recommended_order_value": round(total_rec_order_value, 2),
            "weeks_to_first_stockout": weeks_to_first_stockout,
        }

    def get_gap_waterfall(self, sku_id: int, db: Session) -> list[dict]:
        gap_data = self.calculate_gap(sku_id, db)
        if not gap_data:
            return []

        result: list[dict] = []
        cumulative = gap_data["current_stock"]

        result.append({
            "label": "Opening",
            "value": round(cumulative, 1),
            "type": "opening",
            "cumulative": round(cumulative, 1),
        })

        for w in gap_data["weeks"]:
            demand = w["demand_forecast"]
            cumulative = round(cumulative - demand, 1)
            result.append({
                "label": f"Wk {w['week_number']}",
                "value": round(-demand, 1),
                "type": "outflow",
                "cumulative": cumulative,
            })

        return result
