from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
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


@router.get("/templates")
def list_templates() -> dict:
    return {
        k: {"description": v["description"], "demand_impact": v["demand_impact"], "icon": v["icon"]}
        for k, v in ScenarioService.SCENARIO_TEMPLATES.items()
    }


@router.post("/run")
def run_scenario(body: RunScenarioRequest, db: Session = Depends(get_db)) -> dict:
    return _svc.run_scenario(body.sku_id, body.scenario_type, body.custom_impact_pct, db)


@router.post("/compare")
def compare_scenarios(body: CompareRequest, db: Session = Depends(get_db)) -> dict:
    return _svc.compare_scenarios(body.sku_id, body.scenario_types, db)
