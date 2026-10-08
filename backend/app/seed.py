"""Idempotent seed: roles, FRS 5.2 permission matrix, departments, bootstrap admin.

Run automatically on startup and via `python -m app.seed`.
"""
from __future__ import annotations

from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import SessionLocal, engine
from .models import Department, Employee, Permission, Role, User
from .security import hash_password
from .services import notify

ACTION = {"R": "view", "C": "create", "E": "edit", "A": "approve", "X": "export", "D": "delete"}

DEPARTMENTS = [
    ("MGMT", "Management"),
    ("COMM", "Commercial"),
    ("PLAN", "Planning"),
    ("PROD", "Production"),
    ("STOR", "Stores / Inventory"),
    ("PURC", "Purchase / Procurement"),
    ("LOGI", "Logistics / Dispatch"),
    ("QUAL", "Quality"),
    ("ENGI", "Engineering / R&D"),
    ("HRAD", "HR / Admin"),
]

ROLES = {
    "ADMIN": "Platform Administrator",
    "MGMT": "Management",
    "DH": "Department Head / Manager",
    "SUP": "Supervisor",
    "PLNR": "Planner",
    "OPER": "Production Operator",
    "STORE": "Stores Operator",
    "STK": "Stock Counter",
    "PUR": "Purchase Officer",
    "LOG": "Logistics / Dispatcher",
    "QINSP": "Quality Inspector",
    "ENG": "Engineer / Design",
    "COMM": "Commercial / Sales Officer",
    "HR": "HR / Admin Officer",
    "ACC": "Accounts",
    "ROBOT": "Robot system account",
}

# FRS 5.2 default permission matrix, verbatim. Columns: MGMT DH SUP PLNR OPER STORE PUR LOG QINSP ENG COMM HR ACC
_MATRIX: dict[str, list[str]] = {
    "Home":         ["RC", "RC", "RC", "RC", "RC", "RC", "RC", "RC", "RC", "RC", "RC", "RC", "R"],
    "Dashboard":    ["RX", "RX", "R",  "R",  "R",  "R",  "R",  "R",  "R",  "R",  "R",  "R",  "R"],
    "Orders":       ["RX", "R",  "R",  "RCE","R",  "R",  "R",  "R",  "R",  "R",  "RCE","R",  "R"],
    "Orders.Intel": ["R",  "R",  "-",  "R",  "-",  "-",  "R",  "-",  "-",  "-",  "R",  "-",  "-"],
    "Planning":     ["R",  "RCEA","RCE","RCE","-",  "R",  "R",  "R",  "-",  "-",  "-",  "-",  "-"],
    "Production":   ["R",  "RX", "RCE","RC", "CE", "R",  "R",  "R",  "R",  "RCE","R",  "-",  "-"],
    "Machines":     ["R",  "R",  "RCE","R",  "CE", "-",  "-",  "-",  "-",  "-",  "-",  "-",  "-"],
    "Inventory":    ["RX", "RX", "R",  "R",  "R",  "RCE","RCE","R",  "R",  "R",  "R",  "-",  "R"],
    "MaterialReq":  ["R",  "RA", "RCEA","RC", "C",  "RCEA","R",  "-",  "-",  "RC", "RC", "-",  "-"],
    "Purchase":     ["RX", "RA", "R",  "R",  "-",  "R",  "RCEA","-",  "-",  "-",  "R",  "-",  "-"],
    "PurchaseReq":  ["R",  "R",  "R",  "RC", "-",  "RC", "RCA","-",  "-",  "RC", "RC", "-",  "-"],
    "Logistics":    ["R",  "RA", "RCE","R",  "-",  "R",  "-",  "RCEA","-",  "-",  "-",  "-",  "-"],
    "Quality":      ["R",  "RX", "R",  "R",  "R",  "R",  "R",  "R",  "RCEA","R",  "-",  "-",  "-"],
    "Engineering":  ["R",  "R",  "R",  "R",  "-",  "-",  "-",  "-",  "-",  "RCEA","-",  "-",  "-"],
    "Quotations":   ["R",  "RA", "-",  "R",  "-",  "-",  "-",  "-",  "-",  "R",  "RCE","-",  "-"],
    "Customers":    ["R",  "R",  "-",  "R",  "-",  "-",  "-",  "-",  "-",  "-",  "RCE","-",  "R"],
    "Suppliers":    ["R",  "R",  "-",  "R",  "-",  "-",  "RCE","-",  "-",  "-",  "-",  "-",  "-"],
    "Employees":    ["R",  "R",  "R",  "R",  "-",  "-",  "-",  "-",  "-",  "-",  "-",  "RCEA","R"],
    "Attendance":   ["RX", "RX", "RCE","-",  "RCE","RCE","RCE","RCE","RCE","RCE","RCE","RCEA","R"],
    "Approvals":    ["RA"] * 13,
    # Posting a company announcement is a `create` grant (MGMT + HR), kept out
    # of the shared Notifications:view the floor has. Do not role-gate this.
    "Notifications":["RCX","RX", "RX", "RX", "RX", "RX", "RX", "RX", "RX", "RX", "RX", "RCX","RX"],
    "Reports":      ["RX"] * 13,
    "Admin":        ["-",  "-",  "-",  "-",  "-",  "-",  "-",  "-",  "-",  "-",  "-",  "CEAD","-"],
    "Analytics":    ["RX", "RX", "R",  "R",  "-",  "-",  "R",  "-",  "-",  "-",  "R",  "-",  "-"],
    "Robots":       ["R",  "R",  "R",  "RCE","-",  "-",  "-",  "-",  "-",  "-",  "-",  "-",  "-"],
    # Manufactured catalogue, item master & BOM/ATP (ported from manatec_platform).
    "Catalog":      ["RX", "RX", "R",  "R",  "R",  "RCE","R",  "R",  "R",  "RCE","RCE","-",  "R"],
    "BOM":          ["R",  "RCEA","RCE","RCE","-",  "R",  "R",  "-",  "R",  "RCEA","-", "-",  "-"],
    # Common company-wide service: any employee may raise a visit (RC), the host
    # department owns the workflow, and management approves the closed outcome.
    "Visits":       ["RCA", "RCEA","RCE", "RCE", "RC",  "RC", "RCE", "RCE", "RC", "RCE", "RCE", "RCE", "R"],
    # Location is deliberately narrower than the visit itself. Without this the
    # production floor could read a buyer's live position.
    "BuyerTracking":["R",   "R",   "R",   "-",   "-",   "-",  "R",  "R",  "-",  "-",   "R",   "R",   "-"],
    # Guest/gate register: every employee may register + see their own (RC);
    # security (MGMT/DH/HR/LOG) additionally admits, checks out and sees all
    # (A + E). Keep the admit gate permission-based, never role-based.
    "Guests":      ["RCEA","RCEA","RC",  "RC",  "RC",  "RC",  "RC", "RCEA","RC", "RC",  "RC",  "RCEA","RC"],
}
# role columns in the same order as _MATRIX rows
_COLS = ["MGMT", "DH", "SUP", "PLNR", "OPER", "STORE", "PUR", "LOG", "QINSP", "ENG", "COMM", "HR", "ACC"]
# STK and ROBOT are not in the FRS 5.2 table; give them the documented minimum.
_EXTRA = {"STK": {"Inventory": "RCE", "MaterialReq": "-", "Attendance": "RCE", "Guests": "RC"}, "ROBOT": {}}

