"""Procurement endpoints — buy-list, purchase requisitions, purchase orders, goods receipt, cancel (ported)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import atp_service, procurement_service
from ..db import get_db
from ..models import Product, PurchaseOrder, PurchaseRequisition, User
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


# --- Purchase Requisitions (from Material Request shortages) ---

def _pr_404(db: Session, pr_id: int) -> PurchaseRequisition:
    pr = db.get(PurchaseRequisition, pr_id)
    if not pr:
        raise HTTPException(404, "Purchase requisition not found")
    return pr


def _pr_out(pr: PurchaseRequisition) -> dict:
    return {
        "id": pr.id,
        "pr_no": pr.pr_no,
        "source_req_no": pr.source_req_no,
        "requester": pr.requester,
        "department_id": pr.department_id,
        "priority": pr.priority,
        "required_date": pr.required_date.isoformat() if pr.required_date else None,
        "status": pr.status,
        "lines": pr.lines,
        "created_by": pr.created_by,
        "created_at": pr.created_at.isoformat() if pr.created_at else None,
    }


@router.get("/purchase-requisitions")
def list_prs(status: str | None = None, db: Session = Depends(get_db),
             _: User = Depends(requires("PurchaseReq", "view"))):
    from sqlalchemy import select
    q = select(PurchaseRequisition).order_by(PurchaseRequisition.created_at.desc())
    if status:
        q = q.where(PurchaseRequisition.status == status)
    rows = db.scalars(q.limit(200)).all()
    return {"items": [_pr_out(pr) for pr in rows]}


@router.get("/purchase-requisitions/{pr_id}")
def pr_detail(pr_id: int, db: Session = Depends(get_db),
              _: User = Depends(requires("PurchaseReq", "view"))):
    return _pr_out(_pr_404(db, pr_id))


class PrSubmitIn(BaseModel):
    note: str = ""


@router.post("/purchase-requisitions/{pr_id}/submit")
def submit_pr(pr_id: int, body: PrSubmitIn, db: Session = Depends(get_db),
              actor: User = Depends(requires("PurchaseReq", "create"))):
    pr = _pr_404(db, pr_id)
    if pr.status != "draft":
        raise HTTPException(409, f"Cannot submit PR in {pr.status} status")
    pr.status = "submitted"
    from ..mfg_helpers import audit
    audit(db, user=actor, action="pr.submit", entity="purchase_requisition", entity_id=pr.id,
          after={"note": body.note})
    db.commit()
    return _pr_out(pr)


class PrApproveIn(BaseModel):
    note: str = ""


@router.post("/purchase-requisitions/{pr_id}/approve")
def approve_pr(pr_id: int, body: PrApproveIn, db: Session = Depends(get_db),
               actor: User = Depends(requires("PurchaseReq", "approve"))):
    pr = _pr_404(db, pr_id)
    if pr.status != "submitted":
        raise HTTPException(409, f"Cannot approve PR in {pr.status} status")
    pr.status = "approved"
    from ..mfg_helpers import audit
    audit(db, user=actor, action="pr.approve", entity="purchase_requisition", entity_id=pr.id,
          after={"note": body.note})
    db.commit()
    return _pr_out(pr)


class PrCreatePoIn(BaseModel):
    supplier_id: int
    lines: list[PoLineIn]
    note: str = ""


@router.post("/purchase-requisitions/{pr_id}/create-po")
def create_po_from_pr(pr_id: int, body: PrCreatePoIn, db: Session = Depends(get_db),
                      actor: User = Depends(requires("Purchase", "create"))):
    pr = _pr_404(db, pr_id)
    if pr.status != "approved":
        raise HTTPException(409, f"Cannot create PO from PR in {pr.status} status")
    try:
        po = procurement_service.create_po(
            db, supplier_id=body.supplier_id, lines=[ln.model_dump() for ln in body.lines],
            user_id=actor.id, note=body.note)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    db.commit()
    # Link PO to PR
    pr.status = "po_created"
    from ..mfg_helpers import audit
    audit(db, user=actor, action="pr.create_po", entity="purchase_requisition", entity_id=pr.id,
          after={"po_id": po.id, "po_no": po.po_no})
    db.commit()
    return procurement_service.po_view(db, po)