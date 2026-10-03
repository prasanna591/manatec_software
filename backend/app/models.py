"""Canonical data model — FRS Section 4.

Foundation (identity, RBAC, employees/departments, integration cache, audit,
notifications) plus the operational spine ported from the legacy Manatec
prototype: catalogue registry, items, inventory ledger, BOM, ATP, purchase
orders, production orders and quotes (FRS §5 Modules D–G).
"""
from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Department(Base):
    __tablename__ = "departments"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(128))
    # plain int, no FK: avoids departments<->employees circular DDL (SQLite can't ALTER-add FKs)
    head_employee_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    active: Mapped[bool] = mapped_column(default=True)


class Role(Base):
    __tablename__ = "roles"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(128))
    permissions: Mapped[list["Permission"]] = relationship(
        back_populates="role", cascade="all, delete-orphan"
    )


class Permission(Base):
    """One row per (role, module, action). Actions: view/create/edit/approve/export/delete/admin."""
    __tablename__ = "permissions"
    __table_args__ = (UniqueConstraint("role_id", "module", "action"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id"), index=True)
    module: Mapped[str] = mapped_column(String(64), index=True)
    action: Mapped[str] = mapped_column(String(16))
    role: Mapped[Role] = relationship(back_populates="permissions")


class Employee(Base):
    __tablename__ = "employees"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(128))
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"), nullable=True)
    manager_id: Mapped[int | None] = mapped_column(ForeignKey("employees.id"), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    email: Mapped[str | None] = mapped_column(String(128), nullable=True)
    active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    user: Mapped["User | None"] = relationship(back_populates="employee", uselist=False)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    employee_id: Mapped[int | None] = mapped_column(ForeignKey("employees.id"), nullable=True)
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id"))
    active: Mapped[bool] = mapped_column(default=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    employee: Mapped[Employee | None] = relationship(back_populates="user")
    role: Mapped[Role] = relationship()


class ERPObjCache(Base):
    """FRS 4.3 — filtered ERP master references, never the whole ERP DB."""
    __tablename__ = "erp_obj_cache"
    __table_args__ = (UniqueConstraint("entity", "erp_key"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    entity: Mapped[str] = mapped_column(String(64), index=True)
    erp_key: Mapped[str] = mapped_column(String(64), index=True)
    snapshot: Mapped[dict] = mapped_column(JSON)
    hash: Mapped[str] = mapped_column(String(64))
    synced_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class SyncJob(Base):
    __tablename__ = "sync_jobs"
    id: Mapped[int] = mapped_column(primary_key=True)
    entity: Mapped[str] = mapped_column(String(64), index=True)
    direction: Mapped[str] = mapped_column(String(16))  # inbound | outbound
    status: Mapped[str] = mapped_column(String(16))      # ok | error
    rows: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    ran_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class AuditLog(Base):
    """FRS 20.2 — append-only accountability trail."""
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    actor_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    actor_username: Mapped[str | None] = mapped_column(String(64), nullable=True)
    action: Mapped[str] = mapped_column(String(64), index=True)
    entity_type: Mapped[str] = mapped_column(String(64), index=True)
    entity_ref: Mapped[str | None] = mapped_column(String(64), nullable=True)
    before: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    after: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class Notification(Base):
    """FRS 17.2 — infrastructure only in Phase 1; rules arrive with later modules."""
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    recipient_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    channel: Mapped[str] = mapped_column(String(16), default="inapp")
    priority: Mapped[str] = mapped_column(String(16), default="normal")
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    entity_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    entity_ref: Mapped[str | None] = mapped_column(String(64), nullable=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class Task(Base):
    """FRS 15.6 — platform-owned work item; drives mobile My Tasks + dashboard."""
    __tablename__ = "tasks"
    id: Mapped[int] = mapped_column(primary_key=True)
    type: Mapped[str] = mapped_column(String(64))            # work_order | approval | request | generic
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_ref: Mapped[str | None] = mapped_column(String(64), nullable=True)
    assigned_to: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"), nullable=True)
    priority: Mapped[str] = mapped_column(String(16), default="normal")
    status: Mapped[str] = mapped_column(String(16), default="open", index=True)
    due_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


# --- FRS 10 · STORES / INVENTORY (platform-owned operational spine) ---


class StockBalance(Base):
    """FRS 10.1 — platform-owned balance per item+warehouse.

    Seeded from the ERP cached OnHandStock at startup; every platform movement
    (GRN, issue, transfer, count adjustment) updates this ledger. The ERP remains
    read-only until the Phase 1 write-back contract lands (§18.3).
    """
    __tablename__ = "stock_balance"
    __table_args__ = (UniqueConstraint("item", "warehouse"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    item: Mapped[str] = mapped_column(String(64), index=True)
    warehouse: Mapped[str] = mapped_column(String(64), index=True)
    on_hand: Mapped[int] = mapped_column(Integer, default=0)
    reserved: Mapped[int] = mapped_column(Integer, default=0)


class StockMovement(Base):
    """FRS 10.2/10.3 — append-only ledger row per stock change."""
    __tablename__ = "stock_movements"
    id: Mapped[int] = mapped_column(primary_key=True)
    item: Mapped[str] = mapped_column(String(64), index=True)
    warehouse: Mapped[str] = mapped_column(String(64), index=True)
    delta: Mapped[int] = mapped_column(Integer)      # signed: +in / -out
    ref_type: Mapped[str] = mapped_column(String(32))  # grn | issue | transfer | count | opening
    ref_no: Mapped[str | None] = mapped_column(String(64), nullable=True)
    note: Mapped[str | None] = mapped_column(String(200), nullable=True)
    actor: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class GoodsReceiptNote(Base):
    """FRS 10.2 Inward / Goods Receipt. Lines stored as JSON [{item, qty}]."""
    __tablename__ = "good_receipts"
    id: Mapped[int] = mapped_column(primary_key=True)
    grn_no: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    supplier_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    po_ref: Mapped[str | None] = mapped_column(String(64), nullable=True)
    warehouse: Mapped[str] = mapped_column(String(64), default="MAIN")
    note: Mapped[str | None] = mapped_column(String(200), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="posted")  # posted (erp write is a later phase)
    lines: Mapped[list] = mapped_column(JSON, default=list)
    created_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class MaterialIssue(Base):
    """FRS 10.3 Outward / Issue. Lines [{item, qty}] posted against stock."""
    __tablename__ = "material_issues"
    id: Mapped[int] = mapped_column(primary_key=True)
    issue_no: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    warehouse: Mapped[str] = mapped_column(String(64), default="MAIN")
    issued_to: Mapped[str | None] = mapped_column(String(64), nullable=True)  # dept/employee/cost centre
    purpose: Mapped[str | None] = mapped_column(String(200), nullable=True)
    lines: Mapped[list] = mapped_column(JSON, default=list)
    created_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class MaterialRequest(Base):
    """FRS 10.4 — consuming departments ask; Stores fulfils.
    Lines [{item, qty, issued_qty}]; status open→partial/fulfilled, or cancelled."""
    __tablename__ = "material_requests"
    id: Mapped[int] = mapped_column(primary_key=True)
    req_no: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    requester: Mapped[str | None] = mapped_column(String(64), nullable=True)
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"), nullable=True)
    purpose_ref: Mapped[str | None] = mapped_column(String(64), nullable=True)  # work order / order / project
    priority: Mapped[str] = mapped_column(String(16), default="normal")
    required_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="open", index=True)
    lines: Mapped[list] = mapped_column(JSON, default=list)
    created_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class TransferOrder(Base):
    """FRS 10.5 — move stock between warehouses. Lines [{item, qty}]."""
    __tablename__ = "transfer_orders"
    id: Mapped[int] = mapped_column(primary_key=True)
    transfer_no: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    from_wh: Mapped[str] = mapped_column(String(64))
    to_wh: Mapped[str] = mapped_column(String(64))
    note: Mapped[str | None] = mapped_column(String(200), nullable=True)
    lines: Mapped[list] = mapped_column(JSON, default=list)
    created_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class StockTake(Base):
    """FRS 10.6 — physical count vs system. Lines [{item, book, counted, variance}]."""
    __tablename__ = "stock_takes"
    id: Mapped[int] = mapped_column(primary_key=True)
    take_no: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    warehouse: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(16), default="open", index=True)  # open → reconciling? → reconciled
    lines: Mapped[list] = mapped_column(JSON, default=list)
    started_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


# --- FRS §5 Modules D–G · MFG OPERATIONAL SPINE (ported from manatec_platform) ---


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
    family_id: Mapped[int | None] = mapped_column(ForeignKey("families.id"), nullable=True)
    category: Mapped[str] = mapped_column(String(200), default="")
    slug: Mapped[str] = mapped_column(String(300), default="")
    url: Mapped[str] = mapped_column(String(500), default="")
    image_url: Mapped[str] = mapped_column(String(500), default="")
    price_raw: Mapped[str] = mapped_column(String(120), default="")
    price_value: Mapped[float] = mapped_column(default=0)
    status: Mapped[str] = mapped_column(String(30), default="active")  # active / eol
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Item(Base):
    """Material / component master (single level of MRP item)."""
    __tablename__ = "items"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    description: Mapped[str] = mapped_column(String(300), default="")
    uom: Mapped[str] = mapped_column(String(20), default="pcs")
    category: Mapped[str] = mapped_column(String(120), default="")
    source_class: Mapped[str] = mapped_column(
        String(20), default="medium"
    )  # import / medium / short / fabricated
    lead_time_days_min: Mapped[int] = mapped_column(Integer, default=10)
    lead_time_days_max: Mapped[int] = mapped_column(Integer, default=20)
    min_qty: Mapped[float] = mapped_column(default=0)
    max_qty: Mapped[float] = mapped_column(default=0)
    default_supplier_id: Mapped[int | None] = mapped_column(
        ForeignKey("suppliers.id"), nullable=True
    )
    is_assembly: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


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
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id"), nullable=True)
    item_id: Mapped[int | None] = mapped_column(ForeignKey("items.id"), nullable=True)
    rev_no: Mapped[int] = mapped_column(Integer, default=1)
    name: Mapped[str] = mapped_column(String(300), default="")
    status: Mapped[str] = mapped_column(String(20), default="active")  # draft/active/superseded
    effective_from: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    effective_to: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class BomLine(Base):
    """A single ingredient row of a BOM revision (child -> qty)."""
    __tablename__ = "bom_lines"
    id: Mapped[int] = mapped_column(primary_key=True)
    header_id: Mapped[int] = mapped_column(
        ForeignKey("bom_headers.id", ondelete="CASCADE"), index=True
    )
    child_item_id: Mapped[int] = mapped_column(ForeignKey("items.id"))
    qty: Mapped[float] = mapped_column(default=1)
    scrap_pct: Mapped[float] = mapped_column(default=0)
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
        ForeignKey("warehouses.id"), default=1, index=True
    )
    trans_type: Mapped[str] = mapped_column(String(30), index=True)  # opening/grn/issue/adj/sale
    qty_delta: Mapped[float] = mapped_column(default=0)
    ref_type: Mapped[str] = mapped_column(String(30), default="")
    ref_id: Mapped[int] = mapped_column(Integer, default=0)
    note: Mapped[str] = mapped_column(String(300), default="")
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class InventoryStock(Base):
    """Denormalised current on-hand per item/warehouse (kept in same txn)."""
    __tablename__ = "inventory_stock"
    __table_args__ = (UniqueConstraint("item_id", "warehouse_id", name="uq_stock"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"), index=True)
    warehouse_id: Mapped[int] = mapped_column(ForeignKey("warehouses.id"))
    on_hand: Mapped[float] = mapped_column(default=0)


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
    price: Mapped[float] = mapped_column(default=0)
    lead_time_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    moq: Mapped[float] = mapped_column(default=0)


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"
    id: Mapped[int] = mapped_column(primary_key=True)
    po_no: Mapped[str] = mapped_column(String(60), unique=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id"))
    status: Mapped[str] = mapped_column(
        String(30), default="draft"
    )  # draft/issued/partial/completed/cancelled
    issue_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    expected_delivery_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    total_value: Mapped[float] = mapped_column(default=0)
    note: Mapped[str] = mapped_column(Text, default="")
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class PoLine(Base):
    __tablename__ = "po_lines"
    id: Mapped[int] = mapped_column(primary_key=True)
    po_id: Mapped[int] = mapped_column(
        ForeignKey("purchase_orders.id", ondelete="CASCADE"), index=True
    )
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"))
    qty: Mapped[float] = mapped_column(default=0)
    unit_price: Mapped[float] = mapped_column(default=0)
    received_qty: Mapped[float] = mapped_column(default=0)


class ProductionOrder(Base):
    __tablename__ = "production_orders"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_no: Mapped[str] = mapped_column(String(60), unique=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    qty: Mapped[float] = mapped_column(default=0)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(
        String(30), default="planned"
    )  # planned/released/in_production/qc/packed/dispatched/cancelled
    source_quote_id: Mapped[int | None] = mapped_column(ForeignKey("quotes.id"), nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class ProdOrderLine(Base):
    """Material requirement for a production order (from exploded BOM × qty)."""
    __tablename__ = "prod_order_lines"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(
        ForeignKey("production_orders.id", ondelete="CASCADE"), index=True
    )
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"))
    plan_qty: Mapped[float] = mapped_column(default=0)
    issued_qty: Mapped[float] = mapped_column(default=0)


class Quote(Base):
    __tablename__ = "quotes"
    id: Mapped[int] = mapped_column(primary_key=True)
    quote_no: Mapped[str] = mapped_column(String(60), unique=True)
    customer_name: Mapped[str] = mapped_column(String(200), default="")
    customer_phone: Mapped[str] = mapped_column(String(40), default="")
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    qty: Mapped[float] = mapped_column(default=0)
    unit_price: Mapped[float] = mapped_column(default=0)
    total_value: Mapped[float] = mapped_column(default=0)
    promised_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(
        String(30), default="new"
    )  # new/quote_sent/confirmed/expired
    notes: Mapped[str] = mapped_column(Text, default="")
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


# --- FRS §R20 HR COMMON APP: attendance, leave, guest visits, company notices ---


class Attendance(Base):
    """One row per employee per work day — check-in/check-out self-service."""
    __tablename__ = "attendance"
    __table_args__ = (UniqueConstraint("employee_id", "work_date", name="uq_attendance_day"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), index=True)
    work_date: Mapped[date] = mapped_column(Date, index=True)
    check_in: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    check_out: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    note: Mapped[str] = mapped_column(String(200), default="")
    source: Mapped[str] = mapped_column(String(16), default="mobile")  # mobile | web | seeded
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class LeaveRequest(Base):
    """Self-service leave with a lightweight 2-step chain: dept head → HR."""
    __tablename__ = "leave_requests"
    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), index=True)
    leave_type: Mapped[str] = mapped_column(String(24), index=True)  # casual/sick/earned/other
    from_date: Mapped[date] = mapped_column(Date)
    to_date: Mapped[date] = mapped_column(Date)
    days: Mapped[float] = mapped_column(default=1)
    reason: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="pending_dept", index=True)
    # 2-step approval: pending_dept → pending_hr → approved / rejected / cancelled
    dept_approved_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    dept_approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    hr_approved_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    hr_approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    decided_note: Mapped[str] = mapped_column(Text, default="")
    created_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    @property
    def is_pending(self) -> bool:
        return self.status in ("pending_dept", "pending_hr")


class LeaveBalance(Base):
    """Annual entitlement vs used, per employee + leave type."""
    __tablename__ = "leave_balances"
    __table_args__ = (UniqueConstraint("employee_id", "leave_type", "year", name="uq_leave_bal"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), index=True)
    leave_type: Mapped[str] = mapped_column(String(24))
    year: Mapped[int] = mapped_column(Integer, default=0)
    allocated: Mapped[float] = mapped_column(default=0)
    used: Mapped[float] = mapped_column(default=0)


class GuestVisit(Base):
    """Gate/security register: register a visitor, security clears, checkout on exit."""
    __tablename__ = "guest_visits"
    id: Mapped[int] = mapped_column(primary_key=True)
    visit_no: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    visitor_name: Mapped[str] = mapped_column(String(128))
    phone: Mapped[str] = mapped_column(String(32), default="")
    purpose: Mapped[str] = mapped_column(String(300), default="")
    host_name: Mapped[str] = mapped_column(String(128), default="")
    department_name: Mapped[str] = mapped_column(String(128), default="")
    vehicle_no: Mapped[str] = mapped_column(String(32), default="")
    check_in: Mapped[datetime] = mapped_column(DateTime)
    check_out: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="pending", index=True)
    # pending → admitted → checked_out / cancelled
    security_approved_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    security_approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class CompanyNotice(Base):
    """Broadcast announcement visible to every employee (company notification)."""
    __tablename__ = "company_notices"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text, default="")
    posted_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)