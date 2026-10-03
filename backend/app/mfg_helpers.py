"""Factory-engine helpers (ported from manatec_platform): stock availability,
an item costing, ledger posting and audit."""
from __future__ import annotations

from typing import Iterable

from sqlalchemy import func
from sqlalchemy.orm import Session

from .models import (
    AuditLog,
    InventoryLedger,
    InventoryStock,
    Item,
    PoLine,
    ProdOrderLine,
    ProductionOrder,
    PurchaseOrder,
    SupplierItem,
    User,
    Warehouse,
)

#: FK target for "the" raw-material store (seeded in seed_mfg).
DEFAULT_WAREHOUSE_CODE = "WH1"


def _wh(db: Session) -> Warehouse:
    wh = db.query(Warehouse).filter_by(code=DEFAULT_WAREHOUSE_CODE).first()
    if wh is None:
        wh = Warehouse(code=DEFAULT_WAREHOUSE_CODE, name="Raw Material Store")
        db.add(wh)
        db.flush()
    return wh


def on_hand(db: Session, item_id: int) -> float:
    """Summed current on-hand across all warehouses."""
    val = (
        db.query(func.coalesce(func.sum(InventoryStock.on_hand), 0))
        .filter(InventoryStock.item_id == item_id)
        .scalar()
    )
    return float(val or 0)


def in_transit(db: Session, item_id: int) -> float:
    """Open (not yet received) quantities on issued POs."""
    val = (
        db.query(func.coalesce(func.sum(PoLine.qty - PoLine.received_qty), 0))
        .join(PurchaseOrder, PurchaseOrder.id == PoLine.po_id)
        .filter(PoLine.item_id == item_id)
        .filter(PurchaseOrder.status.in_(["issued", "partial"]))
        .scalar()
    )
    return float(val or 0)


def committed(db: Session, item_id: int) -> float:
    """Material reserved by open production orders (planned/released/in_production)."""
    val = (
        db.query(func.coalesce(func.sum(ProdOrderLine.plan_qty - ProdOrderLine.issued_qty), 0))
        .join(ProductionOrder, ProductionOrder.id == ProdOrderLine.order_id)
        .filter(ProdOrderLine.item_id == item_id)
        .filter(ProductionOrder.status.in_(["planned", "released", "in_production"]))
        .scalar()
    )
    return float(val or 0)


def available(db: Session, item_id: int) -> float:
    """How much of an item is usable for new promises."""
    return on_hand(db, item_id) + in_transit(db, item_id) - committed(db, item_id)


def stock_row(db: Session, item_id: int, warehouse_id: int) -> InventoryStock:
    row = (
        db.query(InventoryStock)
        .filter_by(item_id=item_id, warehouse_id=warehouse_id)
        .first()
    )
    if not row:
        row = InventoryStock(item_id=item_id, warehouse_id=warehouse_id, on_hand=0)
        db.add(row)
    return row


def post_ledger(
    db: Session,
    *,
    item_id: int,
    trans_type: str,
    qty_delta: float,
    warehouse_id: int | None = None,
    user_id: int | None = None,
    ref_type: str = "",
    ref_id: int = 0,
    note: str = "",
) -> None:
    if qty_delta == 0 and trans_type != "opening":
        return
    if warehouse_id is None:
        warehouse_id = _wh(db).id
    db.add(
        InventoryLedger(
            item_id=item_id,
            warehouse_id=warehouse_id,
            trans_type=trans_type,
            qty_delta=qty_delta,
            ref_type=ref_type,
            ref_id=ref_id,
            note=note,
            user_id=user_id,
        )
    )
    row = stock_row(db, item_id, warehouse_id)
    row.on_hand = float(row.on_hand or 0) + float(qty_delta)


def audit(
    db: Session,
    *,
    user: User | None,
    action: str,
    entity: str = "",
    entity_id: int = 0,
    details: dict | None = None,
) -> None:
    db.add(
        AuditLog(
            actor_id=user.id if user else None,
            actor_username=user.username if user else None,
            action=action,
            entity_type=entity,
            entity_ref=str(entity_id) if entity_id else None,
            after=details or {},
        )
    )


def item_avg_price(db: Session, item_id: int) -> float:
    """Cheapest known supplier price for valuation (0 if unknown)."""
    val = (
        db.query(func.min(SupplierItem.price))
        .filter(SupplierItem.item_id == item_id)
        .scalar()
    )
    return float(val or 0)


def items_map(db: Session, item_ids: Iterable[int]) -> dict[int, Item]:
    ids = list(set(int(i) for i in item_ids))
    if not ids:
        return {}
    return {it.id: it for it in db.query(Item).filter(Item.id.in_(ids)).all()}