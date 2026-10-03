"""Procurement services — buy-list, purchase orders, goods receipt (ported from manatec_platform)."""
from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy.orm import Session

from .leadtime import resolve_lead_days
from .mfg_helpers import audit, item_avg_price, items_map, post_ledger
from .models import Item, PoLine, PurchaseOrder, Supplier, SupplierItem, User


def part_shortages(db: Session, shortages: dict[int, float]) -> list[dict]:
    """Turn {item_id: qty_short} into a buy-list, grouped with supplier info.

    Returns rows sorted by lead time then value — the natural purchase order.
    """
    items = items_map(db, shortages.keys())
    rows = []
    for item_id, qty in shortages.items():
        item = items.get(int(item_id))
        if not item or qty <= 0:
            continue
        lo, hi = resolve_lead_days(db, item)
        supplier = None
        price = 0.0
        if item.default_supplier_id:
            supplier = db.get(Supplier, item.default_supplier_id)
        si = (
            db.query(SupplierItem)
            .filter(SupplierItem.item_id == item.id)
            .order_by(SupplierItem.price.asc())
            .first()
        )
        if si and not supplier:
            supplier = db.get(Supplier, si.supplier_id)
            price = float(si.price or 0)
        elif si and supplier and si.supplier_id != supplier.id:
            price = float(si.price or 0)
        unit = price or item_avg_price(db, item.id)
        rows.append({
            "item_id": item.id,
            "code": item.code,
            "description": item.description,
            "category": item.category,
            "qty_short": round(float(qty), 3),
            "unit_cost": round(unit, 2),
            "value": round(unit * float(qty), 2),
            "lead_days_min": lo,
            "lead_days_max": hi,
            "supplier_id": supplier.id if supplier else None,
            "supplier_name": supplier.name if supplier else "— (no supplier mapped)",
        })
    rows.sort(key=lambda r: (-r["lead_days_max"], -r["value"]))
    return rows


def gen_po_no(db: Session) -> str:
    last = db.query(PurchaseOrder).order_by(PurchaseOrder.id.desc()).first()
    seq = (last.id + 1) if last else 1
    return f"PO-{datetime.now(timezone.utc).strftime('%y%m')}-{seq:04d}"


def create_po(
    db: Session,
    *,
    supplier_id: int,
    lines: list[dict],
    user_id: int | None,
    note: str = "",
) -> PurchaseOrder:
    """lines: [{item_id, qty, unit_price}] (price auto-filled when 0)."""
    supplier = db.get(Supplier, supplier_id)
    if not supplier:
        raise ValueError(f"Supplier {supplier_id} not found")

    po = PurchaseOrder(
        po_no=gen_po_no(db),
        supplier_id=supplier_id,
        status="draft",
        note=note,
        created_by=user_id,
    )
    db.add(po)
    db.flush()

    total = 0.0
    for ln in lines:
        item = db.get(Item, ln["item_id"])
        if item is None:
            raise ValueError(f"Item {ln['item_id']} not found")
        price = float(ln.get("unit_price") or 0) or item_avg_price(db, item.id)
        qty = float(ln["qty"])
        if qty <= 0:
            continue
        db.add(PoLine(po_id=po.id, item_id=item.id, qty=qty, unit_price=price))
        total += qty * price
    po.total_value = round(total, 2)
    db.flush()
    audit(db, user=db.get(User, user_id) if user_id else None, action="po.create",
          entity="purchase_order", entity_id=po.id, details={"po_no": po.po_no, "supplier_id": supplier_id})
    return po


def issue_po(db: Session, po: PurchaseOrder, user_id: int | None) -> PurchaseOrder:
    if po.status not in ("draft",):
        raise ValueError(f"PO already {po.status}")
    lo, hi = _po_lead_window(db, po)
    po.issue_date = datetime.now(timezone.utc).replace(tzinfo=None)
    po.expected_delivery_date = date.fromordinal(date.today().toordinal() + int(hi))
    po.status = "issued"
    db.flush()
    audit(db, user=db.get(User, user_id) if user_id else None,
          action="po.issue", entity="purchase_order", entity_id=po.id,
          details={"eta": str(po.expected_delivery_date), "lead_days": hi})
    return po


