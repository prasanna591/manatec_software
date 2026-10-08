"""Production order endpoints (ported from manatec_platform/api/ops.py)."""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import atp_service, production_service
from ..db import get_db
from ..models import ProductionOrder, User
from ..security import requires

router = APIRouter(prefix="/production", tags=["production"])


def _order_404(db: Session, order_id: int) -> ProductionOrder:
    order = db.get(ProductionOrder, order_id)
    if not order:
        raise HTTPException(404, "Production order not found")
    return order


class ProductionOrderIn(BaseModel):
    product_id: int
    qty: float
    due_date: date | None = None
    source_quote_id: int | None = None


@router.get("/orders")
def production_orders(db: Session = Depends(get_db),
                      _: User = Depends(requires("Production", "view"))):
    return {"items": production_service.all_orders(db)}


@router.get("/orders/{order_id}")
def order_detail(order_id: int, db: Session = Depends(get_db),
                 _: User = Depends(requires("Production", "view"))):
    return production_service.order_view(db, _order_404(db, order_id))


@router.get("/orders/{order_id}/transitions")
def valid_transitions(order_id: int, db: Session = Depends(get_db),
                      _: User = Depends(requires("Production", "view"))):
    order = _order_404(db, order_id)
    return {
        "current": order.status,
        "status": order.status,
        "valid_transitions": production_service.get_valid_transitions(order.status),
    }


@router.post("/orders", status_code=201)
def create_order(body: ProductionOrderIn, db: Session = Depends(get_db),
                 actor: User = Depends(requires("Production", "create"))):
    try:
        order = production_service.create_production_order(
            db, product_id=body.product_id, qty=body.qty,
            due_date=body.due_date or date.today(), user_id=actor.id,
            source_quote_id=body.source_quote_id)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    report = atp_service.build_n(db, body.product_id, target_qty=float(body.qty))
    db.commit()
    view = production_service.order_view(db, order)
    view["shortage_value"] = round(float(report.shortage_value), 2)
    view["fully_available"] = report.ok_for_target
    return view


@router.post("/orders/{order_id}/release")
def release(order_id: int, db: Session = Depends(get_db),
            actor: User = Depends(requires("Production", "edit"))):
    order = _order_404(db, order_id)
    try:
        production_service.release_order(db, order, actor.id)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    db.commit()
    return {"ok": True, "status": order.status}


@router.post("/orders/{order_id}/issue-material")
def issue_material(order_id: int, db: Session = Depends(get_db),
                   actor: User = Depends(requires("Production", "edit"))):
    order = _order_404(db, order_id)
    try:
        result = production_service.issue_material(db, order, actor.id)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    db.commit()
    return {"ok": True, **result}


class StatusIn(BaseModel):
    status: str


@router.post("/orders/{order_id}/status")
def set_status(order_id: int, body: StatusIn, db: Session = Depends(get_db),
               actor: User = Depends(requires("Production", "edit"))):
    order = _order_404(db, order_id)
    try:
        production_service.set_status(db, order, body.status, actor.id)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    db.commit()
    return {"ok": True, "status": order.status}