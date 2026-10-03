"""Import endpoints — BOM master upload & opening-stock upload (CSV/XLSX)."""

from __future__ import annotations

import csv
from io import BytesIO, StringIO

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from .. import bom_service
from ..db import get_session
from ..helpers import audit, post_ledger
from ..models import InventoryLedger, Item, Product
from .deps import get_current_user, require_roles

router = APIRouter(dependencies=[Depends(get_current_user)], prefix="/import", tags=["imports"])

MAX_TEXT = 8 * 1024 * 1024


def _rows_from(upload: UploadFile) -> list[dict]:
    """Parse CSV or XLSX into a list of row dicts."""
    raw = upload.file.read()
    if len(raw) > MAX_TEXT:
        raise HTTPException(413, "File too large")
    name = (upload.filename or "").lower()
    if name.endswith(".xlsx") or name.endswith(".xls"):
        try:
            import pandas as pd  # type: ignore[import-untyped]
        except ImportError as exc:  # pragma: no cover
            raise HTTPException(500, "pandas is not installed") from exc
        df = pd.read_excel(BytesIO(raw), dtype=str).fillna("")
        return df.to_dict(orient="records")
    text = raw.decode("utf-8-sig", errors="replace")
    return list(csv.DictReader(StringIO(text)))


@router.post("/bom")
def import_bom(upload: UploadFile = File(...),
               user=Depends(require_roles("production", "admin")),
               db: Session = Depends(get_session)):
    """CSV/XLSX columns: Product, Item Code, Qty Required Per Unit."""
    rows = _rows_from(upload)
    if not rows:
        raise HTTPException(422, "No rows found")
    created_products = 0
    created_items = 0
    created_headers = 0
    created_lines = 0
    for row in rows:
        pname = str(row.get("Product") or "").strip()
        code = str(row.get("Item Code") or row.get("item_code") or row.get("Code") or "").strip()
        try:
            qty = float(row.get("Qty Required Per Unit") or row.get("qty") or 1)
        except (TypeError, ValueError):
            qty = 1.0
        if not pname or not code or qty <= 0:
            continue

        product = db.query(Product).filter(Product.name == pname).first()
        if not product:
            product = Product(name=pname, category="Imported BOM", status="active")
            db.add(product)
            db.flush()
            created_products += 1

        item = db.query(Item).filter(Item.code == code).first()
        if not item:
            item = Item(code=code, description=code, category="imported")
            db.add(item)
            db.flush()
            created_items += 1

        header = bom_service.active_header(db, product_id=product.id)
        if not header:
            header = bom_service.create_revision(db, product.id, user.id, "Import upload")
            bom_service.activate_revision(db, header.id)
            db.flush()
            created_headers += 1

        bom_service.set_line(db, header.id, item.id, qty, 0)
        created_lines += 1

    audit(db, user_id=user.id, action="import.bom", entity="import",
          details={"products": created_products, "items": created_items,
                   "headers": created_headers, "lines": created_lines})
    db.commit()
    return {"ok": True, "products": created_products, "items": created_items,
            "headers": created_headers, "lines": created_lines}


@router.post("/inventory")
def import_inventory(upload: UploadFile = File(...),
                     user=Depends(require_roles("stores", "admin")),
                     db: Session = Depends(get_session)):
    """CSV/XLSX columns: Item Code, Quantity Available. Adds opening stock (idempotent)."""
    rows = _rows_from(upload)
    if not rows:
        raise HTTPException(422, "No rows found")
    posted = 0
    skipped = 0
    missing = []
    for row in rows:
        code = str(row.get("Item Code") or row.get("item_code") or row.get("Code") or "").strip()
        try:
            qty = float(row.get("Quantity Available") or row.get("qty") or 0)
        except (TypeError, ValueError):
            qty = 0.0
        if not code:
            continue
        item = db.query(Item).filter(Item.code == code).first()
        if not item:
            missing.append(code)
            continue
        already = (
            db.query(InventoryLedger.id)
            .filter(InventoryLedger.item_id == item.id,
                    InventoryLedger.trans_type == "opening")
            .first()
        )
        if already:
            skipped += 1
            continue
        post_ledger(db, item_id=item.id, trans_type="opening", qty_delta=qty,
                    user_id=user.id, note="Opening stock import")
        posted += 1

    audit(db, user_id=user.id, action="import.inventory", entity="import",
          details={"posted": posted, "skipped": skipped, "missing": missing})
    db.commit()
    return {"ok": True, "posted": posted, "skipped": skipped,
            "missing_codes": missing[:25], "missing_count": len(missing)}