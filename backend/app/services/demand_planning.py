from __future__ import annotations

from datetime import date, timedelta
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.demand_plan import DemandPlan
from app.models.demand_plan_history import DemandPlanHistory
from app.models.forecast import Forecast
from app.models.sales import SalesRecord
from app.models.sku import SKU


def _month_start(d: date) -> date:
    return d.replace(day=1)


def _next_month(d: date) -> date:
    if d.month == 12:
        return date(d.year + 1, 1, 1)
    return date(d.year, d.month + 1, 1)


def _month_end(d: date) -> date:
    return _next_month(d) - timedelta(days=1)


def _get_ensemble_forecasts(sku_id: int, session_id: str, db: Session) -> list[tuple[date, float]]:
    """Return (forecast_date, predicted_quantity) rows for the latest ensemble run."""
    for sid in ([session_id, "demo"] if session_id != "demo" else ["demo"]):
        latest_created_at = (
            db.query(func.max(Forecast.created_at))
            .filter(
                Forecast.sku_id == sku_id,
                Forecast.model_name == "ensemble",
                Forecast.session_id == sid,
            )
            .scalar()
        )
        if latest_created_at is not None:
            cutoff = latest_created_at - timedelta(minutes=5)
            rows = (
                db.query(Forecast.forecast_date, Forecast.predicted_quantity)
                .filter(
                    Forecast.sku_id == sku_id,
                    Forecast.model_name == "ensemble",
                    Forecast.session_id == sid,
                    Forecast.created_at >= cutoff,
                )
                .order_by(Forecast.forecast_date)
                .all()
            )
            if rows:
                return [(r.forecast_date, max(float(r.predicted_quantity), 0.0)) for r in rows]
    return []


def _sales_monthly_avg(sku_id: int, session_id: str, db: Session) -> float:
    """90-day average daily sales → monthly estimate."""
    cutoff = date.today() - timedelta(days=90)
    for sid in ([session_id, "demo"] if session_id != "demo" else ["demo"]):
        rows = (
            db.query(func.sum(SalesRecord.quantity), func.count(SalesRecord.id))
            .filter(
                SalesRecord.sku_id == sku_id,
                SalesRecord.session_id == sid,
                SalesRecord.sale_date >= cutoff,
            )
            .first()
        )
        if rows and rows[1] and rows[1] > 0:
            daily_avg = float(rows[0]) / float(rows[1])
            return daily_avg * 30.0
    return 0.0


def _aggregate_monthly(
    daily_rows: list[tuple[date, float]],
    month_starts: list[date],
) -> dict[date, float]:
    """Sum daily forecast quantities into calendar months."""
    totals: dict[date, float] = {m: 0.0 for m in month_starts}
    for fdate, qty in daily_rows:
        ms = _month_start(fdate)
        if ms in totals:
            totals[ms] += qty
    return totals


def _plan_to_dict(plan: DemandPlan) -> dict:
    return {
        "id": plan.id,
        "sku_id": plan.sku_id,
        "period_month": plan.period_month.isoformat(),
        "system_forecast": plan.system_forecast,
        "override_value": plan.override_value,
        "final_value": plan.final_value,
        "status": plan.status,
        "reason": plan.reason,
        "changed_by": plan.changed_by,
        "version": plan.version,
    }


def _add_history(
    db: Session,
    plan: DemandPlan,
    action: str,
    old_value: Optional[float] = None,
    new_value: Optional[float] = None,
    reason: Optional[str] = None,
) -> None:
    hist = DemandPlanHistory(
        demand_plan_id=plan.id,
        action=action,
        old_value=old_value,
        new_value=new_value,
        reason=reason,
        changed_by=plan.changed_by,
        session_id=plan.session_id,
    )
    db.add(hist)


# ------------------------------------------------------------------ #
# Public service functions                                             #
# ------------------------------------------------------------------ #

def get_monthly_buckets(
    sku_id: int,
    session_id: str,
    db: Session,
    months_ahead: int = 6,
) -> list[dict]:
    today = date.today()
    month_starts = [_month_start(today)]
    for _ in range(months_ahead - 1):
        month_starts.append(_next_month(month_starts[-1]))

    daily_rows = _get_ensemble_forecasts(sku_id, session_id, db)
    if daily_rows:
        monthly_totals = _aggregate_monthly(daily_rows, month_starts)
    else:
        fallback = _sales_monthly_avg(sku_id, session_id, db)
        monthly_totals = {m: fallback for m in month_starts}

    result = []
    for ms in month_starts:
        sys_fc = round(monthly_totals.get(ms, 0.0), 1)

        plan = (
            db.query(DemandPlan)
            .filter(
                DemandPlan.sku_id == sku_id,
                DemandPlan.period_month == ms,
                DemandPlan.session_id == session_id,
            )
            .first()
        )

        if plan is None:
            plan = DemandPlan(
                sku_id=sku_id,
                period_month=ms,
                system_forecast=sys_fc,
                override_value=None,
                final_value=sys_fc,
                status="draft",
                session_id=session_id,
            )
            db.add(plan)
            db.flush()

        result.append({
            "period_month": plan.period_month.isoformat(),
            "system_forecast": plan.system_forecast,
            "override_value": plan.override_value,
            "final_value": plan.final_value,
            "status": plan.status,
            "reason": plan.reason,
            "version": plan.version,
        })

    try:
        db.commit()
    except Exception:
        db.rollback()

    return result


