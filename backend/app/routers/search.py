from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..erp import get_cached
from ..models import Department, Employee, Task, User
from ..security import get_current_user

router = APIRouter(prefix="/search", tags=["search"])

# entity -> page the web shell routes a hit to
PAGE = {
    "item": "dashboard",
    "product": "dashboard",
    "customer": "dashboard",
    "supplier": "dashboard",
    "sales_order": "dashboard",
    "production_order": "dashboard",
    "task": "tasks",
    "department": "admin",
    "employee": "admin",
    "user": "admin",
}

_PER_KIND = 5


def _label(kind: str, row: dict) -> str:
    if kind in ("item", "product", "customer", "supplier"):
        return f'{row["code"]} · {row["name"]}'
    if kind == "sales_order":
        return f'{row["order_no"]} · {row["customer"]} · {row["product"]}'
    return f'{row["order_no"]} · {row["product"]}'  # production_order


def _from_cache(db: Session, q: str) -> list[dict]:
    low = q.lower()
    out: list[dict] = []
    for kind, fields in (
        ("item", ("code", "name")),
        ("product", ("code", "name")),
        ("customer", ("code", "name", "contact")),
        ("supplier", ("code", "name")),
        ("sales_order", ("order_no", "customer", "product")),
        ("production_order", ("order_no", "product")),
    ):
        hits = [
            r for r in get_cached(db, kind)
            if any(low in str(r.get(f, "")).lower() for f in fields)
        ][:_PER_KIND]
        out.extend(
            {"kind": kind, "label": _label(kind, r), "ref": _ref(kind, r), "page": PAGE[kind]}
            for r in hits
        )
    return out


def _ref(kind: str, row: dict) -> str:
    if kind in ("sales_order", "production_order"):
        return str(row["order_no"])
    return str(row["code"])


@router.get("")
def search(
    q: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = q.strip()
    if len(q) < 2:
        return {"q": q, "results": []}

    results = _from_cache(db, q)

    low = q.lower()
    depts = db.scalars(
        select(Department).where(or_(Department.code.ilike(f"%{low}%"), Department.name.ilike(f"%{low}%")))
    ).all()
    results.extend(
        {"kind": "department", "label": f"{d.code} · {d.name}", "ref": d.code, "page": "admin"}
        for d in depts[:_PER_KIND]
    )

    emps = db.scalars(
        select(Employee).where(or_(Employee.code.ilike(f"%{low}%"), Employee.name.ilike(f"%{low}%")))
    ).all()
    results.extend(
        {"kind": "employee", "label": f"{e.code} · {e.name}", "ref": e.code, "page": "admin"}
        for e in emps[:_PER_KIND]
    )

    tasks = db.scalars(
        select(Task).where(
            or_(
                Task.title.ilike(f"%{low}%"),
                Task.description.ilike(f"%{low}%"),
                Task.source_ref.ilike(f"%{low}%"),
            )
        )
    ).all()
    results.extend(
        {
            "kind": "task",
            "label": f"#{t.id} {t.title}",
            "ref": str(t.id),
            "page": "tasks",
        }
        for t in tasks[:_PER_KIND]
    )

    return {"q": q, "results": results}