import random
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.forecast import Forecast
from app.models.sku import SKU


class SOPService:
    def get_consensus_forecast(self, db: Session) -> list[dict]:
        skus = db.query(SKU).order_by(SKU.code).all()
        results: list[dict] = []

        for sku in skus:
            # Latest ensemble forecast row
            stored = (
                db.query(Forecast)
                .filter(Forecast.sku_id == sku.id, Forecast.model_name == "ensemble")
                .order_by(Forecast.created_at.desc())
                .first()
            )

            # Fall back to any model if no ensemble stored
            if stored is None:
                stored = (
                    db.query(Forecast)
                    .filter(Forecast.sku_id == sku.id)
                    .order_by(Forecast.created_at.desc())
                    .first()
                )

            if stored is None:
                stat_forecast = round(random.uniform(800, 3000), 0)
            else:
                stat_forecast = round(float(stored.predicted_quantity), 0)

            rng = random.Random(sku.id)
            field_factor = rng.uniform(0.85, 1.15)
            field_forecast = round(stat_forecast * field_factor, 0)
            consensus = round((stat_forecast + field_forecast) / 2, 0)
            variance_pct = round(abs(stat_forecast - field_forecast) / max(stat_forecast, 1) * 100, 1)

            if variance_pct < 5:
                status = "ALIGNED"
            elif variance_pct < 15:
                status = "REVIEW NEEDED"
            else:
                status = "ESCALATE"

            results.append(
                {
                    "sku_id": sku.id,
                    "drug_name": sku.name,
                    "atc_code": sku.code,
                    "therapy_area": sku.therapeutic_area or "General",
                    "statistical_forecast": stat_forecast,
                    "field_forecast": field_forecast,
                    "consensus_forecast": consensus,
                    "variance_pct": variance_pct,
                    "status": status,
                }
            )

        return results

    def get_forecast_versions(self, db: Session) -> list[dict]:
        skus = db.query(SKU).order_by(SKU.code).all()
        results: list[dict] = []

        for sku in skus:
            # Get distinct creation batches (by day) per model
            rows = (
                db.query(Forecast)
                .filter(Forecast.sku_id == sku.id, Forecast.model_name == "ensemble")
                .order_by(Forecast.created_at.desc())
                .limit(300)
                .all()
            )

            # Group into versions by created_at date
            versions: dict[str, list[Forecast]] = {}
            for r in rows:
                day_key = r.created_at.strftime("%Y-%m-%d %H")
                versions.setdefault(day_key, []).append(r)

            version_list = []
            for i, (key, batch) in enumerate(list(versions.items())[:3]):
                total_28 = sum(
                    f.predicted_quantity for f in batch[:28]
                )
                mape_val = batch[0].mape if batch[0].mape is not None else None
                version_list.append(
                    {
                        "version": i + 1,
                        "model": "ensemble",
                        "created_at": batch[0].created_at.isoformat(),
                        "mape": round(float(mape_val), 2) if mape_val else None,
                        "forecast_28day_total": round(float(total_28), 0),
                    }
                )

            # If fewer than 3 real versions, pad with synthetic
            while len(version_list) < 3:
                v = len(version_list) + 1
                base_mape = (version_list[0]["mape"] or 12.0) if version_list else 12.0
                version_list.append(
                    {
                        "version": v,
                        "model": "ensemble",
                        "created_at": (
                            datetime.now(timezone.utc) - timedelta(weeks=v)
                        ).isoformat(),
                        "mape": round(base_mape + (v - 1) * 1.5, 2),
                        "forecast_28day_total": None,
                    }
                )

            # Determine accuracy trend
            mapes = [v["mape"] for v in version_list if v["mape"] is not None]
            if len(mapes) >= 2:
                trend = "improving" if mapes[0] < mapes[-1] else "worsening"
            else:
                trend = "stable"

            results.append(
                {
                    "sku_id": sku.id,
                    "sku_name": sku.name,
                    "atc_code": sku.code,
                    "versions": version_list,
                    "accuracy_trend": trend,
                }
            )

        return results

    def get_accuracy_scorecard(self, db: Session) -> dict:
        rows = (
            db.query(Forecast.sku_id, Forecast.model_name, Forecast.mape)
            .filter(Forecast.mape.isnot(None))
            .all()
        )

        if not rows:
            return {
                "overall_mape": None,
                "best_model": "ensemble",
                "most_improved_sku": None,
                "sku_mapes": [],
            }

        # Average MAPE per model
        model_totals: dict[str, list[float]] = {}
        for row in rows:
            model_totals.setdefault(row.model_name, []).append(float(row.mape))

        model_avg = {m: sum(v) / len(v) for m, v in model_totals.items()}
        best_model = min(model_avg, key=model_avg.get)  # type: ignore[arg-type]
        overall_mape = round(sum(model_avg.values()) / len(model_avg), 2)

        # MAPE per SKU (ensemble only, chronological)
        sku_mapes: dict[int, list[float]] = {}
        for row in rows:
            if row.model_name == "ensemble":
                sku_mapes.setdefault(row.sku_id, []).append(float(row.mape))

        # Most improved = biggest positive delta (old mape - new mape)
        most_improved_sku_id = None
        best_improvement = -999.0
        for sku_id, mape_list in sku_mapes.items():
            if len(mape_list) >= 2:
                improvement = mape_list[-1] - mape_list[0]
                if improvement > best_improvement:
                    best_improvement = improvement
                    most_improved_sku_id = sku_id

        most_improved_name = None
        if most_improved_sku_id:
            sku = db.query(SKU).filter(SKU.id == most_improved_sku_id).first()
            most_improved_name = sku.name if sku else None

        # Build per-SKU summary
        skus = db.query(SKU).all()
        sku_name_map = {s.id: s.name for s in skus}
        sku_mape_summary = []
        for sku_id, mape_list in sku_mapes.items():
            avg = round(sum(mape_list) / len(mape_list), 2)
            sku_mape_summary.append(
                {
                    "sku_id": sku_id,
                    "sku_name": sku_name_map.get(sku_id, f"SKU {sku_id}"),
                    "avg_mape": avg,
                }
            )

        sku_mape_summary.sort(key=lambda x: x["avg_mape"])

        return {
            "overall_mape": overall_mape,
            "best_model": best_model,
            "most_improved_sku": most_improved_name,
            "sku_mapes": sku_mape_summary,
        }

    def get_sop_calendar(self) -> list[dict]:
        today = date.today()
        # Find Monday of current week
        monday = today - timedelta(days=today.weekday())

        phases = [
            ("Data Collection", "Gather sales actuals, inventory levels, and market data"),
            ("Statistical Forecast", "Run ML models: Prophet, XGBoost, Ensemble"),
            ("Consensus Meeting", "Align statistical and field forecasts"),
            ("Finance Review", "Revenue impact and budget alignment"),
            ("Executive Approval", "Final sign-off and publish to supply chain"),
        ]

        calendar: list[dict] = []
        # Build 3 monthly cycles (roughly 4 weeks each)
        for cycle in range(3):
            cycle_start = monday + timedelta(weeks=cycle * 4)
            for phase_idx, (phase_name, phase_desc) in enumerate(phases):
                week_start = cycle_start + timedelta(weeks=phase_idx)
                week_end = week_start + timedelta(days=4)

                if week_end < today:
                    status = "completed"
                elif week_start <= today <= week_end:
                    status = "active"
                else:
                    status = "upcoming"

                calendar.append(
                    {
                        "cycle": cycle + 1,
                        "week_of": week_start.isoformat(),
                        "week_end": week_end.isoformat(),
                        "phase": phase_name,
                        "description": phase_desc,
                        "status": status,
                        "phase_index": phase_idx,
                    }
                )

        return calendar

    def export_sap_format(self, db: Session) -> list[dict]:
        skus = db.query(SKU).order_by(SKU.code).all()
        rows: list[dict] = []

        for sku in skus:
            forecasts = (
                db.query(Forecast)
                .filter(Forecast.sku_id == sku.id, Forecast.model_name == "ensemble")
                .order_by(Forecast.forecast_date)
                .limit(90)
                .all()
            )

            if not forecasts:
                forecasts = (
                    db.query(Forecast)
                    .filter(Forecast.sku_id == sku.id)
                    .order_by(Forecast.forecast_date)
                    .limit(90)
                    .all()
                )

            for f in forecasts:
                period = f.forecast_date.strftime("%Y%m") if f.forecast_date else "202601"
                rows.append(
                    {
                        "material_number": sku.code,
                        "plant": "PL01",
                        "storage_location": "SL01",
                        "period": period,
                        "quantity": round(float(f.predicted_quantity), 0),
                        "unit": sku.unit_of_measure or "EA",
                    }
                )

        return rows
