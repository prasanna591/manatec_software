"""Manatec platform ORM schema (Plan §7 data model)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def _now() -> datetime:
    return datetime.utcnow()


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(200), default="")
    password_hash: Mapped[str] = mapped_column(String(300))
    full_name: Mapped[str] = mapped_column(String(200), default="")
    role: Mapped[str] = mapped_column(String(40), default="viewer")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class Family(Base):
    """Product family — carries production cycle & shipping buffers."""
    __tablename__ = "families"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    default_cycle_days: Mapped[int] = mapped_column(Integer, default=5)
    default_shipping_days: Mapped[int] = mapped_column(Integer, default=3)


class Product(Base):
    """Finished / sellable product (seeded from the manatec.net catalogue)."""
    __tablename__ = "products"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(300), index=True)
    model_code: Mapped[str] = mapped_column(String(120), default="")
    family_id: Mapped[int] = mapped_column(ForeignKey("families.id"), nullable=True)
    category: Mapped[str] = mapped_column(String(200), default="")
    slug: Mapped[str] = mapped_column(String(300), default="")
    url: Mapped[str] = mapped_column(String(500), default="")
    image_url: Mapped[str] = mapped_column(String(500), default="")
    price_raw: Mapped[str] = mapped_column(String(120), default="")
    price_value: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    status: Mapped[str] = mapped_column(String(30), default="active")  # active / eol
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class Item(Base):
    """Material / component master (single level of MRP item)."""
    __tablename__ = "items"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    description: Mapped[str] = mapped_column(String(300), default="")
    uom: Mapped[str] = mapped_column(String(20), default="pcs")
    category: Mapped[str] = mapped_column(String(120), default="")
    source_class: Mapped[str] = mapped_column(
        String(20), default="medium")  # import / medium / short / fabricated
    lead_time_days_min: Mapped[int] = mapped_column(Integer, default=10)
    lead_time_days_max: Mapped[int] = mapped_column(Integer, default=20)
    min_qty: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    max_qty: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    default_supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id"), nullable=True)
    is_assembly: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class ItemSubstitute(Base):
    __tablename__ = "item_substitutes"
    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"))
    alt_item_id: Mapped[int] = mapped_column(ForeignKey("items.id"))
    preference: Mapped[int] = mapped_column(Integer, default=1)


class BomHeader(Base):
    """A revision of a BOM for a finished product OR a sub-assembly item."""
    __tablename__ = "bom_headers"
    __table_args__ = (UniqueConstraint("product_id", "item_id", "rev_no", name="uq_bom_rev"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int | None] = mapped_column(
        ForeignKey("products.id"), nullable=True)
    item_id: Mapped[int | None] = mapped_column(ForeignKey("items.id"), nullable=True)
    rev_no: Mapped[int] = mapped_column(Integer, default=1)
    name: Mapped[str] = mapped_column(String(300), default="")
    status: Mapped[str] = mapped_column(String(20), default="active")  # draft/active/superseded
    effective_from: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    effective_to: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class BomLine(Base):
    """A single ingredient row of a BOM revision (child -> qty)."""
    __tablename__ = "bom_lines"
    id: Mapped[int] = mapped_column(primary_key=True)
    header_id: Mapped[int] = mapped_column(ForeignKey("bom_headers.id", ondelete="CASCADE"))
    child_item_id: Mapped[int] = mapped_column(ForeignKey("items.id"))
    qty: Mapped[float] = mapped_column(Numeric(14, 3), default=1)
    scrap_pct: Mapped[float] = mapped_column(Numeric(6, 3), default=0)
    seq: Mapped[int] = mapped_column(Integer, default=0)


class Warehouse(Base):
    __tablename__ = "warehouses"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(40), unique=True)
    name: Mapped[str] = mapped_column(String(200))


class InventoryLedger(Base):
    """Every stock change is an immutable ledger row."""
    __tablename__ = "inventory_ledger"
    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"), index=True)
    warehouse_id: Mapped[int] = mapped_column(
        ForeignKey("warehouses.id"), default=1, index=True)
    trans_type: Mapped[str] = mapped_column(String(30), index=True)  # opening/grn/issue/adj/sale
    qty_delta: Mapped[float] = mapped_column(Numeric(14, 3), default=0)
    ref_type: Mapped[str] = mapped_column(String(30), default="")
    ref_id: Mapped[int] = mapped_column(Integer, default=0)
    note: Mapped[str] = mapped_column(String(300), default="")
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, index=True)


class InventoryStock(Base):
    """Denormalised current on-hand per item/warehouse (kept in same txn)."""
    __tablename__ = "inventory_stock"
    __table_args__ = (UniqueConstraint("item_id", "warehouse_id", name="uq_stock"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"), index=True)
    warehouse_id: Mapped[int] = mapped_column(ForeignKey("warehouses.id"))
    on_hand: Mapped[float] = mapped_column(Numeric(14, 3), default=0)


class Supplier(Base):
    __tablename__ = "suppliers"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    contact: Mapped[str] = mapped_column(String(200), default="")
    lead_time_days_default: Mapped[int] = mapped_column(Integer, default=20)
    rating: Mapped[int] = mapped_column(Integer, default=3)  # 1..5
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class SupplierItem(Base):
    """Which suppliers provide each item + their price/lead-time/MOQ."""
    __tablename__ = "supplier_items"
    __table_args__ = (UniqueConstraint("supplier_id", "item_id", name="uq_supplier_item"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id"))
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"), index=True)
    price: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    lead_time_days: Mapped[int] = mapped_column(Integer, nullable=True)
    moq: Mapped[float] = mapped_column(Numeric(14, 2), default=0)


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"
    id: Mapped[int] = mapped_column(primary_key=True)
    po_no: Mapped[str] = mapped_column(String(60), unique=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id"))
    status: Mapped[str] = mapped_column(
        String(30), default="draft")  # draft/issued/partial/completed/cancelled
    issue_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    expected_delivery_date: Mapped[datetime | None] = mapped_column(Date, nullable=True)
    total_value: Mapped[float] = mapped_column(Numeric(16, 2), default=0)
    note: Mapped[str] = mapped_column(Text, default="")
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class PoLine(Base):
    __tablename__ = "po_lines"
    id: Mapped[int] = mapped_column(primary_key=True)
    po_id: Mapped[int] = mapped_column(ForeignKey("purchase_orders.id", ondelete="CASCADE"))
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"))
    qty: Mapped[float] = mapped_column(Numeric(14, 3))
    unit_price: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    received_qty: Mapped[float] = mapped_column(Numeric(14, 3), default=0)


class ProductionOrder(Base):
    __tablename__ = "production_orders"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_no: Mapped[str] = mapped_column(String(60), unique=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    qty: Mapped[float] = mapped_column(Numeric(14, 3))
    due_date: Mapped[datetime | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(
        String(30), default="planned")  # planned/released/in_production/qc/packed/dispatched/cancelled
    source_quote_id: Mapped[int] = mapped_column(ForeignKey("quotes.id"), nullable=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class ProdOrderLine(Base):
    """Material requirement for a production order (from exploded BOM × qty)."""
    __tablename__ = "prod_order_lines"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("production_orders.id", ondelete="CASCADE"))
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"))
    plan_qty: Mapped[float] = mapped_column(Numeric(14, 3), default=0)
    issued_qty: Mapped[float] = mapped_column(Numeric(14, 3), default=0)


class Quote(Base):
    __tablename__ = "quotes"
    id: Mapped[int] = mapped_column(primary_key=True)
    quote_no: Mapped[str] = mapped_column(String(60), unique=True)
    customer_name: Mapped[str] = mapped_column(String(200), default="")
    customer_phone: Mapped[str] = mapped_column(String(40), default="")
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    qty: Mapped[float] = mapped_column(Numeric(14, 3))
    unit_price: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    total_value: Mapped[float] = mapped_column(Numeric(16, 2), default=0)
    promised_date: Mapped[datetime | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(
        String(30), default="new")  # new/quote_sent/confirmed/expired
    notes: Mapped[str] = mapped_column(Text, default="")
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class AuditLog(Base):
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(60), index=True)
    entity: Mapped[str] = mapped_column(String(60), default="")
    entity_id: Mapped[int] = mapped_column(Integer, default=0)
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, index=True)