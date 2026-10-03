"""BOM Analyzer endpoints — upload, analyse, export (ported from manatec/app.py Flask)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import analyzer_service
from ..db import get_db
from ..models import User
from ..security import requires

router = APIRouter(prefix="/analyzer", tags=["analyzer"])


@router.post("/analyze")
def analyze(
    inventory: UploadFile = File(...),
    master: UploadFile = File(...),
    inv_item: str | None = Form(None),
    inv_qty: str | None = Form(None),
    master_item: str | None = Form(None),
    master_qty: str | None = Form(None),
    master_product: str | None = Form(None),
    db: Session = Depends(get_db),
    _: User = Depends(requires("Reports", "view")),
):
    if not inventory.filename or not master.filename:
        raise HTTPException(400, "Uploaded files must have a name.")
    overrides = {
        "item_col": inv_item,
        "qty_col": inv_qty,
        "master_item": master_item,
        "master_qty": master_qty,
        "master_product": master_product,
    }
    try:
        inv = analyzer_service.read_inventory(
            inventory.file, filename=inventory.filename,
            item_col=overrides["item_col"], qty_col=overrides["qty_col"],
        )
    except Exception as exc:  # noqa: BLE001 — surface readable errors
        raise HTTPException(400, f"Inventory file error: {exc}") from exc
    try:
        master.file.seek(0)
        bom_map = analyzer_service.read_master(
            master.file, filename=master.filename,
            item_col=overrides["master_item"], qty_col=overrides["master_qty"],
            product_col=overrides["master_product"],
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(400, f"Master BOM file error: {exc}") from exc

    analysis = {pname: analyzer_service.analyze_product(bom, inv) for pname, bom in bom_map.items()}
    products = _collect(bom_map, analysis, inv)
    buildable = sum(1 for p in products if p["status"] == "OK")
    return {
        "inventory_count": len(inv),
        "master_item_count": sum(len(b) for b in bom_map.values()),
        "product_count": len(products),
        "buildable": buildable,
        "blocked": len(products) - buildable,
        "products": products,
    }


class ExportIn(BaseModel):
    products: list[dict]
    format: str = "xlsx"


@router.post("/export")
def export(body: ExportIn, _: User = Depends(requires("Reports", "export"))):
    if not body.products:
        raise HTTPException(400, "Nothing to export.")
    fmt = body.format.lower()
    if fmt == "csv":
        buf = analyzer_service.export_csv(body.products)
        return StreamingResponse(
            buf, media_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="bom_report.csv"'},
        )
    if fmt == "xlsx":
        buf = analyzer_service.export_xlsx(body.products)
        return StreamingResponse(
            buf,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": 'attachment; filename="bom_report.xlsx"'},
        )
    raise HTTPException(422, f"Unsupported format {fmt!r}")


def _collect(bom_map, analysis, inv):
    products = []
    for pname, bom in bom_map.items():
        r = analysis[pname]
        rows = []
        for item, need_per_unit in sorted(bom.items()):
            have = inv.get(item, 0)
            buildable = r["max_units"]
            rows.append({
                "item": item, "in_bom": True, "need": need_per_unit, "have": have,
                "capacity": (have // need_per_unit) if need_per_unit > 0 else 0,
                "max_units": buildable,
                "stock_after": max(have - buildable * need_per_unit, 0),
                "shortage": max(need_per_unit - have, 0) if have < need_per_unit else 0,
                "status": "OK" if have >= need_per_unit else "SHORT",
            })
        for item, have in sorted(inv.items()):
            if item not in bom:
                rows.append({
                    "item": item, "in_bom": False, "need": 0, "have": have,
                    "capacity": None, "max_units": 0, "stock_after": have,
                    "shortage": 0, "status": "EXTRA",
                })
        products.append({
            "name": pname,
            "max_units": r["max_units"],
            "status": "OK" if r["max_units"] > 0 else "BLOCKED",
            "bom_item_count": r["bom_item_count"],
            "missing_count": len(r["missing_items"]),
            "shortage_count": len(r["shortage_details"]),
            "leftover_count": len(r["leftover_after_production"]),
            "leftover_total": sum(r["leftover_after_production"].values()),
            "unused_count": len(r["extra_unmatched"]),
            "unused_total": sum(r["extra_unmatched"].values()),
            "rows": rows,
            **analyzer_service.enrich(pname),
        })
    return products