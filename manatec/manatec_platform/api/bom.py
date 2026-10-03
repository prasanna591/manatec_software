"""BOM endpoints — tree, explode, revision lifecycle, sub-assemblies."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import bom_service
from ..db import get_session
from ..helpers import audit
from ..models import BomHeader, BomLine, Item, Product
from .deps import require_roles

router = APIRouter(prefix="/bom", tags=["bom"])


class LineIn(BaseModel):
    child_item_id: int
    qty: float = 1
    scrap_pct: float = 0


class SubAssemblyIn(BaseModel):
    lines: list[LineIn]


def _product_404(db: Session, product_id: int) -> Product:
    p = db.get(Product, product_id)
    if not p:
        raise HTTPException(404, "Product not found")
    return p


@router.get("/products")
def bom_products(db: Session = Depends(get_session)):
    """Products that have a BOM (used by ATP & the BOM page)."""
    rows = db.query(Product).join(
        BomHeader, (BomHeader.product_id == Product.id) & (BomHeader.status == "active")
    ).order_by(Product.name).all()
    return {
        "items": [
            {
                "id": p.id, "name": p.name, "image_url": p.image_url,
                "category": p.category, "price_raw": p.price_raw,
            }
            for p in rows
        ]
    }


@router.get("/{product_id}")
def bom_detail(product_id: int, db: Session = Depends(get_session)):
    p = _product_404(db, product_id)
    meta = bom_service.bom_meta(db, product_id)
    meta["tree"] = bom_service.tree(db, product_id)
    meta["flat"] = [
        {"item_id": iid, "qty": qty} for iid, qty in bom_service.explode(db, product_id).items()
    ]
    meta["product_name"] = p.name
    return meta


def _ensure_active_header(db: Session, product_id: int, user_id: int) -> BomHeader:
    header = bom_service.active_header(db, product_id=product_id)
    if not header:
        header = bom_service.create_revision(db, product_id, user_id, "Initial")
        bom_service.activate_revision(db, header.id)
    return header


@router.post("/{product_id}/lines")
def add_line(product_id: int, body: LineIn, user=Depends(require_roles("production", "admin")),
             db: Session = Depends(get_session)):
    _product_404(db, product_id)
    if not db.get(Item, body.child_item_id):
        raise HTTPException(404, "Item not found")
    header = _ensure_active_header(db, product_id, user.id)
    bom_service.set_line(db, header.id, body.child_item_id, body.qty, body.scrap_pct)
    audit(db, user_id=user.id, action="bom.add_line", entity="product",
          entity_id=product_id, details={"item_id": body.child_item_id, "qty": body.qty})
    db.commit()
    return {"ok": True}


@router.delete("/lines/{line_id}")
def remove_line(line_id: int, user=Depends(require_roles("production", "admin")),
                db: Session = Depends(get_session)):
    line = db.get(BomLine, line_id)
    if not line:
        raise HTTPException(404, "Line not found")
    db.delete(line)
    db.commit()
    audit(db, user_id=user.id, action="bom.remove_line", entity="bom_line", entity_id=line_id)
    return {"ok": True}


@router.post("/{product_id}/revise")
def new_revision(product_id: int, user=Depends(require_roles("production", "admin")),
                 db: Session = Depends(get_session)):
    _product_404(db, product_id)
    header = bom_service.create_revision(db, product_id, user.id)
    audit(db, user_id=user.id, action="bom.revise", entity="product",
          entity_id=product_id, details={"rev_no": header.rev_no})
    db.commit()
    return {"ok": True, "rev_no": header.rev_no, "header_id": header.id}


@router.post("/{product_id}/activate/{header_id}")
def activate_revision(product_id: int, header_id: int,
                      user=Depends(require_roles("production", "admin")),
                      db: Session = Depends(get_session)):
    header = db.get(BomHeader, header_id)
    if not header or header.product_id != product_id:
        raise HTTPException(404, "Revision not found")
    bom_service.activate_revision(db, header.id)
    audit(db, user_id=user.id, action="bom.activate", entity="product",
          entity_id=product_id, details={"rev_no": header.rev_no})
    db.commit()
    return {"ok": True, "rev_no": header.rev_no}


def _ensure_assembly_header(db: Session, item: Item, user_id: int) -> BomHeader:
    header = bom_service.active_header(db, item_id=item.id)
    if not header:
        header = BomHeader(
            item_id=item.id, rev_no=1, name=f"{item.code} assembly",
            status="active", created_by=user_id,
        )
        db.add(header)
        db.flush()
    item.is_assembly = True
    return header


@router.post("/subassembly/{item_id}/children")
def define_subassembly(item_id: int, body: SubAssemblyIn,
                       user=Depends(require_roles("production", "admin")),
                       db: Session = Depends(get_session)):
    item = db.get(Item, item_id)
    if not item:
        raise HTTPException(404, "Item not found")
    header = _ensure_assembly_header(db, item, user.id)
    for ln in body.lines:
        if not db.get(Item, ln.child_item_id):
            raise HTTPException(404, f"Child item {ln.child_item_id} missing")
        bom_service.set_line(db, header.id, ln.child_item_id, ln.qty, ln.scrap_pct)
    audit(db, user_id=user.id, action="bom.subassembly", entity="item",
          entity_id=item_id, details={"lines": len(body.lines)})
    db.commit()
    return {"ok": True, "item_id": item_id}