def apply_override(
    sku_id: int,
    period_month: date,
    override_value: float,
    reason: str,
    session_id: str,
    db: Session,
) -> dict:
    plan = (
        db.query(DemandPlan)
        .filter(
            DemandPlan.sku_id == sku_id,
            DemandPlan.period_month == period_month,
            DemandPlan.session_id == session_id,
        )
        .first()
    )
    if plan is None:
        raise ValueError(f"No plan found for SKU {sku_id} / {period_month}")
    if plan.status != "draft":
        raise ValueError(f"Cannot override a plan with status '{plan.status}'")

    old_value = plan.final_value
    plan.override_value = override_value
    plan.final_value = override_value
    plan.reason = reason
    plan.version += 1
    _add_history(db, plan, "override", old_value=old_value, new_value=override_value, reason=reason)
    db.commit()
    db.refresh(plan)
    return _plan_to_dict(plan)


def submit_plan(sku_id: int, period_month: date, session_id: str, db: Session) -> dict:
    plan = (
        db.query(DemandPlan)
        .filter(
            DemandPlan.sku_id == sku_id,
            DemandPlan.period_month == period_month,
            DemandPlan.session_id == session_id,
        )
        .first()
    )
    if plan is None:
        raise ValueError(f"No plan found for SKU {sku_id} / {period_month}")
    if plan.status != "draft":
        raise ValueError(f"Only draft plans can be submitted (current: '{plan.status}')")

    plan.status = "submitted"
    plan.version += 1
    _add_history(db, plan, "submit")
    db.commit()
    db.refresh(plan)
    return _plan_to_dict(plan)


def approve_plan(sku_id: int, period_month: date, session_id: str, db: Session) -> dict:
    plan = (
        db.query(DemandPlan)
        .filter(
            DemandPlan.sku_id == sku_id,
            DemandPlan.period_month == period_month,
            DemandPlan.session_id == session_id,
        )
        .first()
    )
    if plan is None:
        raise ValueError(f"No plan found for SKU {sku_id} / {period_month}")
    if plan.status != "submitted":
        raise ValueError(f"Only submitted plans can be approved (current: '{plan.status}')")

    plan.status = "approved"
    plan.version += 1
    _add_history(db, plan, "approve")
    db.commit()
    db.refresh(plan)
    return _plan_to_dict(plan)


def reject_plan(
    sku_id: int,
    period_month: date,
    reason: str,
    session_id: str,
    db: Session,
) -> dict:
    plan = (
        db.query(DemandPlan)
        .filter(
            DemandPlan.sku_id == sku_id,
            DemandPlan.period_month == period_month,
            DemandPlan.session_id == session_id,
        )
        .first()
    )
    if plan is None:
        raise ValueError(f"No plan found for SKU {sku_id} / {period_month}")
    if plan.status != "submitted":
        raise ValueError(f"Only submitted plans can be rejected (current: '{plan.status}')")

    plan.status = "draft"
    plan.version += 1
    _add_history(db, plan, "reject", reason=reason)
    db.commit()
    db.refresh(plan)
    return _plan_to_dict(plan)


def reset_plan(sku_id: int, period_month: date, session_id: str, db: Session) -> dict:
    plan = (
        db.query(DemandPlan)
        .filter(
            DemandPlan.sku_id == sku_id,
            DemandPlan.period_month == period_month,
            DemandPlan.session_id == session_id,
        )
        .first()
    )
    if plan is None:
        raise ValueError(f"No plan found for SKU {sku_id} / {period_month}")

    old_value = plan.final_value
    plan.status = "draft"
    plan.override_value = None
    plan.final_value = plan.system_forecast
    plan.reason = None
    plan.version += 1
    _add_history(db, plan, "reset", old_value=old_value, new_value=plan.system_forecast)
    db.commit()
    db.refresh(plan)
    return _plan_to_dict(plan)


def get_plan_history(
    sku_id: int,
    period_month: date,
    session_id: str,
    db: Session,
) -> list[dict]:
    plan = (
        db.query(DemandPlan)
        .filter(
            DemandPlan.sku_id == sku_id,
            DemandPlan.period_month == period_month,
            DemandPlan.session_id == session_id,
        )
        .first()
    )
    if plan is None:
        return []

    rows = (
        db.query(DemandPlanHistory)
        .filter(DemandPlanHistory.demand_plan_id == plan.id)
        .order_by(DemandPlanHistory.created_at.desc())
        .all()
    )
    return [
        {
            "action": r.action,
            "old_value": r.old_value,
            "new_value": r.new_value,
            "reason": r.reason,
            "changed_by": r.changed_by,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


def get_planning_summary(session_id: str, db: Session) -> dict:
    today = date.today()
    month_starts = [_month_start(today)]
    for _ in range(5):
        month_starts.append(_next_month(month_starts[-1]))

    plans = (
        db.query(DemandPlan)
        .filter(
            DemandPlan.session_id == session_id,
            DemandPlan.period_month.in_(month_starts),
        )
        .all()
    )

    total_plans = len(plans)
    draft_count = sum(1 for p in plans if p.status == "draft")
    submitted_count = sum(1 for p in plans if p.status == "submitted")
    approved_count = sum(1 for p in plans if p.status == "approved")

    submitted_sku_ids = {p.sku_id for p in plans if p.status == "submitted"}
    skus_needing_review = len(submitted_sku_ids)

    variances = [
        abs(p.final_value - p.system_forecast) / p.system_forecast * 100.0
        for p in plans
        if p.override_value is not None and p.system_forecast > 0
    ]
    total_override_variance_pct = round(sum(variances) / len(variances), 2) if variances else 0.0

    return {
        "total_plans": total_plans,
        "draft_count": draft_count,
        "submitted_count": submitted_count,
        "approved_count": approved_count,
        "skus_needing_review": skus_needing_review,
        "total_override_variance_pct": total_override_variance_pct,
    }
