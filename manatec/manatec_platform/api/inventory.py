"""Inventory endpoints — stock levels, ledger, low-stock alerts, movements."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..db import get_session
from ..helpers import audit, available, committed, in_transit, item_avg_price, on_hand, post_ledger
from ..models import InventoryLedger, InventoryStock, Item
from .deps import get_current_user, require_roles

router = APIRouter(dependencies=[Depends(get_current_user)], prefix="/inventory", tags=["inventory"])


def low_stock_alerts(db: Session, limit: int = 20) -> dict:
    """Items below their min_qty (skip items without a min_qty set)."""
    rows = (
        db.query(Item)
        .filter(Item.min_qty > 0)
        .order_by(Item.code)
        .all()
    )
    alerts = []
    for item in rows:
        oh = on_hand(db, item.id)
        if oh < float(item.min_qty or 0):
            alerts.append({
                "item_id": item.id, "code": item.code, "description": item.description,
                "on_hand": oh, "min_qty": float(item.min_qty or 0),
                "short": round(float(item.min_qty or 0) - oh, 3),
            })
    alerts.sort(key=lambda a: a["short"], reverse=True)
    return {"count": len(alerts), "items": alerts[:limit]}


@router.get("/stock")
def stock(db: Session = Depends(get_session)):
    rows = (
        db.query(
            InventoryStock.item_id,
            func.sum(InventoryStock.on_hand).label("on_hand"),
        )
        .group_by(InventoryStock.item_id)
        .order_by(InventoryStock.item_id)
        .all()
    )
    items = {i.id: i for i in db.query(Item).filter(Item.id.in_([r.item_id for r in rows])).all()}
    out = []
    for r in rows:
        it = items.get(r.item_id)
        if not it:
            continue
        avail = available(db, r.item_id)
        out.append({
            "item_id": r.item_id,
            "code": it.code,
            "description": it.description,
            "uom": it.uom,
            "category": it.category,
            "on_hand": float(r.on_hand or 0),
            "in_transit": in_transit(db, r.item_id),
            "committed": committed(db, r.item_id),
            "available": avail,
            "min_qty": float(it.min_qty or 0),
            "max_qty": float(it.max_qty or 0),
            "unit_cost": item_avg_price(db, r.item_id),
            "stock_value": round(float(r.on_hand or 0) * item_avg_price(db, r.item_id), 2),
            "below_min": bool(it.min_qty) and float(r.on_hand or 0) < float(it.min_qty or 0),
        })
    out.sort(key=lambda r: r["code"])
    return {"items": out, "alerts": low_stock_alerts(db)}


@router.get("/stock/{ref}")
def stock_item(ref: str, db: Session = Depends(get_session)):
    item = db.query(Item).filter(or_(Item.id == int(ref) if ref.isdigit() else False,
                                     Item.code == ref)).first()
    if not item:
        raise HTTPException(404, "Item not found")
    ledger = (
        db.query(InventoryLedger)
        .filter(InventoryLedger.item_id == item.id)
        .order_by(InventoryLedger.created_at.desc())
        .limit(15)
        .all()
    )
    oh = on_hand(db, item.id)
    return {
        "item_id": item.id, "code": item.code, "description": item.description,
        "uom": item.uom, "category": item.category,
        "on_hand": oh,
        "in_transit": in_transit(db, item.id),
        "committed": committed(db, item.id),
        "available": available(db, item.id),
        "min_qty": float(item.min_qty or 0),
        "max_qty": float(item.max_qty or 0),
        "ledger": [
            {
                "id": l.id, "trans_type": l.trans_type, "qty_delta": float(l.qty_delta or 0),
                "ref_type": l.ref_type, "ref_id": l.ref_id, "note": l.note,
                "created_at": l.created_at.isoformat() if l.created_at else None,
            }
            for l in ledger
        ],
    }


class MovementIn(BaseModel):
    qty_delta: float
    item_id: int | None = None
    item_code: str | None = None
    note: str = ""
    trans_type: str | None = None
    warehouse_id: int = 1


@router.post("/movement")
def movement(
    body: MovementIn,
    user=Depends(require_roles("stores", "purchase", "production", "admin")),
    db: Session = Depends(get_session),
):
    item = None
    if body.item_id:
        item = db.get(Item, body.item_id)
    elif body.item_code:
        item = db.query(Item).filter_by(code=body.item_code).first()
    if not item:
        raise HTTPException(404, "Item not found (give item_id or item_code)")
    post_ledger(
        db,
        item_id=item.id,
        trans_type=body.trans_type or ("adj" if not body.note.startswith("Issue") else "issue"),
        qty_delta=float(body.qty_delta),
        warehouse_id=body.warehouse_id,
        user_id=user.id,
        note=body.note or "Manual adjustment",
    )
    audit(db, user_id=user.id, action="inv.movement", entity="item", entity_id=item.id,
          details={"code": item.code, "qty_delta": body.qty_delta, "note": body.note})
    db.commit()
    return {"ok": True, "item_id": item.id, "on_hand": on_hand(db, item.id)}


@router.get("/ledger")
def ledger(limit: int = 50, item_id: int | None = None, db: Session = Depends(get_session)):
    rows = db.query(InventoryLedger)
    if item_id:
        rows = rows.filter(InventoryLedger.item_id == item_id)
    rows = rows.order_by(InventoryLedger.created_at.desc()).limit(limit).all()
    items = {i.id: i for i in db.query(Item).all()}
    return {
        "items": [
            {
                "id": l.id,
                "item_id": l.item_id,
                "code": items.get(l.item_id).code if l.item_id in items else "",
                "description": items.get(l.item_id).description if l.item_id in items else "",
                "trans_type": l.trans_type,
                "qty_delta": float(l.qty_delta or 0),
                "note": l.note,
                "created_at": l.created_at.isoformat() if l.created_at else None,
            }
            for l in rows
        ]
    }