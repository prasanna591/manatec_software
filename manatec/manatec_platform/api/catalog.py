"""Catalog endpoints — products, items, families."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..db import get_session
from ..helpers import on_hand
from ..models import Family, Item, Product, Supplier
from .deps import admin_only, get_current_user

router = APIRouter(dependencies=[Depends(get_current_user)], tags=["catalog"])


def _product_json(db: Session, p: Product) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "model_code": p.model_code,
        "category": p.category,
        "family_id": p.family_id,
        "family_name": db.get(Family, p.family_id).name if p.family_id else None,
        "slug": p.slug,
        "price_raw": p.price_raw,
        "price_value": float(p.price_value or 0),
        "status": p.status,
        "image_url": p.image_url,
        "url": p.url,
    }


def _item_json(db: Session, item: Item, include_stock: bool = False) -> dict:
    supplier = db.get(Supplier, item.default_supplier_id) if item.default_supplier_id else None
    row = {
        "id": item.id,
        "code": item.code,
        "description": item.description,
        "uom": item.uom,
        "category": item.category,
        "source_class": item.source_class,
        "lead_time_days_min": item.lead_time_days_min,
        "lead_time_days_max": item.lead_time_days_max,
        "min_qty": float(item.min_qty or 0),
        "max_qty": float(item.max_qty or 0),
        "default_supplier_id": item.default_supplier_id,
        "default_supplier_name": supplier.name if supplier else None,
        "is_assembly": item.is_assembly,
    }
    if include_stock:
        row["on_hand"] = on_hand(db, item.id)
    return row


@router.get("/products")
def list_products(q: str = "", db: Session = Depends(get_session)):
    rows = db.query(Product)
    if q:
        rows = rows.filter(func.lower(Product.name).like(f"%{q.lower()}%"))
    rows = rows.order_by(Product.name).all()
    return {"items": [_product_json(db, p) for p in rows], "total": len(rows)}


@router.get("/products/{product_id}")
def product_detail(product_id: int, db: Session = Depends(get_session)):
    p = db.get(Product, product_id)
    if not p:
        raise HTTPException(404, "Product not found")
    return _product_json(db, p)


class ProductIn(BaseModel):
    name: str
    model_code: str = ""
    category: str = ""
    family_id: int | None = None
    price_value: float = 0
    image_url: str = ""


@router.post("/products")
def create_product(body: ProductIn, user=Depends(admin_only), db: Session = Depends(get_session)):
    p = Product(name=body.name, model_code=body.model_code, category=body.category,
                family_id=body.family_id, price_value=body.price_value,
                image_url=body.image_url, slug=body.model_code or "")
    db.add(p)
    db.commit()
    db.refresh(p)
    return _product_json(db, p)


@router.get("/items")
def list_items(q: str = "", db: Session = Depends(get_session)):
    rows = db.query(Item)
    if q:
        rows = rows.filter(func.lower(Item.code).like(f"%{q.lower()}%"))
    rows = rows.order_by(Item.code).all()
    return {"items": [_item_json(db, i, include_stock=True) for i in rows], "total": len(rows)}


@router.get("/items/{item_id}")
def item_detail(item_id: int, db: Session = Depends(get_session)):
    item = db.get(Item, item_id)
    if not item:
        raise HTTPException(404, "Item not found")
    from ..helpers import available, committed, in_transit
    return {
        **_item_json(db, item, include_stock=True),
        "in_transit": in_transit(db, item.id),
        "committed": committed(db, item.id),
        "available": available(db, item.id),
    }


class ItemIn(BaseModel):
    code: str
    description: str = ""
    uom: str = "pcs"
    category: str = ""
    source_class: str = "medium"
    lead_time_days_min: int = 10
    lead_time_days_max: int = 20
    min_qty: float = 0
    max_qty: float = 0
    default_supplier_id: int | None = None


@router.post("/items", status_code=201)
def create_item(body: ItemIn, user=Depends(admin_only), db: Session = Depends(get_session)):
    if db.query(Item).filter_by(code=body.code).first():
        raise HTTPException(409, f"Item code {body.code!r} already exists")
    item = Item(**body.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return _item_json(db, item)