# Demo accounts for the UI-first phase (dev only). (dept, role, username, name)
DEMO_USERS = [
    ("MGMT", "MGMT", "manager", "Meena Manager"),
    ("COMM", "COMM", "commercial", "Karthik Commercial"),
    ("PLAN", "PLNR", "planner", "Priya Planner"),
    ("PROD", "OPER", "operator", "Arun Operator"),
    ("PROD", "SUP", "prod_sup", "Suresh Supervisor"),
    ("STOR", "STORE", "stores", "Divya Stores"),
    ("PURC", "PUR", "purchase", "Ravi Purchase"),
    ("LOGI", "LOG", "logistics", "Lakshmi Logistics"),
    ("QUAL", "QINSP", "quality", "Ganesh Quality"),
    ("ENGI", "ENG", "engineer", "Nithya Engineer"),
    ("HRAD", "HR", "hr", "Anjali HR"),
]

DEMO_TASKS = [
    ("work_order", "Production Order PO00003 - Op 2", "Complete milling operation", "operator", "high"),
    ("work_order", "Production Order PO00005 - Op 1", "Start cutting operation", "operator", "urgent"),
    ("material_request", "Issue material for PO00003", "Item ITM0002 x 20 required", "stores", "high"),
    ("inspection", "Inspect lot SO00002", "Pre-dispatch inspection", "quality", "normal"),
    ("planning", "Set week plan w/c", "Freeze weekly plan and release work orders", "planner", "high"),
    ("purchase", "Expedite PO for ITM0007", "Shortage expected in 3 days", "purchase", "urgent"),
    ("dispatch", "Schedule dispatch SO00001", "Ready for dispatch", "logistics", "normal"),
    ("approval", "Approve leave request", "Pending HR approval", "hr", "normal"),
    ("engineering", "Drawing revision for PRD002", "ECR raised by production", "engineer", "normal"),
    ("generic", "Review delayed orders", "7 orders past due date", "manager", "high"),
]


def seed_demo(db: Session) -> None:
    """Dev demo accounts + tasks so the dashboard/mobile have something to render."""
    from datetime import datetime, timedelta, timezone

    from .models import Task

    dept_by_code = {d.code: d for d in db.scalars(select(Department)).all()}
    role_by_code = {r.code: r for r in db.scalars(select(Role)).all()}
    users: dict[str, User] = {}
    for dept_code, role_code, username, name in DEMO_USERS:
        user = db.scalar(select(User).where(User.username == username))
        if not user:
            emp = Employee(code=f"EMP{username.upper()[:4]}", name=name,
                           department_id=dept_by_code[dept_code].id)
            db.add(emp)
            db.flush()
            user = User(username=username, password_hash=hash_password("demo123"),
                        employee_id=emp.id, role_id=role_by_code[role_code].id)
            db.add(user)
            db.flush()
            notify(db, recipient_id=user.id, title="Welcome to Manatec Digital",
                   body=f"Demo account for {role_code}", priority="normal")
        users[username] = user
    db.commit()

    if not db.scalar(select(Task).where(Task.type == "work_order")):
        now = datetime.now(timezone.utc)
        for i, (ttype, title, desc, username, priority) in enumerate(DEMO_TASKS):
            owner = users[username]
            emp = db.get(Employee, owner.employee_id)
            db.add(Task(
                type=ttype, title=title, description=desc, priority=priority,
                assigned_to=owner.id, department_id=emp.department_id if emp else None,
                due_date=now + timedelta(days=(i % 5) - 1), created_by=users["manager"].id,
            ))
        db.commit()


