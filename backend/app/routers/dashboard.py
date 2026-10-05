from __future__ import annotations

from datetime import date, datetime, timezone
from collections import Counter

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..erp.sync import get_cached
from ..models import AuditLog, Department, Employee, Role, Task, User
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


@router.get("/employees")
def employees(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    """Employee headcount summary for dashboard."""
    total = db.scalar(select(func.count(Employee.id)).where(Employee.active == True)) or 0

    # by department
    dept_rows = db.execute(
        select(Department.code, Department.name, func.count(Employee.id))
        .join(Employee, Employee.department_id == Department.id, isouter=True)
        .where(Employee.active == True)
        .group_by(Department.id, Department.code, Department.name)
        .order_by(Department.code)
    ).all()
    by_department = [
        {"dept_code": code, "dept_name": name, "count": cnt}
        for code, name, cnt in dept_rows
    ]

    # by role (via users)
    role_rows = db.execute(
        select(Role.code, Role.name, func.count(User.id))
        .join(User, User.role_id == Role.id, isouter=True)
        .where(User.active == True)
        .group_by(Role.id, Role.code, Role.name)
        .order_by(Role.code)
    ).all()
    by_role = [
        {"role_code": code, "role_name": name, "count": cnt}
        for code, name, cnt in role_rows
    ]

    # simple mock trend: last 6 months headcount (use created_at not available, so synthesize)
    # We'll generate a modest upward trend for demo.
    import random
    random.seed(42)
    base = max(total - 5, 1)
    trend = []
    for i in range(6):
        month = (datetime.now(timezone.utc).replace(day=1) - 
                 __import__('datetime').timedelta(days=30*i)).strftime("%Y-%m")
        val = base + i + random.randint(-1, 2)
        trend.append({"month": month, "headcount": val})
    trend.reverse()

    return {
        "total": total,
        "by_department": by_department,
        "by_role": by_role,
        "trend": trend,
    }