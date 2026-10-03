"""FRS 10 — Stores/Inventory stock engine.

The platform owns a StockBalance ledger seeded from the ERP cached OnHandStock.
Every movement (GRN, issue, transfer, count adjustment) writes a signed
StockMovement and updates the balance. ERP stays read-only until the §18.3
write-back contract lands.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from .erp import get_cached
from .models import (
    GoodsReceiptNote,
    MaterialIssue,
    MaterialRequest,
    StockBalance,
    StockMovement,
    StockTake,
    TransferOrder,
    utcnow,
)

_REF = {
    "GRN": (GoodsReceiptNote, "grn_no"),
    "ISS": (MaterialIssue, "issue_no"),
    "MRQ": (MaterialRequest, "req_no"),
    "TRN": (TransferOrder, "transfer_no"),
    "TAK": (StockTake, "take_no"),
}


def next_no(db: Session, prefix: str) -> str:
    model, field = _REF[prefix]
    total = db.query(model).count()
    return f"{prefix}{total + 1:05d}"


def item_master(db: Session) -> dict[str, dict]:
    return {r["code"]: r for r in get_cached(db, "item")}


def warehouses(db: Session) -> list[str]:
    whs = {s["warehouse"] for s in get_cached(db, "stock")}
    whs |= {b.warehouse for b in db.scalars(select(StockBalance)).all()}
    whs |= {
        r.warehouse for r in db.scalars(select(GoodsReceiptNote)).all()
    } | {
        r.warehouse for r in db.scalars(select(MaterialIssue)).all()
    } | {
        r.from_wh for r in db.scalars(select(TransferOrder)).all()
    } | {
        r.to_wh for r in db.scalars(select(TransferOrder)).all()
    }
    return sorted(whs)


def init_balances_from_erp(db: Session) -> int:
    """FRS 10.1 — seed StockBalance from the ERP cached OnHandStock (idempotent)."""
    created = 0
    for s in get_cached(db, "stock"):
        exists = db.scalar(
            select(StockBalance).where(
                StockBalance.item == s["item"], StockBalance.warehouse == s["warehouse"]
            )
        )
        if not exists:
            db.add(StockBalance(
                item=s["item"], warehouse=s["warehouse"],
                on_hand=s.get("on_hand", 0), reserved=s.get("reserved", 0),
            ))
            db.add(StockMovement(
                item=s["item"], warehouse=s["warehouse"],
                delta=s.get("on_hand", 0), ref_type="opening", ref_no="ERP-SEED",
                note="Opening balance from ERP cache", actor="system",
            ))
            created += 1
    if created:
        db.commit()
    return created


def balance(db: Session, item: str, warehouse: str) -> StockBalance | None:
    return db.scalar(
        select(StockBalance).where(StockBalance.item == item, StockBalance.warehouse == warehouse)
    )


def _move(
    db: Session,
    *,
    item: str,
    warehouse: str,
    delta: int,
    ref_type: str,
    ref_no: str,
    note: str | None = None,
    actor: str | None = None,
) -> StockBalance:
    row = balance(db, item, warehouse)
    if row is None:
        row = StockBalance(item=item, warehouse=warehouse, on_hand=0, reserved=0)
        db.add(row)
        db.flush()
    row.on_hand += delta
    if row.on_hand < 0:
        row.on_hand -= delta  # roll back
        raise ValueError(
            f"insufficient stock: {item}@{warehouse} has {row.on_hand}, need {abs(delta)}"
        )
    db.add(StockMovement(
        item=item, warehouse=warehouse, delta=delta,
        ref_type=ref_type, ref_no=ref_no, note=note, actor=actor,
    ))
    return row


def list_balances(db: Session, warehouse: str | None = None, q: str | None = None) -> list[dict]:
    master = item_master(db)
    qry = select(StockBalance).order_by(StockBalance.item, StockBalance.warehouse)
    if warehouse:
        qry = qry.where(StockBalance.warehouse == warehouse)
    rows = db.scalars(qry).all()
    low = q.lower() if q else None
    out = []
    for r in rows:
        if low and low not in r.item.lower() and low not in master.get(r.item, {}).get("name", "").lower():
            continue
        available = r.on_hand - r.reserved
        min_stock = master.get(r.item, {}).get("min_stock")
        if min_stock is None or available >= min_stock * 1.5:
            status = "ok"
        elif available >= min_stock:
            status = "watch"
        else:
            status = "shortage"
        out.append({
            "item": r.item,
            "warehouse": r.warehouse,
            "name": master.get(r.item, {}).get("name"),
            "on_hand": r.on_hand,
            "reserved": r.reserved,
            "available": available,
            "min_stock": min_stock,
            "status": status,
        })
    return out


def list_movements(db: Session, item: str | None = None, warehouse: str | None = None, limit: int = 100) -> list[dict]:
    qry = select(StockMovement)
    if item:
        qry = qry.where(StockMovement.item == item)
    if warehouse:
        qry = qry.where(StockMovement.warehouse == warehouse)
    rows = db.scalars(qry.order_by(StockMovement.created_at.desc(), StockMovement.id.desc()).limit(limit)).all()
    return [
        {
            "id": m.id, "item": m.item, "warehouse": m.warehouse, "delta": m.delta,
            "ref_type": m.ref_type, "ref_no": m.ref_no, "note": m.note,
            "actor": m.actor, "created_at": m.created_at.isoformat(),
        }
        for m in rows
    ]


def create_grn(db: Session, *, supplier_code, po_ref, warehouse, note, lines, actor) -> GoodsReceiptNote:
    doc = GoodsReceiptNote(
        grn_no=next_no(db, "GRN"), supplier_code=supplier_code, po_ref=po_ref,
        warehouse=warehouse, note=note, lines=lines, created_by=actor,
    )
    db.add(doc)
    db.flush()
    for ln in lines:
        _move(db, item=ln["item"], warehouse=warehouse, delta=ln["qty"],
              ref_type="grn", ref_no=doc.grn_no, note=f"GRN debit {ln['qty']}", actor=actor)
    db.commit()
    db.refresh(doc)
    return doc


def create_issue(db: Session, *, warehouse, issued_to, purpose, lines, actor) -> MaterialIssue:
    doc = MaterialIssue(
        issue_no=next_no(db, "ISS"), warehouse=warehouse, issued_to=issued_to,
        purpose=purpose, lines=lines, created_by=actor,
    )
    db.add(doc)
    db.flush()
    for ln in lines:
        _move(db, item=ln["item"], warehouse=warehouse, delta=-ln["qty"],
              ref_type="issue", ref_no=doc.issue_no, note=f"Issue credit {ln['qty']}", actor=actor)
    db.commit()
    db.refresh(doc)
    return doc


def create_request(db: Session, *, requester, department_id, purpose_ref, priority, required_date, lines, actor) -> MaterialRequest:
    doc = MaterialRequest(
        req_no=next_no(db, "MRQ"), requester=requester, department_id=department_id,
        purpose_ref=purpose_ref, priority=priority,
        required_date=required_date, lines=[{**ln, "issued_qty": 0} for ln in lines],
        created_by=actor,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


def fulfil_request(db: Session, req: MaterialRequest, *, warehouse: str, actor: str) -> MaterialRequest:
    if req.status == "cancelled":
        raise ValueError("cancelled request cannot be fulfilled")
    lines = req.lines
    for ln in lines:
        qty = int(ln["qty"]) - int(ln.get("issued_qty", 0))
        if qty <= 0:
            continue
        _move(db, item=ln["item"], warehouse=warehouse, delta=-qty,
              ref_type="issue", ref_no=f"{req.req_no}-FULFIL",
              note="Material request fulfilment", actor=actor)
        ln["issued_qty"] = int(ln.get("issued_qty", 0)) + qty
    req.lines = lines  # reassign so the JSON column persists
    flag_modified(req, "lines")
    req.status = "fulfilled" if all(int(l.get("issued_qty", 0)) >= int(l["qty"]) for l in req.lines) else "partial"
    db.commit()
    db.refresh(req)
    return req


def cancel_request(db: Session, req: MaterialRequest) -> MaterialRequest:
    if req.status in ("fulfilled", "partial"):
        raise ValueError("issued requests cannot be cancelled")
    req.status = "cancelled"
    db.commit()
    db.refresh(req)
    return req


def create_transfer(db: Session, *, from_wh, to_wh, note, lines, actor) -> TransferOrder:
    if from_wh == to_wh:
        raise ValueError("from and to warehouse must differ")
    doc = TransferOrder(
        transfer_no=next_no(db, "TRN"), from_wh=from_wh, to_wh=to_wh,
        note=note, lines=lines, created_by=actor,
    )
    db.add(doc)
    db.flush()
    for ln in lines:
        _move(db, item=ln["item"], warehouse=from_wh, delta=-ln["qty"],
              ref_type="transfer", ref_no=doc.transfer_no, note=f"To {to_wh}", actor=actor)
        _move(db, item=ln["item"], warehouse=to_wh, delta=ln["qty"],
              ref_type="transfer", ref_no=doc.transfer_no, note=f"From {from_wh}", actor=actor)
    db.commit()
    db.refresh(doc)
    return doc


def start_take(db: Session, *, warehouse: str, actor: str) -> StockTake:
    rows = db.scalars(
        select(StockBalance).where(StockBalance.warehouse == warehouse).order_by(StockBalance.item)
    ).all()
    if not rows:
        raise ValueError(f"no stock at {warehouse}")
    take = StockTake(
        take_no=next_no(db, "TAK"), warehouse=warehouse,
        lines=[{"item": r.item, "book": r.on_hand - r.reserved, "counted": None, "variance": 0} for r in rows],
        started_by=actor,
    )
    db.add(take)
    db.commit()
    db.refresh(take)
    return take


def count_take(db: Session, take: StockTake, *, counted: dict[str, int]) -> StockTake:
    if take.status != "open":
        raise ValueError("stock take is not open")
    counted_lookup = {c["item"]: int(c["counted"]) for c in counted}
    lines = take.lines
    for ln in lines:
        if ln["item"] in counted_lookup:
            ln["counted"] = counted_lookup[ln["item"]]
    take.lines = lines  # reassign so the JSON column persists
    flag_modified(take, "lines")
    db.commit()
    db.refresh(take)
    return take


def reconcile_take(db: Session, take: StockTake, *, actor: str) -> StockTake:
    if take.status != "open":
        raise ValueError("stock take already reconciled")
    lines = take.lines
    for ln in lines:
        if ln.get("counted") is None:
            ln["counted"] = ln["book"]
        variance = int(ln["counted"]) - int(ln["book"])
        ln["variance"] = variance
        if variance:
            _move(db, item=ln["item"], warehouse=take.warehouse, delta=variance,
                  ref_type="count", ref_no=take.take_no,
                  note=f"Count adj book={ln['book']} counted={ln['counted']}", actor=actor)
    take.lines = lines  # reassign so the JSON column persists
    flag_modified(take, "lines")
    take.status = "reconciled"
    take.finished_at = utcnow()
    db.commit()
    db.refresh(take)
    return take


def summary(db: Session) -> dict:
    master = item_master(db)

    balances = list_balances(db)
    short = [b for b in balances if b["status"] == "shortage"]
    watch = [b for b in balances if b["status"] == "watch"]
    today = datetime.now(timezone.utc).date()

    def count_today(model):
        return sum(1 for r in db.query(model).all() if r.created_at.date() == today)

    open_reqs = db.query(MaterialRequest).filter(MaterialRequest.status.in_(("open", "partial"))).count()
    open_takes = db.query(StockTake).filter(StockTake.status == "open").count()

    return {
        "skus": len(balances),
        "stock_value_units": sum(b["on_hand"] for b in balances),
        "shortage_count": len(short),
        "watch_count": len(watch),
        "shortage": short[:20],
        "open_requests": open_reqs,
        "open_takes": open_takes,
        "today_grn": count_today(GoodsReceiptNote),
        "today_issue": count_today(MaterialIssue),
        "as_of": datetime.now(timezone.utc).isoformat(),
    }