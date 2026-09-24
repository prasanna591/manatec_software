from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..erp.sync import get_cached
from ..models import AuditLog, Department, Task, User
from ..security import get_current_user

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

MANAGER_ROLES = {"ADMIN", "MGMT", "DH"}


def _today() -> str:
    return date.today().isoformat()


def _kpis(db: Session, user: User, scoped: bool) -> dict:
    items = {r["code"]: r for r in get_cached(db, "item")}
    stock = get_cached(db, "stock")
    orders = get_cached(db, "sales_order")
    production = get_cached(db, "production_order")

    on_hand: dict[str, int] = {}
    for s in stock:
        on_hand[s["item"]] = on_hand.get(s["item"], 0) + s["on_hand"]

    short_items = [c for c, it in items.items() if on_hand.get(c, 0) < it["min_stock"]]
    healthy = len(items) - len(short_items)
    inventory_pct = round(100 * healthy / len(items), 1) if items else 100.0

    total_qty = sum(p["qty"] for p in production) or 1
    done_qty = sum(p["completed_qty"] for p in production)
    production_pct = round(100 * done_qty / total_qty, 1)

    delayed = [
        o for o in orders
        if o["status"] not in ("dispatched", "closed") and o["required_date"] < _today()
    ]

    tq = select(func.count(Task.id)).where(Task.status.in_(("open", "in_progress")))
    if not scoped:
        tq = tq.where(Task.assigned_to == user.id)
    pending_tasks = db.scalar(tq) or 0

    return {
        "orders": len(orders),
        "orders_open": sum(1 for o in orders if o["status"] not in ("dispatched", "closed")),
        "production_pct": production_pct,
        "inventory_pct": inventory_pct,
        "pending_tasks": pending_tasks,
        "delayed_orders": len(delayed),
        "material_alerts": len(short_items),
        "as_of": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/overview")
def overview(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    scoped = user.role.code in MANAGER_ROLES
    return {"kpis": _kpis(db, user, scoped)}


@router.get("/departments")
def departments(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    depts = db.scalars(select(Department).order_by(Department.code)).all()
    out = []
    for d in depts:
        open_q = db.scalar(
            select(func.count(Task.id)).where(
                Task.department_id == d.id, Task.status.in_(("open", "in_progress"))
            )
        ) or 0
        total_q = db.scalar(select(func.count(Task.id)).where(Task.department_id == d.id)) or 0
        out.append(
            {
                "code": d.code,
                "name": d.name,
                "open_tasks": open_q,
                "total_tasks": total_q,
                "status": "attention" if open_q > 5 else "normal",
            }
        )
    return out


@router.get("/activities")
def activities(limit: int = 20, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    rows = db.scalars(select(AuditLog).order_by(AuditLog.at.desc()).limit(limit)).all()
    return [
        {
            "at": r.at.isoformat(),
            "actor": r.actor_username or "system",
            "action": r.action,
            "entity_type": r.entity_type,
            "entity_ref": r.entity_ref,
        }
        for r in rows
    ]