"""Seed — first-run bootstrap of the Manatec platform.

Loads: admin user, warehouse, product families & catalogue (95 products with
images), items + suppliers + lead-times, sample inventory, and the sample BOMs
(including one multi-level sub-assembly to exercise the explode logic).
"""

from __future__ import annotations

import csv
import json
import re
from datetime import datetime
from pathlib import Path

from sqlalchemy.orm import Session

from . import bom_service
from .config import (
    ADMIN_PASSWORD,
    ADMIN_USERNAME,
    CATALOG_JSON,
    PARTS_INTEL_CSV,
    SAMPLE_BOM,
    SAMPLE_INVENTORY,
)
from .db import SessionLocal, init_db
from .helpers import audit, post_ledger
from .models import (
    BomHeader, BomLine, Family, InventoryLedger, Item, Product, Supplier, SupplierItem,
    User, Warehouse,
)
from .security import hash_password


def _slugify(s: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s[:110] or "item"


def _parse_price(price_raw: str) -> float:
    m = re.search(r"([\d,]+)", price_raw or "")
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


def seed_all(db: Session) -> dict:
    counts = {}

    # ── users ─────────────────────────────────────────────────────────────
    if not db.query(User).filter(User.username == ADMIN_USERNAME).first():
        db.add(User(username=ADMIN_USERNAME, full_name="Platform Admin",
                    role="admin", password_hash=hash_password(ADMIN_PASSWORD)))
    db.flush()
    admin = db.query(User).filter(User.username == ADMIN_USERNAME).first()
    counts["users"] = db.query(User).count()

    # ── warehouse ─────────────────────────────────────────────────────────
    if not db.query(Warehouse).first():
        db.add(Warehouse(code="WH1", name="Raw Material Store"))
    db.flush()
    wh = db.query(Warehouse).first()

    # ── families from catalogue categories ────────────────────────────────
    cat = json.loads(Path(CATALOG_JSON).read_text(encoding="utf-8")) if Path(CATALOG_JSON).exists() else []
    cycle_override = {
        "Lifting Equipment": (8, 4), "Paint Spray Booth": (8, 5),
        "3D Wheel Aligner": (6, 4), "Wheel Aligner": (6, 4),
        "Screw Air Compressor": (7, 4), "High Pressure Air Compressor": (7, 4),
    }
    fam_by_name: dict[str, Family] = {f.name: f for f in db.query(Family).all()}
    for p in cat:
        fam = fam_by_name.get(p.get("category", ""))
        if fam is None and p.get("category"):
            cyc, ship = cycle_override.get(p["category"], (5, 3))
            fam = Family(name=p["category"], default_cycle_days=cyc, default_shipping_days=ship)
            db.add(fam)
            db.flush()
            fam_by_name[p["category"]] = fam
    db.commit()
    counts["families"] = db.query(Family).count()

    # ── products from catalogue ───────────────────────────────────────────
    for p in cat:
        name = p.get("name", "").strip()
        if not name:
            continue
        exists = db.query(Product).filter(Product.name == name).first()
        if exists:
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
    counts["products"] = db.query(Product).count()

    # ── suppliers ─────────────────────────────────────────────────────────
    if not db.query(Supplier).first():
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
            s = db.query(Supplier).filter(Supplier.name.ilike(f"%{nm}%")).first()
            if s:
                supplier_by_kind[kind] = s
    counts["suppliers"] = db.query(Supplier).count()

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
        it = db.query(Item).filter(Item.code == code).first()
        if not it:
            continue
        sup = db.get(Supplier, it.default_supplier_id) if it.default_supplier_id else None
        if not sup:
            sup = db.query(Supplier).order_by(Supplier.id).first()
            it.default_supplier_id = sup.id if sup else None
        if sup:
            si = db.query(SupplierItem).filter_by(supplier_id=sup.id, item_id=it.id).first()
            if not si:
                si = SupplierItem(supplier_id=sup.id, item_id=it.id, price=0,
                                  lead_time_days=(it.lead_time_days_max or 20))
                db.add(si)
            si.price = price
    db.flush()

    # ── items from parts intelligence + lead-times ────────────────────────
    existing = {i.code for i in db.query(Item).all()}
    added_items = 0
    if Path(PARTS_INTEL_CSV).exists():
        with open(PARTS_INTEL_CSV, newline="", encoding="utf-8") as fh:
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
                db.flush()  # materialise id before linking supplier item
                sup = supplier_by_kind.get(src)
                it.default_supplier_id = sup.id if sup else None
                if sup:
                    db.add(SupplierItem(item_id=it.id, supplier_id=sup.id,
                                        lead_time_days=hi, moq=0, price=0))
                existing.add(code)
                added_items += 1
    db.flush()

    # ── opening inventory from sample ─────────────────────────────────────
    admin = db.query(User).filter(User.username == ADMIN_USERNAME).first()
    imported_stock = 0
    already_open = (
        db.query(InventoryLedger.id).filter(InventoryLedger.trans_type == "opening").first()
        is not None
    )
    if not already_open and Path(SAMPLE_INVENTORY).exists():
        with open(SAMPLE_INVENTORY, newline="", encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                code = row["Item Code"].strip()
                try:
                    qty = float(row["Quantity Available"])
                except ValueError:
                    continue
                item = db.query(Item).filter(Item.code == code).first()
                if not item:
                    item = Item(code=code, description=code, category="imported")
                    db.add(item)
                    db.flush()
                # If no lead-time info yet, keep sane defaults.
                if not (item.lead_time_days_min or item.lead_time_days_max):
                    item.lead_time_days_min, item.lead_time_days_max = 10, 20
                post_ledger(db, item_id=item.id, trans_type="opening", qty_delta=qty,
                            warehouse_id=wh.id, user_id=admin.id, note="Seed opening stock")
                imported_stock += 1
    db.commit()
    counts["items"] = db.query(Item).count()
    counts["stocked_items"] = imported_stock

    # ── BOMs from sample master ───────────────────────────────────────────
    bom_products = 0
    bom_lines = 0
    if Path(SAMPLE_BOM).exists():
        with open(SAMPLE_BOM, newline="", encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                pname = row["Product"].strip()
                code = row["Item Code"].strip()
                try:
                    qty = float(row["Qty Required Per Unit"])
                except ValueError:
                    continue
                product = db.query(Product).filter(Product.name == pname).first()
                if not product:
                    product = Product(name=pname, category="Imported BOM", status="active")
                    db.add(product)
                    db.flush()
                item = db.query(Item).filter(Item.code == code).first()
                if not item:
                    item = Item(code=code, description=code, category="imported")
                    db.add(item)
                    db.flush()
                header = bom_service.active_header(db, product_id=product.id)
                if not header:
                    header = bom_service.create_revision(db, product.id, admin.id, "Seed import")
                    bom_service.activate_revision(db, header.id)
                    db.flush()
                    bom_products += 1
                bom_service.set_line(db, header.id, item.id, qty, 0)
                bom_lines += 1
    db.flush()

    # ── multi-level demo: WBVL65 sub-assembly ─────────────────────────────
    _attach_demo_subassembly(db, admin)
    _seed_reorder_levels(db)

    audit(db, user_id=admin.id, action="seed.run",
          details={"catalogue": len(cat), "items": counts["items"],
                   "bom_products": bom_products, "bom_lines": bom_lines})
    db.commit()

    counts.update({
        "catalogue_products": len(cat), "bom_products": bom_products, "bom_lines": bom_lines,
        "warehouse": wh.name if wh else None,
    })
    return counts


def _attach_demo_subassembly(db: Session, admin: User) -> None:
    """Demonstrate multi-level BOM: fold 4 WBVL65 lines into one sub-assembly."""
    product = db.query(Product).filter(Product.name == "WBVL65 DSP Computerized Wheel Balancer").first()
    if not product:
        return
    header = bom_service.active_header(db, product_id=product.id)
    if not header:
        return

    fold_codes = ["Wheel-adapters-set", "Plexiglass-guard", "Labels-decals", "Wooden-crate-pack"]
    item_by_code = {
        c: db.query(Item).filter(Item.code == c).first() for c in fold_codes
    }
    if not all(item_by_code.values()):
        return  # items not all present — keep flat BOM
    fold_ids = {it.id for it in item_by_code.values()}

    lines = bom_service.lines_for(db, header.id)
    to_fold = [ln for ln in lines if ln.child_item_id in fold_ids]
    if not to_fold or len(to_fold) < len(fold_ids):
        return

    kit = db.query(Item).filter(Item.code == "balancer-accessory-kit").first()
    if not kit:
        kit = Item(code="balancer-accessory-kit", description="Balancer Accessory Kit",
                   category="accessory", source_class="short",
                   lead_time_days_min=7, lead_time_days_max=10, is_assembly=True)
        db.add(kit)
        db.flush()

    kit_header = bom_service.active_header(db, item_id=kit.id)
    if not kit_header:
        kit_header = BomHeader(item_id=kit.id, rev_no=1, name="Balancer Accessory Kit",
                               status="active", created_by=admin.id)
        db.add(kit_header)
        db.flush()
    for ln in to_fold:
        has_line = db.query(BomLine).filter_by(header_id=kit_header.id,
                                               child_item_id=ln.child_item_id).first()
        if not has_line:
            db.add(BomLine(header_id=kit_header.id, child_item_id=ln.child_item_id,
                           qty=ln.qty, scrap_pct=0))

    for ln in to_fold:
        db.delete(ln)
    db.flush()
    has_kit = db.query(BomLine).filter_by(header_id=header.id, child_item_id=kit.id).first()
    if not has_kit:
        db.add(BomLine(header_id=header.id, child_item_id=kit.id, qty=1, scrap_pct=0))


def _seed_reorder_levels(db: Session) -> None:
    """Demo min/max stock levels (idempotent — always SET, never accumulates)."""
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
        item = db.query(Item).filter(Item.code == code).first()
        if not item:
            continue
        item.min_qty = mn
        item.max_qty = mx


def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        counts = seed_all(db)
        print("Manatec platform seeded:")
        for k, v in counts.items():
            print(f"  {k:>20}: {v}")
    finally:
        db.close()


if __name__ == "__main__":
    main()