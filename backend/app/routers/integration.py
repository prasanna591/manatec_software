from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import get_db
from ..erp import ENTITIES, get_cached, health, sync_all
from ..models import User
from ..security import requires
from ..services import audit

router = APIRouter(prefix="/integration", tags=["integration"])


class SyncRequest(BaseModel):
    entities: list[str] | None = None


@router.get("/entities")
def list_entities(_: User = Depends(requires("Admin", "view"))):
    return {"entities": list(ENTITIES)}


@router.post("/sync")
def run_sync(
    body: SyncRequest,
    db: Session = Depends(get_db),
    actor: User = Depends(requires("Admin", "create")),
):
    entities = body.entities or list(ENTITIES)
    invalid = [e for e in entities if e not in ENTITIES]
    if invalid:
        return {"error": f"unknown entities: {invalid}", "valid": list(ENTITIES)}
    jobs = sync_all(db, entities)
    audit(db, actor=actor, action="sync", entity_type="integration",
          after={"entities": entities, "rows": sum(j.rows for j in jobs)})
    return {
        "jobs": [
            {"entity": j.entity, "status": j.status, "rows": j.rows, "error": j.error}
            for j in jobs
        ]
    }


@router.get("/health")
def integration_health(db: Session = Depends(get_db), _: User = Depends(requires("Admin", "view"))):
    return {"sync": health(db)}


@router.get("/cache/{entity}")
def cache_view(entity: str, db: Session = Depends(get_db), _: User = Depends(requires("Admin", "view"))):
    if entity not in ENTITIES:
        return {"error": "unknown entity", "valid": list(ENTITIES)}
    return {"entity": entity, "rows": get_cached(db, entity)}