"""BOM services — revisions, tree, and multi-level explode (ported from manatec_platform)."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from .models import BomHeader, BomLine, Item, Product


def active_header(
    db: Session,
    *,
    product_id: int | None = None,
    item_id: int | None = None,
) -> BomHeader | None:
    q = db.query(BomHeader).filter(BomHeader.status == "active")
    if product_id is not None:
        q = q.filter(BomHeader.product_id == product_id, BomHeader.item_id.is_(None))
    else:
        q = q.filter(BomHeader.item_id == item_id, BomHeader.product_id.is_(None))
    return q.order_by(BomHeader.rev_no.desc()).first()


def header_for(db: Session, header_id: int) -> BomHeader | None:
    return db.get(BomHeader, header_id)


def lines_for(db: Session, header_id: int) -> list[BomLine]:
    return db.query(BomLine).filter(BomLine.header_id == header_id).order_by(BomLine.seq).all()


def is_assembly_item(db: Session, item_id: int) -> bool:
    return (
        db.query(BomHeader.id)
        .filter(BomHeader.item_id == item_id, BomHeader.status == "active", BomHeader.product_id.is_(None))
        .first()
        is not None
    )


def tree(db: Session, product_id: int, _depth: int = 0, _seen: set | None = None) -> list[dict]:
    """Nested BOM tree for a product (children expanded recursively)."""
    _seen = _seen or set()
    header = active_header(db, product_id=product_id)
    if not header:
        return []
    out = []
    for line in lines_for(db, header.id):
        item = db.get(Item, line.child_item_id)
        node = {
            "item_id": item.id if item else None,
            "code": item.code if item else "",
            "description": item.description if item else "",
            "qty": float(line.qty),
            "scrap_pct": float(line.scrap_pct),
            "is_assembly": False,
            "children": [],
        }
        if item and is_assembly_item(db, item.id) and item.id not in _seen:
            node["is_assembly"] = True
            node["children"] = tree(db, item.id, _depth + 1, _seen | {item.id})
        out.append(node)
    return out


def explode(db: Session, product_id: int) -> dict[int, float]:
    """Flatten a product's BOM to {item_id: qty per unit} including scrap.

    Sub-assemblies are recursively resolved; cycles are broken with a seen-set.
    Scrap is applied per line (qty * (1 + scrap_pct)).
    """
    out: dict[int, float] = {}

    def _add(item_id: int, qty: float) -> None:
        qty = round(float(qty), 6)
        if qty:
            out[item_id] = out.get(item_id, 0.0) + qty

    def _visit(parent_id: int | None, item_id: int, qty_mult: float, seen: frozenset[int]) -> None:
        header = (
            active_header(db, product_id=parent_id)
            if parent_id is not None
            else active_header(db, item_id=item_id)
        )
        if header is None:
            _add(item_id, qty_mult)
            return
        for line in lines_for(db, header.id):
            child = db.get(Item, line.child_item_id)
            if child is None or child.id in seen:
                continue
            qty = qty_mult * float(line.qty) * (1.0 + float(line.scrap_pct or 0) / 100.0)
            if is_assembly_item(db, child.id):
                _visit(None, child.id, qty, seen | {child.id})
            else:
                _add(child.id, qty)

    _visit(product_id, product_id, 1.0, frozenset())
    return out


def bom_meta(db: Session, product_id: int) -> dict | None:
    """Header-level metadata incl. revision list for the UI."""
    product = db.get(Product, product_id)
    if not product:
        return None
    headers = (
        db.query(BomHeader)
        .filter(BomHeader.product_id == product_id, BomHeader.item_id.is_(None))
        .order_by(BomHeader.rev_no.desc())
        .all()
    )
    return {
        "product_id": product.id,
        "product_name": product.name,
        "revs": [
            {
                "id": h.id,
                "rev_no": h.rev_no,
                "status": h.status,
                "created_at": h.created_at.isoformat() if h.created_at else None,
                "line_count": len(lines_for(db, h.id)),
            }
            for h in headers
        ],
    }


def set_line(db: Session, header_id: int, child_item_id: int, qty: float, scrap_pct: float = 0) -> BomLine:
    line = db.query(BomLine).filter_by(header_id=header_id, child_item_id=child_item_id).first()
    if not line:
        line = BomLine(header_id=header_id, child_item_id=child_item_id, qty=0)
        db.add(line)
    line.qty = qty
    line.scrap_pct = scrap_pct
    db.flush()
    return line


def remove_line(db: Session, line_id: int) -> None:
    line = db.get(BomLine, line_id)
    if line:
        db.delete(line)


def create_revision(db: Session, product_id: int, user_id: int | None, name: str = "") -> BomHeader:
    """Open a new draft revision (copying the current active revision's lines)."""
    current = active_header(db, product_id=product_id)
    rev_no = (current.rev_no + 1) if current else 1
    header = BomHeader(
        product_id=product_id,
        rev_no=rev_no,
        name=name,
        status="draft",
        created_by=user_id,
    )
    db.add(header)
    db.flush()
    if current:
        for line in lines_for(db, current.id):
            db.add(BomLine(header_id=header.id, child_item_id=line.child_item_id,
                           qty=line.qty, scrap_pct=line.scrap_pct, seq=line.seq))
    db.flush()
    return header


def activate_revision(db: Session, header_id: int) -> None:
    header = db.get(BomHeader, header_id)
    if not header:
        return
    db.query(BomHeader).filter(
        BomHeader.status == "active",
        BomHeader.product_id == header.product_id,
        BomHeader.item_id.is_(None),
    ).update({"status": "superseded"})
    header.status = "active"
    if header.effective_from is None:
        header.effective_from = datetime.now(timezone.utc).replace(tzinfo=None)
    header.effective_to = None