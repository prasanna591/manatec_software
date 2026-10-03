"""ATP endpoints — buildable-now and build-N what-if (ported from manatec_platform/api/atp.py)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import atp_service
from ..db import get_db
from ..models import Product, User
from ..security import requires

router = APIRouter(prefix="/atp", tags=["atp"])


def _result_json(r: atp_service.AtpResult) -> dict:
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


@router.get("/buildable")
def buildable(db: Session = Depends(get_db), _: User = Depends(requires("BOM", "view"))):
    rows = atp_service.all_buildable(db)
    rows.sort(key=lambda r: (r.buildable_now is None, r.buildable_now if r.buildable_now is not None else -1))
    ok = sum(1 for r in rows if r.buildable_now and r.buildable_now > 0)
    blocked = sum(1 for r in rows if r.has_bom and (not r.buildable_now or r.buildable_now == 0))
    no_bom = sum(1 for r in rows if not r.has_bom)
    return {
        "products": [_result_json(r) for r in rows],
        "ok": ok, "blocked": blocked, "no_bom": no_bom, "total": len(rows),
    }


class WhatIfIn(BaseModel):
    product_id: int
    qty: float


@router.post("/what-if")
def what_if(body: WhatIfIn, db: Session = Depends(get_db),
            _: User = Depends(requires("BOM", "view"))):
    if not db.get(Product, body.product_id):
        raise HTTPException(404, "Product not found")
    r = atp_service.build_n(db, body.product_id, target_qty=float(body.qty))
    return _result_json(r)