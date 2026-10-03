"""Dashboard & audit endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import atp_service
from ..db import get_session
from .deps import get_current_user
from ..helpers import on_hand  # noqa: F401  (kept for readability)
from ..models import (
    AuditLog,
    BomHeader,
    Item,
    Product,
    ProductionOrder,
    PurchaseOrder,
    Quote,
)
from . import inventory

router = APIRouter(tags=["dashboard"], dependencies=[Depends(get_current_user)])


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_session)):
    products = db.query(func.count(Product.id)).filter(Product.status == "active").scalar() or 0
    items = db.query(func.count(Item.id)).scalar() or 0
    bom_products = (
        db.query(func.count(func.distinct(BomHeader.product_id)))
        .filter(BomHeader.product_id.isnot(None), BomHeader.status == "active").scalar() or 0
    )
    open_pos = (
        db.query(func.sum(PurchaseOrder.total_value))
        .filter(PurchaseOrder.status.in_(["draft", "issued", "partial"])).scalar() or 0
    )
    open_po_count = (
        db.query(func.count(PurchaseOrder.id))
        .filter(PurchaseOrder.status.in_(["draft", "issued", "partial"])).scalar() or 0
    )
    mo_open = (
        db.query(func.count(ProductionOrder.id))
        .filter(ProductionOrder.status.in_(["planned", "released", "in_production"])).scalar() or 0
    )
    quotes_open = (
        db.query(func.count(Quote.id)).filter(Quote.status.in_(["new", "quote_sent"])).scalar() or 0
    )
    alerts = inventory.low_stock_alerts(db=db)["count"]

    atp = atp_service.all_buildable(db)
    buildable = sum(1 for r in atp if r.buildable_now and r.buildable_now > 0)
    blocked = sum(1 for r in atp if r.has_bom and (not r.buildable_now or r.buildable_now == 0))
    total_pipeline_value = sum(r.total_line_value for r in atp)

    return {
        "products": products,
        "items": items,
        "bom_products": bom_products,
        "buildable_products": buildable,
        "blocked_products": blocked,
        "low_stock_alerts": alerts,
        "open_pos": open_po_count,
        "open_po_value": float(open_pos or 0),
        "open_mo": mo_open,
        "open_quotes": quotes_open,
        "shortage_value": round(float(total_pipeline_value), 2),
    }


@router.get("/audit")
def audit_log(limit: int = 100, db: Session = Depends(get_session)):
    from ..models import User
    rows = (
        db.query(AuditLog, User.username)
        .outerjoin(User, User.id == AuditLog.user_id)
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
        .all()
    )
    return {
        "items": [
            {
                "id": a.id, "action": a.action, "entity": a.entity,
                "entity_id": a.entity_id, "details": a.details or {},
                "username": u, "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a, u in rows
        ]
    }