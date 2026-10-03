"""BOM endpoints — revisions, product tree, explode (ported from manatec_platform api)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import atp_service, bom_service
from ..db import get_db
from ..mfg_helpers import audit
from ..models import BomHeader, BomLine, Item, Product, User
from ..security import requires

router = APIRouter(prefix="/bom", tags=["bom"])


def _tree_json(db: Session, product_id: int) -> list[dict]:
    return bom_service.tree(db, product_id)


@router.get("/products")
def bom_products(db: Session = Depends(get_db), _: User = Depends(requires("BOM", "view"))):
    """All products with an active BOM plus their ATP snapshot."""
    rows = atp_service.all_buildable(db)
    rows.sort(key=lambda r: (r.buildable_now is None, r.buildable_now if r.buildable_now is not None else -1))
    return {
        "items": [
            {
                "product_id": r.product_id,
                "product_name": r.product_name,
                "has_bom": r.has_bom,
                "buildable_now": r.buildable_now,
                "limiting_item": r.limiting_item,
                "line_count": len(r.coverage),
                "shortage_value": r.shortage_value,
            }
            for r in rows
        ],
        "ok": sum(1 for r in rows if r.buildable_now and r.buildable_now > 0),
        "blocked": sum(1 for r in rows if r.has_bom and (not r.buildable_now or r.buildable_now == 0)),
        "total": len(rows),
    }


@router.get("/products/{product_id}")
def bom_detail(product_id: int, db: Session = Depends(get_db),
               _: User = Depends(requires("BOM", "view"))):
    meta = bom_service.bom_meta(db, product_id)
    if not meta:
        raise HTTPException(404, "Product not found")
    report = atp_service.buildable_now(db, product_id)
    return {
        "meta": meta,
        "tree": _tree_json(db, product_id),
        "atp": _report_json(report),
    }


@router.get("/products/{product_id}/explode")
def bom_explode(product_id: int, db: Session = Depends(get_db),
                _: User = Depends(requires("BOM", "view"))):
    if not db.get(Product, product_id):
        raise HTTPException(404, "Product not found")
    flat = bom_service.explode(db, product_id)
    items = {i.id: i for i in db.query(Item).filter(Item.id.in_(flat.keys())).all()}
    return {
        "items": [
            {
                "item_id": item_id,
                "code": items[item_id].code,
                "description": items[item_id].description,
                "qty_per_unit": qty,
            }
            for item_id, qty in sorted(flat.items(), key=lambda kv: -kv[1])
        ]
    }


class LineIn(BaseModel):
    item_id: int
    qty: float
    scrap_pct: float = 0


@router.post("/products/{product_id}/lines", status_code=201)
def set_line(product_id: int, body: LineIn, db: Session = Depends(get_db),
             actor: User = Depends(requires("BOM", "edit"))):
    header = bom_service.active_header(db, product_id=product_id)
    if not header:
        header = bom_service.create_revision(db, product_id, actor.id, "Manual edit")
        bom_service.activate_revision(db, header.id)
        db.flush()
    line = bom_service.set_line(db, header.id, body.item_id, body.qty, body.scrap_pct)
    audit(db, user=actor, action="bom.line.set", entity="product", entity_id=product_id,
          details={"item_id": body.item_id, "qty": body.qty})
    db.commit()
    return {"ok": True, "line_id": line.id}


@router.delete("/lines/{line_id}")
def delete_line(line_id: int, db: Session = Depends(get_db),
                actor: User = Depends(requires("BOM", "edit"))):
    line = db.get(BomLine, line_id)
    if line is None:
        raise HTTPException(404, "Line not found")
    db.delete(line)
    audit(db, user=actor, action="bom.line.delete", entity="bom_line", entity_id=line_id)
    db.commit()
    return {"ok": True}


class RevisionIn(BaseModel):
    name: str = ""


@router.post("/products/{product_id}/revisions", status_code=201)
def new_revision(product_id: int, body: RevisionIn, db: Session = Depends(get_db),
                 actor: User = Depends(requires("BOM", "create"))):
    if not db.get(Product, product_id):
        raise HTTPException(404, "Product not found")
    header = bom_service.create_revision(db, product_id, actor.id, body.name)
    audit(db, user=actor, action="bom.revision.create", entity="product", entity_id=product_id,
          details={"rev_no": header.rev_no})
    db.commit()
    return {"ok": True, "header_id": header.id, "rev_no": header.rev_no}


@router.post("/revisions/{header_id}/activate")
def activate_revision(header_id: int, db: Session = Depends(get_db),
                      actor: User = Depends(requires("BOM", "approve"))):
    header = db.get(BomHeader, header_id)
    if header is None:
        raise HTTPException(404, "Revision not found")
    bom_service.activate_revision(db, header_id)
    audit(db, user=actor, action="bom.revision.activate", entity="bom_header", entity_id=header_id,
          details={"rev_no": header.rev_no})
    db.commit()
    return {"ok": True, "rev_no": header.rev_no}


def _report_json(r: atp_service.AtpResult) -> dict:
    return {
        "product_id": r.product_id,
        "product_name": r.product_name,
        "has_bom": r.has_bom,
        "buildable_now": r.buildable_now,
        "limiting_item": r.limiting_item,
        "limiting_item_id": r.limiting_item_id,
        "coverage": [
            {
                "item_id": c.item_id, "code": c.code, "description": c.description,
                "need_per_unit": c.need_per_unit, "req_for_target": c.req_for_target,
                "on_hand": c.on_hand, "in_transit": c.in_transit, "committed": c.committed,
                "avail": c.avail, "short": c.short, "unit_cost": c.unit_cost,
                "lead_days_min": c.lead_days_min, "lead_days_max": c.lead_days_max,
                "buildable_this_item": c.buildable_this_item,
                "shared_with": c.shared_with,
            }
            for c in r.coverage
        ],
        "total_line_value": r.total_line_value,
        "whatif_qty": r.whatif_qty,
        "shortage_value": r.shortage_value,
        "max_lead_days": r.max_lead_days,
        "ok_for_target": r.ok_for_target,
    }