def seed_mfg(db: Session) -> None:
    """Idempotent seed of the manufacturing spine (ported from manatec_platform.seed_all):
    product families + 95-product catalogue, suppliers, items + lead-times,
    opening inventory from sample file, and sample BOMs (incl. a multi-level
    sub-assembly to exercise the explode logic)."""
    import csv
    import json
    import re

    from sqlalchemy import select

    from . import bom_service
    from .mfg_helpers import post_ledger
    from .models import (
        BomLine, BomHeader, Family, InventoryLedger, Item, Product, Supplier,
        SupplierItem, Warehouse,
    )

    data_dir = Path(__file__).resolve().parent.parent / "data"
    catalog_json = data_dir / "catalog_manatec.json"

    def _slugify(s: str) -> str:
        s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
        return s[:110] or "item"

    def _parse_price(raw: str) -> float:
        m = re.search(r"([\d,]+)", raw or "")
        if not m:
            return 0.0
        return float(m.group(1).replace(",", ""))

    def _parse_lead(text: str) -> tuple[int, int]:
        nums = re.findall(r"\d+", text or "")
        if not nums:
            return 10, 20
        if len(nums) == 1:
            return int(nums[0]), int(nums[0])
        return int(nums[0]), int(nums[1])

    admin = db.scalar(select(User).where(User.username == "admin"))

    if not db.scalar(select(Warehouse.id).limit(1)):
        db.add(Warehouse(code="WH1", name="Raw Material Store"))
        db.flush()
    wh = db.scalar(select(Warehouse).order_by(Warehouse.id).limit(1))
    if wh is None:
        db.add(Warehouse(code="WH1", name="Raw Material Store"))
        db.flush()
        wh = db.scalar(select(Warehouse).order_by(Warehouse.id).limit(1))

    # ── families from catalogue categories ────────────────────────────
    cat = json.loads(catalog_json.read_text(encoding="utf-8")) if catalog_json.exists() else []
    cycle_override = {
        "Lifting Equipment": (8, 4), "Paint Spray Booth": (8, 5),
        "3D Wheel Aligner": (6, 4), "Wheel Aligner": (6, 4),
        "Screw Air Compressor": (7, 4), "High Pressure Air Compressor": (7, 4),
    }
    fam_by_name = {f.name: f for f in db.query(Family).all()}
    for p in cat:
        fam = fam_by_name.get(p.get("category", ""))
        if fam is None and p.get("category"):
            cyc, ship = cycle_override.get(p["category"], (5, 3))
            fam = Family(name=p["category"], default_cycle_days=cyc, default_shipping_days=ship)
            db.add(fam)
            db.flush()
            fam_by_name[p["category"]] = fam

    # ── products from catalogue ───────────────────────────────────────
    for p in cat:
        name = p.get("name", "").strip()
        if not name:
            continue
        if db.scalar(select(Product.id).where(Product.name == name)):
            continue
        fam = fam_by_name.get(p.get("category", ""))
        db.add(Product(
            name=name,
            model_code=(p.get("slug") or _slugify(name)).upper(),
            family_id=fam.id if fam else None,
            category=p.get("category", ""),
            slug=p.get("slug", ""),
            url=p.get("url", ""),
            image_url=p.get("image", ""),
            price_raw=p.get("price_raw", ""),
            price_value=_parse_price(p.get("price_raw", "")),
            status="active",
        ))
    db.flush()

    # ── suppliers ─────────────────────────────────────────────────────
    if not db.scalar(select(Supplier.id).limit(1)):
        db.add_all([
            Supplier(name="Imported Components Hub (Chennai)", contact="chennai-imports@traders.in",
                     lead_time_days_default=45, rating=3),
            Supplier(name="Fabrication & Powder Coating (Puducherry)", contact="fabrication@local.in",
                     lead_time_days_default=10, rating=4),
            Supplier(name="Electronics Components Distributor (Chennai)", contact="elec@distributor.in",
                     lead_time_days_default=20, rating=4),
            Supplier(name="Hydraulics & Pneumatics (Coimbatore)", contact="hydro@coimbatore.in",
                     lead_time_days_default=25, rating=3),
            Supplier(name="Motor & Drives Supplier (Pune)", contact="motors@pune.in",
                     lead_time_days_default=30, rating=3),
        ])
        db.flush()
    supplier_by_kind: dict[str, Supplier] = {}
    for kind, names in {
        "import": ("Imported Components Hub",), "fabricated": ("Fabrication & Powder",),
        "short": ("Electronics Components",), "medium": ("Hydraulics & Pneumatics",),
        "long": ("Motor & Drives",),
    }.items():
        for nm in names:
            s = db.scalar(select(Supplier).where(Supplier.name.ilike(f"%{nm}%")))
            if s:
                supplier_by_kind[kind] = s

    # ── items from parts intelligence + lead-times ────────────────────
    parts_path = data_dir / "parts_intelligence.csv"
    existing = {i.code for i in db.query(Item).all()}
    if parts_path.exists():
        with open(parts_path, newline="", encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                code = _slugify(row["component"])
                if code in existing:
                    continue
                lo, hi = _parse_lead(row.get("typical_lead_time_days", "10-20"))
                src = row.get("lead_time_class", "medium").lower()
                it = Item(
                    code=code,
                    description=row["component"],
                    category=row.get("component_group", ""),
                    source_class=src,
                    lead_time_days_min=lo,
                    lead_time_days_max=hi,
                )
                db.add(it)
                db.flush()
                sup = supplier_by_kind.get(src)
                it.default_supplier_id = sup.id if sup else None
                if sup:
                    db.add(SupplierItem(item_id=it.id, supplier_id=sup.id,
                                        lead_time_days=hi, moq=0, price=0))
                existing.add(code)
    db.flush()

    # ── demo prices on suppliers (so POs & shortage values are meaningful) ─
    demo_price = {
        "AC-Motor-035HP": 8500, "LED-Monitor-15in": 5200, "DSP-PCB-main": 11500,
        "Load-cell-sensor": 6800, "Encoder-sensor": 4100, "PSU-SMPS": 2800,
        "Bearing-set-6204": 480, "Brake-solenoid-kit": 1450, "Fasteners-M12": 14,
        "Safety-nonreturn-valve": 950, "Solenoid-valve-AC": 1250, "PT-sensor": 880,
        "Opacity-sensor": 9200, "NDIR-gas-sensor": 12400, "Sample-pump-ASM": 2600,
        "Lifting-arms-telescopic": 3200, "MS-columns-4HC": 13800,
        "Hydraulic-power-pack": 16500, "Hydraulic-cylinder-pair": 8900,
        "Motor-24kW": 24500, "Compressor-pump-3HP": 11800, "Air-tank-250L": 7200,
        "Compressor-motor-3HP": 7900, "Cabinet-sheet-metal": 6500,
        "Shaft-cone-assembly": 2100, "Cast-iron-turntable": 1350,
        "Gas-analyzer-PCB": 6800, "Refrigerant-R134A": 900,
        "Refrigerant-recovery-comp": 5200, "Manifold-gauge-set-AC": 2400,
        "Wheel-adapters-set": 620, "Plexiglass-guard": 540, "Labels-decals": 180,
        "Wooden-crate-pack": 850,
    }
    for code, price in demo_price.items():
        it = db.scalar(select(Item).where(Item.code == code))
        if not it:
            continue
        sup = db.get(Supplier, it.default_supplier_id) if it.default_supplier_id else None
        if not sup:
            sup = db.scalar(select(Supplier).order_by(Supplier.id).limit(1))
            it.default_supplier_id = sup.id if sup else None
        if sup:
            si = db.scalar(select(SupplierItem).where(
                SupplierItem.supplier_id == sup.id, SupplierItem.item_id == it.id))
            if not si:
                si = SupplierItem(supplier_id=sup.id, item_id=it.id, price=0,
                                  lead_time_days=(it.lead_time_days_max or 20))
                db.add(si)
                db.flush()
            si.price = price
    db.flush()

    # ── opening inventory from sample (idempotent via 'opening' ledger check) ─
    inventory_path = data_dir / "sample_manatec_inventory.csv"
    if inventory_path.exists():
        with open(inventory_path, newline="", encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                code = row["Item Code"].strip()
                try:
                    qty = float(row["Quantity Available"])
                except ValueError:
                    continue
                item = db.scalar(select(Item).where(Item.code == code))
                if not item:
                    item = Item(code=code, description=code, category="imported")
                    db.add(item)
                    db.flush()
                if not (item.lead_time_days_min or item.lead_time_days_max):
                    item.lead_time_days_min, item.lead_time_days_max = 10, 20
                # idempotent: skip if opening ledger already exists for this item+warehouse
                existing = db.scalar(
                    select(InventoryLedger.id).where(
                        InventoryLedger.item_id == item.id,
                        InventoryLedger.warehouse_id == wh.id,
                        InventoryLedger.trans_type == "opening",
                    )
                )
                if not existing:
                    post_ledger(db, item_id=item.id, trans_type="opening", qty_delta=qty,
                                warehouse_id=wh.id, user_id=admin.id if admin else None,
                                note="Seed opening stock")
    db.flush()

    # ── BOMs from sample master ────────────────────────────────────────
    bom_path = data_dir / "sample_manatec_master_bom.csv"
    if bom_path.exists():
        with open(bom_path, newline="", encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                pname = row["Product"].strip()
                code = row["Item Code"].strip()
                try:
                    qty = float(row["Qty Required Per Unit"])
                except ValueError:
                    continue
                product = db.scalar(select(Product).where(Product.name == pname))
                if not product:
                    product = Product(name=pname, category="Imported BOM", status="active")
                    db.add(product)
                    db.flush()
                item = db.scalar(select(Item).where(Item.code == code))
                if not item:
                    item = Item(code=code, description=code, category="imported")
                    db.add(item)
                    db.flush()
                header = bom_service.active_header(db, product_id=product.id)
                if not header:
                    header = bom_service.create_revision(
                        db, product.id, admin.id if admin else None, "Seed import")
                    bom_service.activate_revision(db, header.id)
                    db.flush()
                bom_service.set_line(db, header.id, item.id, qty, 0)
    db.flush()

    _attach_demo_subassembly(db, admin)
    _seed_reorder_levels(db)
    db.commit()


def _attach_demo_subassembly(db: Session, admin: User | None) -> None:
    """Demonstrate multi-level BOM: fold 4 WBVL65 lines into one sub-assembly kit."""
    from sqlalchemy import select

    from . import bom_service
    from .models import BomLine, BomHeader, Item, Product

    product = db.scalar(select(Product).where(Product.name == "WBVL65 DSP Computerized Wheel Balancer"))
    if not product:
        return
    header = bom_service.active_header(db, product_id=product.id)
    if not header:
        return

    fold_codes = ["Wheel-adapters-set", "Plexiglass-guard", "Labels-decals", "Wooden-crate-pack"]
    item_by_code = {c: db.scalar(select(Item).where(Item.code == c)) for c in fold_codes}
    if not all(item_by_code.values()):
        return
    fold_ids = {it.id for it in item_by_code.values()}

    lines = bom_service.lines_for(db, header.id)
    to_fold = [ln for ln in lines if ln.child_item_id in fold_ids]
    if not to_fold or len(to_fold) < len(fold_ids):
        return

    kit = db.scalar(select(Item).where(Item.code == "balancer-accessory-kit"))
    if not kit:
        kit = Item(code="balancer-accessory-kit", description="Balancer Accessory Kit",
                   category="accessory", source_class="short",
                   lead_time_days_min=7, lead_time_days_max=10, is_assembly=True)
        db.add(kit)
        db.flush()

    kit_header = bom_service.active_header(db, item_id=kit.id)
    if not kit_header:
        kit_header = BomHeader(item_id=kit.id, rev_no=1, name="Balancer Accessory Kit",
                               status="active",
                               created_by=admin.id if admin else None)
        db.add(kit_header)
        db.flush()
    for ln in to_fold:
        has_line = db.scalar(
            select(BomLine.id).where(BomLine.header_id == kit_header.id,
                                      BomLine.child_item_id == ln.child_item_id))
        if not has_line:
            db.add(BomLine(header_id=kit_header.id, child_item_id=ln.child_item_id,
                           qty=ln.qty, scrap_pct=0))

    has_kit = db.scalar(
        select(BomLine.id).where(BomLine.header_id == header.id, BomLine.child_item_id == kit.id))
    if not has_kit:
        db.add(BomLine(header_id=header.id, child_item_id=kit.id, qty=1, scrap_pct=0))


def _seed_reorder_levels(db: Session) -> None:
    """Demo min/max stock levels (idempotent — always SET, never accumulates)."""
    from sqlalchemy import select

    from .models import Item

    levels = {
        "AC-Motor-035HP": (25, 60),
        "LED-Monitor-15in": (20, 50),
        "Bearing-set-6204": (100, 300),
        "Fasteners-M12": (500, 2000),
        "Start-limit-switches": (60, 150),
        "Shaft-cone-assembly": (20, 60),
        "Cabinet-sheet-metal": (15, 50),
        "Plexiglass-guard": (40, 120),
        "Wheel-adapters-set": (20, 60),
        "Wooden-crate-pack": (20, 60),
        "Labels-decals": (100, 500),
        "Safety-latch-kit": (30, 80),
    }
    for code, (mn, mx) in levels.items():
        item = db.scalar(select(Item).where(Item.code == code))
        if not item:
            continue
        item.min_qty = mn
        item.max_qty = mx


def seed(db: Session) -> None:
    dept_by_code: dict[str, Department] = {}
    for code, name in DEPARTMENTS:
        dept = db.scalar(select(Department).where(Department.code == code))
        if not dept:
            dept = Department(code=code, name=name)
            db.add(dept)
            db.flush()
        dept_by_code[code] = dept

    role_by_code: dict[str, Role] = {}
    for code, name in ROLES.items():
        role = db.scalar(select(Role).where(Role.code == code))
        if not role:
            role = Role(code=code, name=name)
            db.add(role)
            db.flush()
        role_by_code[code] = role

    def add_perms(role: Role, module: str, letters: str) -> None:
        for letter in letters:
            action = ACTION.get(letter)
            if not action:
                continue
            exists = db.scalar(
                select(Permission.id).where(
                    Permission.role_id == role.id,
                    Permission.module == module,
                    Permission.action == action,
                )
            )
            if not exists:
                db.add(Permission(role_id=role.id, module=module, action=action))

    for module, cols in _MATRIX.items():
        for role_code, letters in zip(_COLS, cols):
            add_perms(role_by_code[role_code], module, letters)
    for role_code, modules in _EXTRA.items():
        for module, letters in modules.items():
            add_perms(role_by_code[role_code], module, letters)
    # ADMIN implies every permission (RBAC bypass also enforced in security.requires)
    for module in _MATRIX:
        add_perms(role_by_code["ADMIN"], module, "RCEAXD")

    if not db.scalar(select(User).where(User.username == "admin")):
        emp = Employee(code="ADM001", name="Platform Administrator", department_id=dept_by_code["MGMT"].id)
        db.add(emp)
        db.flush()
        admin = User(
            username="admin",
            password_hash=hash_password("admin123"),
            employee_id=emp.id,
            role_id=role_by_code["ADMIN"].id,
        )
        db.add(admin)
        db.flush()
        notify(db, recipient_id=admin.id, title="Welcome to Manatec Digital",
               body="Platform administrator account created.")
    db.commit()


def seed_hr(db: Session) -> None:
    """HR common app seed.

    1. Department heads (leave step 1 requires a dept head).
    2. Annual leave balances for every employee (idempotent).
    3. Demo rows when SEED_DEMO is on: today's attendance, a sample leave
       request, guest visits and company notices so the mobile app is alive.
    """
    from datetime import date, datetime, timedelta, timezone

    from .config import get_settings
    from .models import (
        Attendance, CompanyNotice, Department, Employee, GuestVisit,
        LeaveBalance, LeaveRequest, User,
    )
    from .services import notify

    DEMO_HOURLY = {  # department code -> role code of the dept head in demo data
        "MGMT": "MGMT", "COMM": "COMM", "PLAN": "PLNR", "PROD": "SUP",
        "STOR": "STORE", "PURC": "PUR", "LOGI": "LOG", "QUAL": "QINSP",
        "ENGI": "ENG", "HRAD": "HR",
    }
    DEFAULT_BALANCES = {"casual": 12, "sick": 10, "earned": 15, "other": 5}

    # ── department heads ────────────────────────────────────────────────
    for dept in db.query(Department).all():
        if dept.head_employee_id:
            continue
        want_role = DEMO_HOURLY.get(dept.code)
        user = None
        if want_role:
            user = db.scalar(
                select(User).join(Role).where(Role.code == want_role).limit(1)
            )
        if user is None:
            user = db.scalar(
                select(User)
                .join(Role)
                .join(Employee, Employee.id == User.employee_id)
                .where(Employee.department_id == dept.id)
                .limit(1)
            )
        if user and user.employee_id:
            dept.head_employee_id = user.employee_id
    db.commit()

    # ── leave balances (current year) ───────────────────────────────────
    year = date.today().year
    employees = db.query(Employee).all()
    for emp in employees:
        for ltype, alloc in DEFAULT_BALANCES.items():
            existing = db.scalar(
                select(LeaveBalance).where(
                    LeaveBalance.employee_id == emp.id,
                    LeaveBalance.leave_type == ltype,
                    LeaveBalance.year == year,
                )
            )
            if existing is None:
                db.add(LeaveBalance(employee_id=emp.id, leave_type=ltype, year=year, allocated=alloc))
    db.commit()

    if not get_settings().seed_demo:
        return

    # ── demo: today's attendance ────────────────────────────────────────
    today = date.today()
    for uname, minute_offset in (("manager", 2), ("planner", 8), ("operator", 19),
                                 ("stores", 27), ("engineer", 12), ("commercial", 5)):
        user = db.scalar(select(User).where(User.username == uname))
        if not user or not user.employee_id:
            continue
        if db.scalar(select(Attendance.id).where(
                Attendance.employee_id == user.employee_id,
                Attendance.work_date == today)):
            continue
        now = datetime.now(timezone.utc)
        db.add(Attendance(employee_id=user.employee_id, work_date=today,
                          check_in=now - timedelta(hours=2) - timedelta(minutes=minute_offset),
                          source="seeded"))
    db.commit()

    # ── demo: one pending leave (operator → SUP head → HR) ──────────────
    operator = db.scalar(select(User).where(User.username == "operator"))
    if operator and operator.employee_id:
        if not db.scalar(select(LeaveRequest.id).where(LeaveRequest.employee_id == operator.employee_id,
                                                       LeaveRequest.status == "pending_dept")):
            frm = today + timedelta(days=4)
            db.add(LeaveRequest(employee_id=operator.employee_id, leave_type="casual",
                                from_date=frm, to_date=frm + timedelta(days=1), days=2,
                                reason="Personal work", status="pending_dept",
                                created_by=operator.id))
            db.commit()
            head = db.scalar(select(User).join(Employee, Employee.id == User.employee_id)
                             .where(Employee.id == db.scalar(select(Department.head_employee_id)
                                                              .select_from(Department)
                                                              .where(Department.code == "PROD"))))
            if head:
                notify(db, recipient_id=head.id, title="Leave request pending",
                       body=f"Arun Operator applied for 2 days casual leave", entity_type="leave")

    # ── demo: guest visits ──────────────────────────────────────────────
    if not db.scalar(select(GuestVisit.id)):
        now = datetime.now(timezone.utc)
        db.add(GuestVisit(visit_no="GV0001", visitor_name="Mr Kumar (Vendor SKP Steels)",
                          phone="98800 12345", purpose="Discuss steel supply rates",
                          host_name="Ravi Purchase", department_name="Purchase / Procurement",
                          check_in=now - timedelta(hours=3), status="admitted",
                          security_approved_by=operator.id if operator else None,
                          security_approved_at=now - timedelta(hours=3)))
        db.add(GuestVisit(visit_no="GV0002", visitor_name="Mrs Lakshmi (CGS Couriers)",
                          phone="90000 11111", purpose="Deliver documents",
                          host_name="Lakshmi Logistics", department_name="Logistics / Dispatch",
                          check_in=now - timedelta(minutes=30), status="pending"))
        db.commit()

    # ── demo: company notices ───────────────────────────────────────────
    hr = db.scalar(select(User).where(User.username == "hr"))
    if not db.scalar(select(CompanyNotice.id)):
        today_s = today.strftime("%d %b")
        db.add(CompanyNotice(title="Plant maintenance shutdown — maintenance work",
                             body=f"On {today_s} afternoon, compressed-air supply will be down "
                                  "for scheduled servicing between 14:00 and 16:00. "
                                  "Plan your work accordingly.", posted_by=hr.id if hr else None))
        db.add(CompanyNotice(title="Safety: personal protective equipment compliance",
                             body="Remember to wear helmet, goggles and safety shoes inside the "
                                  "plant. Periodic checks resume this week.", posted_by=hr.id if hr else None))
        db.commit()
        # broadcast an in-app notification so the badge updates
        for u in db.query(User).filter(User.active.is_(True)).all():
            notify(db, recipient_id=u.id, title="New company announcement",
                   body="Plant maintenance shutdown on " + today_s, entity_type="notice")


def seed_workshop(db: Session) -> None:
    """Demo rows for the visit register, quality loop and machine shop.

    Without these the three modules open empty and a reviewer cannot tell a
    working workflow from a missing endpoint. Idempotent: each block is guarded
    by a "table already has rows" check.
    """
    from datetime import date, datetime, timedelta, timezone

    from .config import get_settings
    from .models import (
        Department, Employee, Inspection, Machine, MachineDowntime, Ncr, User, Visit,
    )

    if not get_settings().seed_demo:
        return

    now = datetime.now(timezone.utc)
    today = date.today()

    def user(username: str) -> User | None:
        return db.scalar(select(User).where(User.username == username))

    def dept(code: str) -> Department | None:
        return db.scalar(select(Department).where(Department.code == code))

    def emp_of(u: User | None) -> Employee | None:
        return db.get(Employee, u.employee_id) if u and u.employee_id else None

    host = user("manager")
    purchase = user("purchase")
    commercial = user("commercial")
    quality = user("quality")
    operator = user("operator")
    prod_sup = user("prod_sup")
    logistics = user("logistics")
    engineer = user("engineer")

    # ── visits ─────────────────────────────────────────────────────────
    if not db.scalar(select(Visit.id)):
        db.add_all([
            Visit(
                visit_no="VB2609-0001", visit_type="buyer",
                visitor_name="Rajesh Iyer", company="ABC Motors, Chennai",
                contact="98400 22331", purpose="Product inspection of Fox 3D wheel aligner",
                requirement="Approval for 6 units against PO", host_user_id=(commercial or host).id if (commercial or host) else None,
                department_id=dept("COMM").id if dept("COMM") else None,
                visit_date=today, expected_time="10:30", food_arrangement="lunch",
                transport_required=False, vehicle_no="TN-07-AX-4412",
                status="confirmed", tracking_enabled=True, eta_minutes=25,
                latitude=13.0827, longitude=80.2707, location_note_tracking="Peelamedu crossroad",
                location_updated_at=now - timedelta(minutes=4),
                created_by=(commercial or host).id if (commercial or host) else None,
                confirmed_at=now - timedelta(hours=2),
            ),
            Visit(
                visit_no="VS2609-0002", visit_type="supplier",
                visitor_name="Deepak Rao", company="Precision Bearings & Fasteners",
                contact="98400 55667", purpose="Discuss new wheel-aligner bearing supply",
                requirement="Prototype approval, 200 nos sample required",
                host_user_id=(purchase or host).id if (purchase or host) else None,
                department_id=dept("PURC").id if dept("PURC") else None,
                visit_date=today + timedelta(days=1), expected_time="11:00",
                food_arrangement="lunch", transport_required=True,
                status="created", created_by=(purchase or host).id if (purchase or host) else None,
            ),
            Visit(
                visit_no="VC2608-0011", visit_type="customer",
                visitor_name="Anitha Menon", company="Highline Garage Systems",
                contact="90000 77889", purpose="Service complaint review — turntable noise",
                requirement="Replacement of turntable assembly under warranty",
                host_user_id=(prod_sup or host).id if (prod_sup or host) else None,
                department_id=dept("PROD").id if dept("PROD") else None,
                visit_date=today - timedelta(days=1), expected_time="15:30",
                food_arrangement="refreshments", status="meeting",
                outcome_sample=True, next_action="Send replacement turntable quotation",
                arrived_at=now - timedelta(days=1, hours=2), meeting_at=now - timedelta(days=1, hours=1),
                created_by=(prod_sup or host).id if (prod_sup or host) else None,
            ),
        ])
        db.commit()

    # ── quality ────────────────────────────────────────────────────────
    if not db.scalar(select(Inspection.id)):
        incoming = Inspection(
            insp_no="IQ2609-0001", kind="incoming", ref_type="grn", ref_no="GRN-0118",
            product_name="Bearing 6204-2RS", qty=200, result="pass", severity="minor",
            checklist=[
                {"key": "material_grade", "label": "Material grade matches PO", "result": "pass", "remark": ""},
                {"key": "qty", "label": "Received quantity as per GRN", "result": "pass", "remark": ""},
                {"key": "damage", "label": "No transit damage", "result": "pass", "remark": ""},
                {"key": "certs", "label": "Test certificates / COC present", "result": "pass", "remark": ""},
                {"key": "marking", "label": "Item marking and labelling legible", "result": "pass", "remark": ""},
                {"key": "storage", "label": "Storage condition acceptable", "result": "pass", "remark": ""},
            ],
            remarks="COC from supplier received with the lot.",
            inspector_id=(quality or host).id if (quality or host) else None,
            inspector_name=(emp_of(quality).name if emp_of(quality) else "Ganesh Quality"),
            inspected_at=now - timedelta(days=1, hours=4), created_by=(quality or host).id if (quality or host) else None,
        )
        db.add(incoming)
        db.flush()

        final_fail = Inspection(
            insp_no="FQ2609-0002", kind="final", ref_type="production_order", ref_no="PO00007",
            product_name="Fox 3D Wheel Aligner", serial_no="WA-2026-00482", qty=1,
            result="fail", severity="major",
            checklist=[
                {"key": "frame", "label": "Frame alignment and rigidity", "result": "pass", "remark": ""},
                {"key": "sensor", "label": "Sensor alignment / calibration", "result": "fail",
                 "remark": "Camera sensor 1.4 degrees off, outside 1 degree tolerance"},
                {"key": "electronics", "label": "Electronics and wiring", "result": "pass", "remark": ""},
                {"key": "software", "label": "Software build and calibration pass", "result": "pass", "remark": ""},
                {"key": "safety", "label": "Safety interlock and emergency stop test", "result": "pass", "remark": ""},
                {"key": "accessories", "label": "Accessories and documents packed", "result": "na", "remark": ""},
            ],
            remarks="Sensor mounting bracket appears misaligned on assembly.",
            inspector_id=(quality or host).id if (quality or host) else None,
            inspector_name=(emp_of(quality).name if emp_of(quality) else "Ganesh Quality"),
            inspected_at=now - timedelta(hours=2), created_by=(quality or host).id if (quality or host) else None,
        )
        db.add(final_fail)
        db.flush()

        ncr = Ncr(
            ncr_no="NCR2609-0001", title="Sensor alignment out of tolerance — Fox 3D",
            issue="Camera sensor 1.4 degrees off during final QC; bracket mounting reference drifted.",
            detected_at="final", ref_no="FQ2609-0002", severity="major", status="corrective",
            qty_affected=1, assigned_to=(prod_sup or host).id if (prod_sup or host) else None,
            department_id=dept("PROD").id if dept("PROD") else None,
            root_cause="Bracket machining tolerance on the sensor mount was 0.4 mm wider than drawing.",
            due_date=today + timedelta(days=2), created_by=(quality or host).id if (quality or host) else None,
            created_at=now - timedelta(hours=2),
        )
        db.add(ncr)
        db.flush()
        final_fail.ncr_id = ncr.id

        db.add(Inspection(
            insp_no="PQ2609-0003", kind="in_process", ref_type="production_order", ref_no="PO00008",
            product_name="Wheel Balancer 3D", qty=1, result="pending", severity="minor",
            checklist=[], created_by=(quality or host).id if (quality or host) else None,
        ))
        db.commit()

    # ── machine shop ───────────────────────────────────────────────────
    if not db.scalar(select(Machine.id)):
        db.add_all([
            Machine(code="CNC-01", name="Vertical Machining Centre VMC-850", work_center="Machine Shop",
                    status="running", current_job="PO00007", part_no="WA-FRAME-042",
                    operator_name="Arun Operator", job_started_at=now - timedelta(minutes=42),
                    est_completion=now + timedelta(minutes=58), utilization_pct=82, tool_life_pct=74, oee_pct=78),
            Machine(code="CNC-02", name="CNC Turning Centre TC-500", work_center="Machine Shop",
                    status="idle", utilization_pct=61, tool_life_pct=88, oee_pct=60),
            Machine(code="CNC-03", name="Vertical Machining Centre VMC-1000", work_center="Machine Shop",
                    status="maintenance", utilization_pct=74, tool_life_pct=31, oee_pct=70),
            Machine(code="CNC-04", name="CNC Milling 5-Axis", work_center="Tool Room",
                    status="running", current_job="PO00008", part_no="WB-BRACKET-11",
                    operator_name="Ravi Purchase", job_started_at=now - timedelta(minutes=15),
                    utilization_pct=88, tool_life_pct=52, oee_pct=81),
            Machine(code="PRESS-01", name="Hydraulic Press 100T", work_center="Fabrication",
                    status="idle", utilization_pct=55, tool_life_pct=95, oee_pct=52),
        ])
        db.flush()
        db.add_all([
            MachineDowntime(machine_id=3, reason="tool_breakage",
                            started_at=now - timedelta(hours=3), ended_at=now - timedelta(hours=2, minutes=25),
                            minutes=35, resolution="Broken drill replaced from tool crib.",
                            reported_by="prod_sup", reported_role="SUP"),
            MachineDowntime(machine_id=2, reason="material_unavailable",
                            started_at=now - timedelta(days=1, hours=5), ended_at=now - timedelta(days=1, hours=3),
                            minutes=120, resolution="Stores issued bar stock from MAIN.",
                            reported_by="operator", reported_role="OPER"),
            MachineDowntime(machine_id=3, reason="maintenance",
                            started_at=now - timedelta(minutes=90), minutes=0,
                            resolution="", reported_by="prod_sup", reported_role="SUP"),
            MachineDowntime(machine_id=1, reason="setup",
                            started_at=now - timedelta(days=2, hours=2), ended_at=now - timedelta(days=2, hours=1, minutes=10),
                            minutes=50, resolution="Fixture changeover for PO00007.",
                            reported_by="operator", reported_role="OPER"),
        ])
        db.commit()


def init_db() -> None:
    from . import models  # noqa: F401  (register models on Base.metadata)
    from .config import get_settings
    from .db import Base, _add_missing_columns
    from .erp import sync_all

    _add_missing_columns()
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed(db)
        seed_mfg(db)
        if get_settings().seed_demo:
            seed_demo(db)
        seed_hr(db)
        seed_workshop(db)
        sync_all(db)   # FRS 18.5 — populate ERP cache at startup
        from .stores_service import init_balances_from_erp

        init_balances_from_erp(db)   # FRS 10.1 — seed platform stock ledger from ERP cache


if __name__ == "__main__":
    init_db()
    print("seeded")