"""Sales / quotation services — ATP-backed promised delivery dates."""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy.orm import Session

from . import atp_service, production_service
from .helpers import audit
from .models import Family, Product, Quote


def gen_quote_no(db: Session) -> str:
    last = db.query(Quote).order_by(Quote.id.desc()).first()
    seq = (last.id + 1) if last else 1
    return f"QT-{datetime.now().strftime('%y%m')}-{seq:04d}"


def create_quote(
    db: Session,
    *,
    product_id: int,
    qty: float,
    customer_name: str = "",
    customer_phone: str = "",
    unit_price: float | None = None,
    user_id: int | None,
    notes: str = "",
) -> Quote:
    product = db.get(Product, product_id)
    if not product:
        raise ValueError("Product not found")

    report = atp_service.build_n(db, product_id, target_qty=qty)
    family = db.get(Family, product.family_id) if product.family_id else None
    cycle_days = family.default_cycle_days if family else 5
    shipping_days = family.default_shipping_days if family else 3

    buildable_from_stock = report.ok_for_target
    procurement_days = report.max_lead_days

    delivery_days = cycle_days + shipping_days + (procurement_days if not buildable_from_stock else 0)
    promised = date.fromordinal(date.today().toordinal() + delivery_days)

    price = float(unit_price) if unit_price else float(product.price_value or 0)

    quote = Quote(
        quote_no=gen_quote_no(db),
        customer_name=customer_name,
        customer_phone=customer_phone,
        product_id=product_id,
        qty=qty,
        unit_price=price,
        total_value=round(price * qty, 2),
        promised_date=promised,
        status="new",
        notes=notes,
        created_by=user_id,
    )
    db.add(quote)
    db.flush()
    audit(db, user_id=user_id, action="quote.create", entity="quote",
          entity_id=quote.id,
          details={"promised_date": str(promised), "buildable_from_stock": buildable_from_stock,
                   "procurement_days": procurement_days})
    return quote


def confirm_quote(db: Session, quote: Quote, user_id: int | None) -> dict:
    if quote.status == "confirmed":
        raise ValueError("Quote already confirmed")
    order = production_service.create_production_order(
        db,
        product_id=quote.product_id,
        qty=float(quote.qty),
        due_date=quote.promised_date,
        user_id=user_id,
        source_quote_id=quote.id,
    )
    quote.status = "confirmed"
    db.flush()
    audit(db, user_id=user_id, action="quote.confirm", entity="quote",
          entity_id=quote.id, details={"order_no": order.order_no})
    return {"quote_id": quote.id, "order_no": order.order_no, "order_id": order.id}


def quote_view(db: Session, quote: Quote) -> dict:
    product = db.get(Product, quote.product_id)
    report = atp_service.build_n(db, quote.product_id, target_qty=float(quote.qty))
    return {
        "id": quote.id,
        "quote_no": quote.quote_no,
        "customer_name": quote.customer_name,
        "customer_phone": quote.customer_phone,
        "product_id": quote.product_id,
        "product_name": product.name if product else "—",
        "qty": float(quote.qty),
        "unit_price": float(quote.unit_price or 0),
        "total_value": float(quote.total_value or 0),
        "promised_date": quote.promised_date.isoformat() if quote.promised_date else None,
        "status": quote.status,
        "notes": quote.notes,
        "created_at": quote.created_at.isoformat() if quote.created_at else None,
        "availability": {
            "buildable_now": report.buildable_now,
            "buildable_from_stock": report.ok_for_target,
            "max_lead_days": report.max_lead_days,
            "shortage_value": report.shortage_value,
        },
    }


def all_quotes(db: Session) -> list[dict]:
    quotes = db.query(Quote).order_by(Quote.created_at.desc()).all()
    return [quote_view(db, q) for q in quotes]