from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import AuditLog, User
from ..security import requires

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("")
def list_audit(
    entity_type: str | None = None,
    actor: str | None = None,
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db),
    _: User = Depends(requires("Admin", "view")),
):
    q = select(AuditLog)
    if entity_type:
        q = q.where(AuditLog.entity_type == entity_type)
    if actor:
        q = q.where(AuditLog.actor_username == actor)
    rows = db.scalars(q.order_by(AuditLog.at.desc()).limit(limit)).all()
    return [
        {
            "at": r.at.isoformat(),
            "actor": r.actor_username or "system",
            "action": r.action,
            "entity_type": r.entity_type,
            "entity_ref": r.entity_ref,
            "before": r.before,
            "after": r.after,
            "ip": r.ip,
        }
        for r in rows
    ]