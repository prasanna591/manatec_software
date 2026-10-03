"""Sales quote endpoints (ported from manatec_platform/api/ops.py)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import quote_service
from ..db import get_db
from ..models import Quote, User
from ..security import requires

router = APIRouter(prefix="/quotes", tags=["quotes"])


def _quote_404(db: Session, quote_id: int) -> Quote:
    quote = db.get(Quote, quote_id)
    if not quote:
        raise HTTPException(404, "Quote not found")
    return quote


class QuoteIn(BaseModel):
    product_id: int
    qty: float
    customer_name: str = ""
    customer_phone: str = ""
    unit_price: float | None = None
    notes: str = ""


@router.get("")
def quotes(db: Session = Depends(get_db), _: User = Depends(requires("Quotations", "view"))):
    return {"items": quote_service.all_quotes(db)}


@router.post("", status_code=201)
def create_quote(body: QuoteIn, db: Session = Depends(get_db),
                 actor: User = Depends(requires("Quotations", "create"))):
    try:
        quote = quote_service.create_quote(
            db, product_id=body.product_id, qty=body.qty,
            customer_name=body.customer_name, customer_phone=body.customer_phone,
            unit_price=body.unit_price, user_id=actor.id, notes=body.notes)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    db.commit()
    return quote_service.quote_view(db, quote)


@router.post("/{quote_id}/confirm")
def confirm_quote(quote_id: int, db: Session = Depends(get_db),
                  actor: User = Depends(requires("Quotations", "approve"))):
    quote = _quote_404(db, quote_id)
    try:
        result = quote_service.confirm_quote(db, quote, actor.id)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    db.commit()
    return {"ok": True, **result}