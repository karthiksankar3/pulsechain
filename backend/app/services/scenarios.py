from datetime import date, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.forecast import Forecast
from app.models.sales import SalesRecord
from app.models.sku import SKU

SCENARIO_TEMPLATES: dict[str, dict] = {
    "competitor_launch": {
        "demand_impact": -0.20,
        "description": "Competitor launches similar drug",
        "icon": "down",
    },
    "tender_win": {
        "demand_impact": 3.0,
        "description": "Government tender won",
        "icon": "up",
    },
    "price_increase_10pct": {
        "demand_impact": -0.10,
        "description": "10% price increase",
        "icon": "down",
    },
    "epidemic_outbreak": {
        "demand_impact": 2.5,
        "description": "Regional epidemic outbreak",
        "icon": "up",
    },
    "loe_cliff": {
        "demand_impact": -0.50,
        "description": "Loss of exclusivity - patent expiry",
        "icon": "down",
    },
    "promo_campaign": {
        "demand_impact": 0.15,
        "description": "Marketing promotion campaign",
        "icon": "up",
    },
}


class ScenarioService:

    SCENARIO_TEMPLATES = SCENARIO_TEMPLATES

    def _get_baseline(self, sku_id: int, horizon_days: int, db: Session) -> list[dict]:
        # Try latest ensemble forecast with future dates
        latest_created = (
            db.query(func.max(Forecast.created_at))
            .filter(Forecast.sku_id == sku_id, Forecast.model_name == "ensemble")
            .scalar()
        )
        if latest_created:
            from datetime import datetime, timedelta as td
            forecasts = (
                db.query(Forecast)
                .filter(
                    Forecast.sku_id == sku_id,
                    Forecast.model_name == "ensemble",
                    Forecast.created_at >= latest_created - td(minutes=5),
                    Forecast.forecast_date >= date.today(),
                )
                .order_by(Forecast.forecast_date.asc())
                .limit(horizon_days)
                .all()
            )
            if forecasts:
                return [
                    {"date": f.forecast_date.isoformat(), "quantity": round(f.predicted_quantity, 1)}
                    for f in forecasts
                ]

        # Fallback: 30-day moving average from most recent sales
        max_date = (
            db.query(func.max(SalesRecord.sale_date))
            .filter(SalesRecord.sku_id == sku_id)
            .scalar()
        )
        if not max_date:
            today = date.today()
            return [
                {"date": (today + timedelta(days=i)).isoformat(), "quantity": 0.0}
                for i in range(1, horizon_days + 1)
            ]

        cutoff = max_date - timedelta(days=30)
        records = (
            db.query(SalesRecord)
            .filter(
                SalesRecord.sku_id == sku_id,
                SalesRecord.sale_date > cutoff,
                SalesRecord.sale_date <= max_date,
            )
            .all()
        )
        avg_daily = sum(r.quantity for r in records) / 30 if records else 1.0
        today = date.today()
        return [
            {"date": (today + timedelta(days=i)).isoformat(), "quantity": round(avg_daily, 1)}
            for i in range(1, horizon_days + 1)
        ]

    def run_scenario(
        self,
        sku_id: int,
        scenario_type: str,
        custom_impact_pct: float | None,
        db: Session,
    ) -> dict:
        template = SCENARIO_TEMPLATES.get(
            scenario_type,
            {"demand_impact": 0.0, "description": "Custom scenario", "icon": "neutral"},
        )
        impact = custom_impact_pct / 100.0 if custom_impact_pct is not None else template["demand_impact"]

        baseline = self._get_baseline(sku_id, 90, db)

        # Ramp impact in over first 14 days then hold at full effect
        scenario = [
            {
                "date": b["date"],
                "quantity": round(
                    max(0.0, b["quantity"] * (1 + impact * min(1.0, (i + 1) / 14))), 1
                ),
            }
            for i, b in enumerate(baseline)
        ]

        baseline_total = sum(b["quantity"] for b in baseline)
        scenario_total = sum(s["quantity"] for s in scenario)
        delta_units = round(scenario_total - baseline_total, 1)
        delta_pct = round((scenario_total / max(baseline_total, 0.01) - 1) * 100, 1)

        sku = db.query(SKU).filter(SKU.id == sku_id).first()

        return {
            "scenario_type": scenario_type,
            "sku_id": sku_id,
            "sku_name": sku.name if sku else f"SKU {sku_id}",
            "atc_code": sku.code if sku else "",
            "description": template["description"],
            "impact_pct": round(impact * 100, 1),
            "baseline_forecast": baseline,
            "scenario_forecast": scenario,
            "delta_units": delta_units,
            "delta_pct": delta_pct,
        }

    def compare_scenarios(self, sku_id: int, scenario_types: list[str], db: Session) -> dict:
        baseline = self._get_baseline(sku_id, 90, db)
        results = {
            st: self.run_scenario(sku_id, st, None, db) for st in scenario_types[:3]
        }
        sku = db.query(SKU).filter(SKU.id == sku_id).first()
        return {
            "sku_id": sku_id,
            "sku_name": sku.name if sku else f"SKU {sku_id}",
            "baseline": baseline,
            "scenarios": results,
        }