def receive_po(
    db: Session, po: PurchaseOrder, received: list[dict], user_id: int | None
) -> dict:
    """received: [{line_id, qty}] — posts GRN into stock, closes/partials PO."""
    done = []
    for r in received:
        line = db.get(PoLine, r["line_id"])
        if not line or line.po_id != po.id:
            raise ValueError(f"Bad line {r.get('line_id')}")
        qty = float(r["qty"])
        if qty <= 0:
            continue
        received_now = float(line.received_qty or 0)
        if received_now + qty > float(line.qty) + 1e-9:
            raise ValueError(f"Over-receipt on line {line.id}")
        line.received_qty = received_now + qty
        post_ledger(
            db,
            item_id=line.item_id,
            trans_type="grn",
            qty_delta=qty,
            user_id=user_id,
            ref_type="po",
            ref_id=po.id,
            note=f"GRN on {po.po_no}",
        )
        done.append({"line_id": line.id, "item_id": line.item_id, "qty": qty})

    lines = db.query(PoLine).filter(PoLine.po_id == po.id).all()
    total_ordered = sum(float(l.qty) for l in lines)
    total_received = sum(float(l.received_qty) for l in lines)
    if total_received >= total_ordered - 1e-9:
        po.status = "completed"
    elif total_received > 0:
        po.status = "partial"
    db.flush()
    audit(db, user=db.get(User, user_id) if user_id else None, action="po.receive",
          entity="purchase_order", entity_id=po.id, details={"lines": done, "status": po.status})
    return {"received": done, "status": po.status}


def _po_lead_window(db: Session, po: PurchaseOrder) -> tuple[int, int]:
    lines = db.query(PoLine).filter(PoLine.po_id == po.id).all()
    lo = hi = 0
    for line in lines:
        item = db.get(Item, line.item_id)
        if not item:
            continue
        ilo, ihi = resolve_lead_days(db, item)
        lo = max(lo, ilo)
        hi = max(hi, ihi)
    if hi == 0:
        supplier = db.get(Supplier, po.supplier_id)
        hi = supplier.lead_time_days_default if supplier else 20
        lo = hi
    return lo, hi


def po_view(db: Session, po: PurchaseOrder) -> dict:
    supplier = db.get(Supplier, po.supplier_id)
    lines = db.query(PoLine).filter(PoLine.po_id == po.id).all()
    items = items_map(db, [l.item_id for l in lines])
    overdue = (
        po.status in ("issued", "partial")
        and po.expected_delivery_date
        and po.expected_delivery_date < date.today()
    )
    return {
        "id": po.id,
        "po_no": po.po_no,
        "supplier_id": po.supplier_id,
        "supplier_name": supplier.name if supplier else "—",
        "status": po.status,
        "issue_date": po.issue_date.isoformat() if po.issue_date else None,
        "expected_delivery_date": po.expected_delivery_date.isoformat() if po.expected_delivery_date else None,
        "total_value": float(po.total_value or 0),
        "note": po.note,
        "overdue": overdue,
        "lines": [
            {
                "id": l.id,
                "item_id": l.item_id,
                "code": items.get(l.item_id).code if l.item_id in items else "",
                "description": items.get(l.item_id).description if l.item_id in items else "",
                "qty": float(l.qty),
                "unit_price": float(l.unit_price or 0),
                "received_qty": float(l.received_qty or 0),
                "remaining": max(float(l.qty) - float(l.received_qty or 0), 0),
            }
            for l in lines
        ],
    }


def all_pos(db: Session) -> list[dict]:
    pos = db.query(PurchaseOrder).order_by(PurchaseOrder.created_at.desc()).all()
    return [po_view(db, p) for p in pos]