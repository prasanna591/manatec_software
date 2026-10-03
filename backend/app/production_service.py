"""Production planning services — orders, reservations, material issue (ported from manatec_platform)."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from . import atp_service, bom_service
from .mfg_helpers import audit, items_map, post_ledger
from .models import Item, ProdOrderLine, Product, ProductionOrder, Quote, User


def gen_order_no(db: Session) -> str:
    last = db.query(ProductionOrder).order_by(ProductionOrder.id.desc()).first()
    seq = (last.id + 1) if last else 1
    return f"MO-{datetime.now(timezone.utc).strftime('%y%m')}-{seq:04d}"


def create_production_order(
    db: Session,
    *,
    product_id: int,
    qty: float,
    due_date,
    user_id: int | None,
    source_quote_id: int | None = None,
) -> ProductionOrder:
    flat = bom_service.explode(db, product_id)
    if not flat:
        raise ValueError("Product has no active BOM")

    lines = {int(i): round(float(n) * qty, 3) for i, n in flat.items()}

    order = ProductionOrder(
        order_no=gen_order_no(db),
        product_id=product_id,
        qty=qty,
        due_date=due_date,
        status="planned",
        source_quote_id=source_quote_id,
        created_by=user_id,
    )
    db.add(order)
    db.flush()
    for item_id, plan in lines.items():
        db.add(ProdOrderLine(order_id=order.id, item_id=item_id, plan_qty=plan, issued_qty=0))
    db.flush()

    report = atp_service.build_n(db, product_id, target_qty=qty)
    audit(db, user=db.get(User, user_id) if user_id else None, action="mo.create",
          entity="production_order", entity_id=order.id,
          details={"product_id": product_id, "qty": qty, "shortage_value": report.shortage_value})
    return order


def release_order(db: Session, order: ProductionOrder, user_id: int | None) -> None:
    if order.status != "planned":
        raise ValueError(f"Cannot release from {order.status}")
    order.status = "released"
    audit(db, user=db.get(User, user_id) if user_id else None, action="mo.release",
          entity="production_order", entity_id=order.id)


def issue_material(db: Session, order: ProductionOrder, user_id: int | None) -> dict:
    """Issue remaining planned material to the floor (decrements stock)."""
    lines = db.query(ProdOrderLine).filter(ProdOrderLine.order_id == order.id).all()
    issued = []
    short = []
    for line in lines:
        remaining = float(line.plan_qty) - float(line.issued_qty or 0)
        if remaining <= 0:
            continue
        post_ledger(
            db,
            item_id=line.item_id,
            trans_type="issue",
            qty_delta=-remaining,
            user_id=user_id,
            ref_type="mo",
            ref_id=order.id,
            note=f"Issue to {order.order_no}",
        )
        line.issued_qty = float(line.issued_qty or 0) + remaining
        issued.append({"item_id": line.item_id, "qty": remaining})
    if order.status == "planned":
        order.status = "released"
    elif order.status == "released":
        order.status = "in_production"
    db.flush()
    audit(db, user=db.get(User, user_id) if user_id else None, action="mo.issue",
          entity="production_order", entity_id=order.id, details={"issued_count": len(issued)})
    return {"issued": issued, "short_lines": len(short)}


def set_status(db: Session, order: ProductionOrder, status: str, user_id: int | None) -> None:
    allowed = ["planned", "released", "in_production", "qc", "packed", "dispatched", "cancelled"]
    if status not in allowed:
        raise ValueError(f"Bad status {status!r}")
    order.status = status
    db.flush()
    audit(db, user=db.get(User, user_id) if user_id else None, action="mo.status",
          entity="production_order", entity_id=order.id, details={"status": status})


def order_view(db: Session, order: ProductionOrder) -> dict:
    product = db.get(Product, order.product_id)
    quote = db.get(Quote, order.source_quote_id) if order.source_quote_id else None
    lines = db.query(ProdOrderLine).filter(ProdOrderLine.order_id == order.id).all()
    items = items_map(db, [l.item_id for l in lines])
    return {
        "id": order.id,
        "order_no": order.order_no,
        "product_id": order.product_id,
        "product_name": product.name if product else "—",
        "qty": float(order.qty),
        "due_date": order.due_date.isoformat() if order.due_date else None,
        "status": order.status,
        "source_quote_no": quote.quote_no if quote else None,
        "created_at": order.created_at.isoformat() if order.created_at else None,
        "lines": [
            {
                "item_id": l.item_id,
                "code": items.get(l.item_id).code if l.item_id in items else "",
                "description": items.get(l.item_id).description if l.item_id in items else "",
                "plan_qty": float(l.plan_qty),
                "issued_qty": float(l.issued_qty or 0),
                "pending": max(float(l.plan_qty) - float(l.issued_qty or 0), 0),
            }
            for l in lines
        ],
    }


def all_orders(db: Session) -> list[dict]:
    orders = db.query(ProductionOrder).order_by(ProductionOrder.created_at.desc()).all()
    return [order_view(db, o) for o in orders]