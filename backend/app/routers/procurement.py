"""Procurement endpoints — buy-list, purchase orders, goods receipt, cancel (ported)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import atp_service, procurement_service
from ..db import get_db
from ..models import Product, PurchaseOrder, User
from ..security import requires

router = APIRouter(prefix="/procurement", tags=["procurement"])


class BuyListIn(BaseModel):
    product_id: int
    qty: float


@router.post("/buy-list")
def buy_list(body: BuyListIn, db: Session = Depends(get_db),
             _: User = Depends(requires("Purchase", "view"))):
    product = db.get(Product, body.product_id)
    if not product:
        raise HTTPException(404, "Product not found")
    if body.qty <= 0:
        raise HTTPException(422, "qty must be > 0")
    report = atp_service.build_n(db, body.product_id, target_qty=float(body.qty))
    shortages = {c.item_id: c.short for c in report.coverage if c.short and c.short > 0}
    rows = procurement_service.part_shortages(db, shortages)
    return {
        "product_id": body.product_id,
        "product_name": product.name,
        "target_qty": body.qty,
        "rows": rows,
        "total_value": round(sum(r["value"] for r in rows), 2),
        "max_lead_days": report.max_lead_days,
        "ok_for_target": report.ok_for_target,
    }


class PoLineIn(BaseModel):
    item_id: int
    qty: float
    unit_price: float | None = None


class PoCreateIn(BaseModel):
    supplier_id: int
    lines: list[PoLineIn]
    note: str = ""


def _po_404(db: Session, po_id: int) -> PurchaseOrder:
    po = db.get(PurchaseOrder, po_id)
    if not po:
        raise HTTPException(404, "Purchase order not found")
    return po


@router.get("/purchase-orders")
def purchase_orders(db: Session = Depends(get_db), _: User = Depends(requires("Purchase", "view"))):
    return {"items": procurement_service.all_pos(db)}


@router.get("/purchase-orders/{po_id}")
def po_detail(po_id: int, db: Session = Depends(get_db),
              _: User = Depends(requires("Purchase", "view"))):
    return procurement_service.po_view(db, _po_404(db, po_id))


@router.post("/purchase-orders", status_code=201)
def create_po(body: PoCreateIn, db: Session = Depends(get_db),
              actor: User = Depends(requires("Purchase", "create"))):
    lines = [ln.model_dump() for ln in body.lines]
    if not lines:
        raise HTTPException(422, "lines cannot be empty")
    try:
        po = procurement_service.create_po(
            db, supplier_id=body.supplier_id, lines=lines, user_id=actor.id, note=body.note)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    db.commit()
    return procurement_service.po_view(db, po)


@router.post("/purchase-orders/{po_id}/issue")
def issue_po(po_id: int, db: Session = Depends(get_db),
             actor: User = Depends(requires("Purchase", "approve"))):
    po = _po_404(db, po_id)
    try:
        procurement_service.issue_po(db, po, actor.id)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    db.commit()
    return procurement_service.po_view(db, po)


class ReceiveLineIn(BaseModel):
    line_id: int
    qty: float


class ReceiveIn(BaseModel):
    lines: list[ReceiveLineIn]


@router.post("/purchase-orders/{po_id}/receive")
def receive_po(po_id: int, body: ReceiveIn, db: Session = Depends(get_db),
               actor: User = Depends(requires("Purchase", "edit"))):
    po = _po_404(db, po_id)
    received = [ln.model_dump() for ln in body.lines]
    try:
        result = procurement_service.receive_po(db, po, received, actor.id)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    db.commit()
    return {"ok": True, "result": result}


@router.post("/purchase-orders/{po_id}/cancel")
def cancel_po(po_id: int, db: Session = Depends(get_db),
              actor: User = Depends(requires("Purchase", "edit"))):
    po = _po_404(db, po_id)
    if po.status not in ("draft", "issued"):
        raise HTTPException(409, f"Cannot cancel {po.status} order")
    po.status = "cancelled"
    from ..mfg_helpers import audit

    audit(db, user=actor, action="po.cancel", entity="purchase_order", entity_id=po.id)
    db.commit()
    return {"ok": True, "status": po.status}