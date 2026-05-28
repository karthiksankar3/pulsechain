from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_session_id
from app.models.sku import SKU
from app.services.scenarios import ScenarioService

router = APIRouter(prefix="/scenarios", tags=["scenarios"])
_svc = ScenarioService()


class RunScenarioRequest(BaseModel):
    sku_id: int
    scenario_type: str
    custom_impact_pct: float | None = None


class CompareRequest(BaseModel):
    sku_id: int
    scenario_types: list[str]


def _resolve_sku(sku_id: int, session_id: str, db: Session) -> SKU:
    sku = db.query(SKU).filter(SKU.id == sku_id, SKU.session_id == session_id).first()
    if sku is None and session_id != "demo":
        sku = db.query(SKU).filter(SKU.id == sku_id, SKU.session_id == "demo").first()
    if sku is None:
        raise HTTPException(status_code=404, detail=f"SKU {sku_id} not found")
    return sku


@router.get("/templates")
def list_templates() -> dict:
    return {
        k: {"description": v["description"], "demand_impact": v["demand_impact"], "icon": v["icon"]}
        for k, v in ScenarioService.SCENARIO_TEMPLATES.items()
    }


@router.post("/run")
def run_scenario(
    body: RunScenarioRequest,
    db: Session = Depends(get_db),
    session_id: str = Depends(get_session_id),
) -> dict:
    _resolve_sku(body.sku_id, session_id, db)
    return _svc.run_scenario(body.sku_id, body.scenario_type, body.custom_impact_pct, db)


@router.post("/compare")
def compare_scenarios(
    body: CompareRequest,
    db: Session = Depends(get_db),
    session_id: str = Depends(get_session_id),
) -> dict:
    _resolve_sku(body.sku_id, session_id, db)
    return _svc.compare_scenarios(body.sku_id, body.scenario_types, db)
