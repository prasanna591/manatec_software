"""Operations endpoints — production orders & sales quotes."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import get_session
from ..models import ProductionOrder, Quote
from .. import atp_service, production_service, quote_service
from .deps import get_current_user, require_roles

router = APIRouter(dependencies=[Depends(get_current_user)], tags=["ops"])


def _order_404(db: Session, order_id: int) -> ProductionOrder:
    order = db.get(ProductionOrder, order_id)
    if not order:
        raise HTTPException(404, "Production order not found")
    return order


def _quote_404(db: Session, quote_id: int) -> Quote:
    quote = db.get(Quote, quote_id)
    if not quote:
        raise HTTPException(404, "Quote not found")
    return quote


class ProductionOrderIn(BaseModel):
    product_id: int
    qty: float
    due_date: date | None = None
    source_quote_id: int | None = None


@router.get("/production-orders")
def production_orders(db: Session = Depends(get_session)):
    return {"items": production_service.all_orders(db)}


@router.post("/production-orders", status_code=201)
def create_order(body: ProductionOrderIn, user=Depends(require_roles("production", "admin")),
                 db: Session = Depends(get_session)):
    try:
        order = production_service.create_production_order(
            db, product_id=body.product_id, qty=body.qty,
            due_date=body.due_date or date.today(), user_id=user.id,
            source_quote_id=body.source_quote_id)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    report = atp_service.build_n(db, body.product_id, target_qty=float(body.qty))
    db.commit()
    view = production_service.order_view(db, order)
    view["shortage_value"] = round(float(report.shortage_value), 2)
    view["fully_available"] = report.ok_for_target
    return view


@router.post("/production-orders/{order_id}/release")
def release(order_id: int, user=Depends(require_roles("production", "admin")),
            db: Session = Depends(get_session)):
    order = _order_404(db, order_id)
    try:
        production_service.release_order(db, order, user.id)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    db.commit()
    return {"ok": True, "status": order.status}


@router.post("/production-orders/{order_id}/issue-material")
def issue_material(order_id: int, user=Depends(require_roles("stores", "production", "admin")),
                   db: Session = Depends(get_session)):
    order = _order_404(db, order_id)
    try:
        result = production_service.issue_material(db, order, user.id)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    db.commit()
    return {"ok": True, **result}


class StatusIn(BaseModel):
    status: str


@router.post("/production-orders/{order_id}/status")
def set_status(order_id: int, body: StatusIn,
               user=Depends(require_roles("production", "admin")),
               db: Session = Depends(get_session)):
    order = _order_404(db, order_id)
    try:
        production_service.set_status(db, order, body.status, user.id)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    db.commit()
    return {"ok": True, "status": order.status}


class QuoteIn(BaseModel):
    product_id: int
    qty: float
    customer_name: str = ""
    customer_phone: str = ""
    unit_price: float | None = None
    notes: str = ""


@router.get("/quotes")
def quotes(db: Session = Depends(get_session)):
    return {"items": quote_service.all_quotes(db)}


@router.post("/quotes", status_code=201)
def create_quote(body: QuoteIn, user=Depends(require_roles("sales", "admin")),
                 db: Session = Depends(get_session)):
    try:
        quote = quote_service.create_quote(
            db, product_id=body.product_id, qty=body.qty,
            customer_name=body.customer_name, customer_phone=body.customer_phone,
            unit_price=body.unit_price, user_id=user.id, notes=body.notes)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    db.commit()
    return quote_service.quote_view(db, quote)


@router.post("/quotes/{quote_id}/confirm")
def confirm_quote(quote_id: int, user=Depends(require_roles("sales", "admin")),
                  db: Session = Depends(get_session)):
    quote = _quote_404(db, quote_id)
    try:
        result = quote_service.confirm_quote(db, quote, user.id)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    db.commit()
    return {"ok": True, **result}