from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_session_id
from app.models.sku import SKU
from app.services.demand_planning import (
    apply_override,
    approve_plan,
    get_monthly_buckets,
    get_plan_history,
    get_planning_summary,
    reject_plan,
    reset_plan,
    submit_plan,
)

router = APIRouter(prefix="/demand-planning", tags=["demand-planning"])


# ------------------------------------------------------------------ #
# Request bodies                                                       #
# ------------------------------------------------------------------ #

class OverrideBody(BaseModel):
    sku_id: int
    period_month: str
    override_value: float
    reason: str


class SubmitBody(BaseModel):
    sku_id: int
    period_month: str


class ApproveBody(BaseModel):
    sku_id: int
    period_month: str


class RejectBody(BaseModel):
    sku_id: int
    period_month: str
    reason: str


class ResetBody(BaseModel):
    sku_id: int
    period_month: str


# ------------------------------------------------------------------ #
# GET /demand-planning/summary                                         #
# ------------------------------------------------------------------ #

@router.get("/summary")
def summary(
    session_id: str = Depends(get_session_id),
    db: Session = Depends(get_db),
) -> dict:
    return get_planning_summary(session_id, db)


# ------------------------------------------------------------------ #
# GET /demand-planning/skus                                            #
# ------------------------------------------------------------------ #

@router.get("/skus")
def list_skus(
    session_id: str = Depends(get_session_id),
    db: Session = Depends(get_db),
) -> list[dict]:
    skus = db.query(SKU).filter(SKU.session_id == session_id).order_by(SKU.code).all()
    if not skus and session_id != "demo":
        skus = db.query(SKU).filter(SKU.session_id == "demo").order_by(SKU.code).all()
    if not skus:
        skus = db.query(SKU).order_by(SKU.code).all()

    result = []
    for sku in skus:
        eff_session = sku.session_id
        months = get_monthly_buckets(sku.id, eff_session, db, months_ahead=6)
        result.append({
            "id": sku.id,
            "name": sku.name,
            "atc_code": sku.code,
            "therapy_area": sku.therapeutic_area,
            "months": months,
        })
    return result


# ------------------------------------------------------------------ #
# POST /demand-planning/override                                       #
# ------------------------------------------------------------------ #

@router.post("/override")
def override(
    body: OverrideBody,
    session_id: str = Depends(get_session_id),
    db: Session = Depends(get_db),
) -> dict:
    try:
        period = date.fromisoformat(body.period_month)
        return apply_override(body.sku_id, period, body.override_value, body.reason, session_id, db)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# ------------------------------------------------------------------ #
# POST /demand-planning/submit                                         #
# ------------------------------------------------------------------ #

@router.post("/submit")
def submit(
    body: SubmitBody,
    session_id: str = Depends(get_session_id),
    db: Session = Depends(get_db),
) -> dict:
    try:
        period = date.fromisoformat(body.period_month)
        return submit_plan(body.sku_id, period, session_id, db)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# ------------------------------------------------------------------ #
# POST /demand-planning/approve                                        #
# ------------------------------------------------------------------ #

@router.post("/approve")
def approve(
    body: ApproveBody,
    session_id: str = Depends(get_session_id),
    db: Session = Depends(get_db),
) -> dict:
    try:
        period = date.fromisoformat(body.period_month)
        return approve_plan(body.sku_id, period, session_id, db)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# ------------------------------------------------------------------ #
# POST /demand-planning/reject                                         #
# ------------------------------------------------------------------ #

@router.post("/reject")
def reject(
    body: RejectBody,
    session_id: str = Depends(get_session_id),
    db: Session = Depends(get_db),
) -> dict:
    try:
        period = date.fromisoformat(body.period_month)
        return reject_plan(body.sku_id, period, body.reason, session_id, db)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# ------------------------------------------------------------------ #
# POST /demand-planning/reset                                          #
# ------------------------------------------------------------------ #

@router.post("/reset")
def reset(
    body: ResetBody,
    session_id: str = Depends(get_session_id),
    db: Session = Depends(get_db),
) -> dict:
    try:
        period = date.fromisoformat(body.period_month)
        return reset_plan(body.sku_id, period, session_id, db)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# ------------------------------------------------------------------ #
# GET /demand-planning/skus/{sku_id}/history                          #
# ------------------------------------------------------------------ #

@router.get("/skus/{sku_id}/history")
def history(
    sku_id: int,
    period_month: str = Query(...),
    session_id: str = Depends(get_session_id),
    db: Session = Depends(get_db),
) -> list[dict]:
    try:
        period = date.fromisoformat(period_month)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid period_month format, use YYYY-MM-DD") from exc
    return get_plan_history(sku_id, period, session_id, db)
