"""Server-side dashboard context (shared by the UI route and templates)."""

from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.orm import Session

from . import atp_service
from .models import (
    AuditLog, BomHeader, InventoryStock, Item, Product, ProductionOrder, PurchaseOrder,
    Quote, User,
)


def dashboard_context(db: Session) -> dict:
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

    alert_count = 0
    rows = (
        db.query(Item, func.coalesce(func.sum(InventoryStock.on_hand), 0))
        .outerjoin(InventoryStock, InventoryStock.item_id == Item.id)
        .group_by(Item.id)
        .all()
    )
    for it, oh in rows:
        if float(getattr(it, "min_qty") or 0) > 0 and float(oh or 0) < float(it.min_qty):
            alert_count += 1

    atp = atp_service.all_buildable(db)
    atp.sort(key=lambda r: (r.buildable_now is None, r.buildable_now or -1))
    buildable = sum(1 for r in atp if r.buildable_now and r.buildable_now > 0)
    blocked = sum(1 for r in atp if r.has_bom and (not r.buildable_now or r.buildable_now == 0))
    top = [
        {
            "product_id": r.product_id, "product_name": r.product_name,
            "buildable_now": r.buildable_now, "limiting_item": r.limiting_item,
            "total_line_value": r.total_line_value, "max_lead_days": r.max_lead_days,
        }
        for r in atp if r.has_bom
    ][:12]

    recent_rows = (
        db.query(AuditLog, User.username)
        .outerjoin(User, User.id == AuditLog.user_id)
        .order_by(AuditLog.created_at.desc()).limit(10).all()
    )
    recent = [{
        "action": a.action, "entity": a.entity, "entity_id": a.entity_id,
        "username": u,
        "created_at": a.created_at.strftime("%d %b %H:%M") if a.created_at else "",
    } for a, u in recent_rows]

    return {
        "stats": {
            "products": products, "items": items, "bom_products": bom_products,
            "buildable": buildable, "blocked": blocked,
            "low_stock_alerts": alert_count,
            "open_pos": open_po_count, "open_po_value": float(open_pos or 0),
            "open_mo": mo_open, "open_quotes": quotes_open,
        },
        "top": top,
        "recent": recent,
    }