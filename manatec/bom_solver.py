#!/usr/bin/env python3
"""
Manufacturing BOM (Bill of Materials) Inventory Analyzer

Reads:
  1. An inventory file  (Excel or CSV) — columns: Item ID, Quantity Available
  2. A master BOM file  (Excel or CSV) — lists products, items per product, qty required

Produces:
  - Screen report per product
  - Output Excel workbook (or CSV) with full breakdown
"""

import argparse
import math
import os
import sys
from pathlib import Path

import pandas as pd


# ── Column name heuristics ──────────────────────────────────────────────────
ITEM_KEYWORDS    = {"item", "part", "component", "code", "id", "sku",
                     "number", "material", "item code", "part number",
                     "item id", "part id", "material code", "component code"}
QTY_KEYWORDS     = {"qty", "quantity", "stock", "available", "count",
                     "inventory", "on hand", "in stock", "qty available",
                     "quantity available", "stock qty", "on-hand"}
MASTER_QTY_KW    = {"qty", "quantity", "required", "needed", "qty required",
                     "quantity required", "qty needed", "quantity needed",
                     "count", "no", "per unit"}
PRODUCT_KEYWORDS = {"product", "assembly", "finished", "model", "sku",
                     "product name", "product id", "model name", "assembly id",
                     "finished goods", "fg"}


def _normalise(s: str) -> str:
    """Strip, lower, collapse whitespace."""
    return " ".join(s.strip().lower().split())


def _find_col(columns: list[str], keywords: set[str], label: str) -> str:
    """Return the first column whose normalised name contains any keyword."""
    norm_map = {c: _normalise(c) for c in columns}
    # exact match first
    for col, n in norm_map.items():
        if n in keywords:
            return col
    # substring match
    for col, n in norm_map.items():
        for kw in keywords:
            if kw in n:
                return col
    raise KeyError(
        f"Could not identify the {label} column.\n"
        f"  Available columns: {columns}\n"
        f"  Expected any of: {sorted(keywords)[:8]}…\n"
        "Please rename the column or pass --inv-item / --inv-qty / --master-qty / --master-product."
    )


# ── File readers ────────────────────────────────────────────────────────────
def _load_table(source, filename: str | None = None) -> pd.DataFrame:
    """Load a DataFrame from a path string OR a file-like upload object.

    source  : str/Path path, or a file-like object (BytesIO etc.)
    filename: name used for extension detection when source is file-like.
    """
    if isinstance(source, (str, os.PathLike)):
        name = str(source)
        ext = Path(name).suffix.lower()
        if ext in (".xlsx", ".xls"):
            return pd.read_excel(source)
        if ext == ".csv":
            return pd.read_csv(source)
        raise ValueError(f"Unsupported file format: {ext}")
    # file-like object — detect from filename
    name = filename or "upload.csv"
    ext = Path(name).suffix.lower()
    if ext in (".xlsx", ".xls"):
        return pd.read_excel(source)
    if ext == ".csv":
        return pd.read_csv(source)
    raise ValueError(f"Unsupported file format: {ext}")


def read_inventory(path: str, *, item_col: str | None, qty_col: str | None,
                   source=None, filename: str | None = None) -> dict[str, int]:
    """Return {item_id_str: quantity_int}. Accepts a path or a file object."""
    df = _load_table(source if source is not None else path, filename)

    if not item_col:
        item_col = _find_col(list(df.columns), ITEM_KEYWORDS, "inventory item")
    if not qty_col:
        qty_col = _find_col(list(df.columns), QTY_KEYWORDS, "inventory quantity")

    df[item_col] = df[item_col].astype(str).str.strip()
    df[qty_col] = pd.to_numeric(df[qty_col], errors="coerce").fillna(0).astype(int)

    inv: dict[str, int] = {}
    for _, row in df.iterrows():
        k = row[item_col].strip()
        inv[k] = inv.get(k, 0) + int(row[qty_col])
    return inv


def _read_master_sheet(
    df: pd.DataFrame,
    item_col: str | None,
    qty_col: str | None,
    product_col: str | None,
) -> dict[str, dict[str, int]]:
    """From a single DataFrame, return {product_name: {item: qty_required}}."""
    cols = list(df.columns)
    if not item_col:
        item_col = _find_col(cols, ITEM_KEYWORDS, "master item")
    if not qty_col:
        qty_col = _find_col(cols, MASTER_QTY_KW, "master quantity")

    if not product_col:
        # try to find a product column; it's OK if there isn't one
        try:
            product_col = _find_col(cols, PRODUCT_KEYWORDS, "master product")
        except KeyError:
            product_col = None

    df[qty_col] = pd.to_numeric(df[qty_col], errors="coerce").fillna(0).astype(int)

    products: dict[str, dict[str, int]] = {}
    if product_col:
        df[item_col] = df[item_col].astype(str).str.strip()
        for pname, grp in df.groupby(product_col):
            bom: dict[str, int] = {}
            for _, row in grp.iterrows():
                bom[row[item_col].strip()] = int(row[qty_col])
            products[str(pname).strip()] = bom
    else:
        bom: dict[str, int] = {}
        for _, row in df.iterrows():
            bom[str(row[item_col]).strip()] = int(row[qty_col])
        if bom:
            products["<default>"] = bom
    return products


def read_master(path: str, *, item_col: str | None, qty_col: str | None, product_col: str | None,
                source=None, filename: str | None = None) -> dict[str, dict[str, int]]:
    """Return {product_name: {item: qty_required}}. Accepts a path or a file object."""
    obj = source if source is not None else path
    df = _load_table(obj, filename)
    if filename and Path(filename).suffix.lower() in (".xlsx", ".xls"):
        # re-open excel to enumerate sheets
        xls = pd.ExcelFile(obj)
        all_products: dict[str, dict[str, int]] = {}
        for sheet_name in xls.sheet_names:
            sheet_df = pd.read_excel(xls, sheet_name=sheet_name)
            # If there's a product column inside the sheet use that, otherwise sheet name is product
            prods = _read_master_sheet(sheet_df, item_col, qty_col, product_col)
            if list(prods.keys()) == ["<default>"]:
                all_products[sheet_name.strip()] = prods["<default>"]
            else:
                all_products.update(prods)
        return all_products
    else:
        return _read_master_sheet(df, item_col, qty_col, product_col)


# ── Core analysis ───────────────────────────────────────────────────────────
def analyze_product(
    bom: dict[str, int],
    inventory: dict[str, int],
) -> dict:
    """Compute how many units of a product can be built and what's missing/extra."""
    missing_items: dict[str, int] = {}        # item -> qty short (needs to exist to build 1 unit)
    shortage_details: list[tuple[str, int, int, int]] = []  # (item, have, need, short)
    limiting_factor = float("inf")
    limiting_item = None

    for item, need_per_unit in bom.items():
        have = inventory.get(item, 0)
        if have <= 0:
            missing_items[item] = need_per_unit
            shortage_details.append((item, 0, need_per_unit, need_per_unit))
            limiting = 0
        else:
            limiting = have // need_per_unit
            if have < need_per_unit:
                shortage_details.append((item, have, need_per_unit, need_per_unit - have))
        if limiting < limiting_factor:
            limiting_factor = limiting
            limiting_item = item

    max_units = 0 if missing_items else limiting_factor

    # Items in BOM not in inventory at all
    not_in_inventory = [item for item in bom if item not in inventory]

    # Items in inventory but NOT in BOM — fully extra
    extra_items: dict[str, int] = {}
    leftover_items: dict[str, int] = {}
    for item, have in inventory.items():
        if item not in bom:
            extra_items[item] = have
        else:
            leftover = have - max_units * bom[item]
            if leftover > 0:
                leftover_items[item] = leftover

    return {
        "max_units": max_units,
        "limiting_item": limiting_item,
        "missing_items": missing_items,
        "not_in_inventory": not_in_inventory,
        "shortage_details": shortage_details,
        "extra_unmatched": extra_items,
        "leftover_after_production": leftover_items,
        "bom_item_count": len(bom),
    }


# ── Output ──────────────────────────────────────────────────────────────────
def print_report(results: dict[str, dict], inventory: dict[str, int], master_path: str):
    total_products = len(results)
    buildable = sum(1 for r in results.values() if r["max_units"] > 0)

    print("\n" + "=" * 80)
    print("  MANUFACTURING BOM INVENTORY ANALYSIS")
    print("=" * 80)
    print(f"  Inventory items        : {len(inventory):,}")
    print(f"  Products in master file: {total_products}")
    print(f"  Products buildable     : {buildable}")
    print(f"  Products blocked       : {total_products - buildable}")
    print("=" * 80)

    for name, r in sorted(results.items()):
        status = "OK" if r["max_units"] > 0 else "BLOCKED"
        print(f"\n{'─' * 70}")
        print(f"  PRODUCT: {name}  |  Status: {status}  |  Max units: {r['max_units']:,}")
        print(f"{'─' * 70}")
        print(f"  BOM components: {r['bom_item_count']}")

        if r["missing_items"]:
            print(f"\n  ❌ Items completely missing from inventory ({len(r['missing_items'])}):")
            for item, need in sorted(r["missing_items"].items()):
                print(f"       {item:40s}  need {need:,}")

        if r["shortage_details"]:
            print(f"\n  ⚠  Items with insufficient stock ({len(r['shortage_details'])}):")
            print(f"       {'Item':<40s} {'Have':>8s} {'Need':>8s} {'Short':>8s}")
            for item, have, need, short in sorted(r["shortage_details"], key=lambda x: -x[3]):
                print(f"       {item:<40s} {have:>8,} {need:>8,} {short:>8,}")

        if r["leftover_after_production"]:
            items_left = len(r["leftover_after_production"])
            units_left = sum(r["leftover_after_production"].values())
            print(f"\n  ✓  Leftover stock after making {r['max_units']:,} units "
                  f"({items_left} items, {units_left:,} total pieces):")
            for item, leftover in sorted(r["leftover_after_production"].items(),
                                         key=lambda x: -x[1])[:10]:
                print(f"       {item:<40s} +{leftover:>8,}")
            if items_left > 10:
                print(f"       ... and {items_left - 10} more items")

        if r["extra_unmatched"]:
            print(f"\n  ⬚  Inventory items NOT used in this product "
                  f"({len(r['extra_unmatched'])} items):")
            total_extra = sum(r["extra_unmatched"].values())
            print(f"       Total unused inventory pieces: {total_extra:,}")

    print("\n" + "=" * 80)
    print("  END OF REPORT")
    print("=" * 80 + "\n")


def write_output_excel(
    output_path: str,
    results: dict[str, dict],
    inventory: dict[str, int],
    bom_map: dict[str, dict[str, int]],
):
    """Write a detailed Excel workbook with per-product sheets + summary."""
    with pd.ExcelWriter(output_path, engine="xlsxwriter") as writer:
        # ── Summary sheet ──────────────────────────────────────────────
        summary_rows = []
        for name, r in sorted(results.items()):
            summary_rows.append({
                "Product": name,
                "BOM Components": r["bom_item_count"],
                "Max Units Buildable": r["max_units"],
                "Missing Items": len(r["missing_items"]),
                "Short Items": len(r["shortage_details"]),
                "Leftover Items (post-build)": len(r["leftover_after_production"]),
                "Unused Inventory Items": len(r["extra_unmatched"]),
            })
        df_summary = pd.DataFrame(summary_rows)
        df_summary.to_excel(writer, sheet_name="Summary", index=False)
        ws = writer.sheets["Summary"]
        ws.set_column("A:A", 35)
        ws.set_column("B:G", 18)

        # ── Per-product breakdown ──────────────────────────────────────
        for name, r in results.items():
            bom = bom_map[name]
            rows = []
            for item, need_per_unit in sorted(bom.items()):
                have = inventory.get(item, 0)
                buildable = r["max_units"]
                stock_after = have - buildable * need_per_unit
                rows.append({
                    "Item": item,
                    "Qty Required/Unit": need_per_unit,
                    "Inventory Available": have,
                    "In BOM?": "Yes",
                    "Stock Sufficient": "Yes" if have >= need_per_unit else "NO",
                    "Units Buildable (if only this item)": have // need_per_unit if need_per_unit > 0 else 0,
                    "Max Product Units": buildable,
                    "Stock After Production": max(stock_after, 0),
                    "Shortage": max(need_per_unit - have, 0) if have < need_per_unit else 0,
                })
            # Add inventory-only items
            for item, have in sorted(inventory.items()):
                if item not in bom:
                    rows.append({
                        "Item": item,
                        "Qty Required/Unit": 0,
                        "Inventory Available": have,
                        "In BOM?": "No",
                        "Stock Sufficient": "N/A",
                        "Units Buildable (if only this item)": "N/A",
                        "Max Product Units": 0,
                        "Stock After Production": have,
                        "Shortage": 0,
                    })

            df = pd.DataFrame(rows)
            # sheet name max 31 chars in Excel
            sheet = (name[:28] + "...") if len(name) > 31 else name
            df.to_excel(writer, sheet_name=sheet, index=False)
            ws = writer.sheets[sheet]
            ws.set_column("A:A", 40)
            ws.set_column("B:I", 18)

        # ── Write CSV as well ──────────────────────────────────────────
        # Flatten everything into one CSV for easy access
        flat_rows = []
        for name, r in results.items():
            for item, have in inventory.items():
                in_bom = item in bom_map[name]
                need = bom_map[name].get(item, 0)
                flat_rows.append({
                    "Product": name,
                    "Item": item,
                    "In BOM": in_bom,
                    "Qty Required/Unit": need,
                    "Inventory": have,
                    "Max Units": r["max_units"] if in_bom else 0,
                    "Stock After": max(have - r["max_units"] * need, 0),
                })
        df_flat = pd.DataFrame(flat_rows)
        flat_csv = output_path.replace(".xlsx", "_flat.csv") if output_path.endswith(".xlsx") else output_path + "_flat.csv"
        df_flat.to_csv(flat_csv, index=False)
        print(f"  Flat CSV exported to: {flat_csv}")

    print(f"  Excel workbook exported to: {output_path}")


# ── CLI ─────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        description="Manufacturing BOM Inventory Analyzer — "
                    "determines how many products can be built and what's missing/excess."
    )
    parser.add_argument("inventory", help="Path to inventory file (.xlsx or .csv)")
    parser.add_argument("master", help="Path to master BOM file (.xlsx or .csv)")
    parser.add_argument("-o", "--output", default="bom_report.xlsx",
                        help="Output file path (default: bom_report.xlsx)")
    parser.add_argument("--inv-item", default=None,
                        help="Override inventory item column name")
    parser.add_argument("--inv-qty", default=None,
                        help="Override inventory quantity column name")
    parser.add_argument("--master-qty", default=None,
                        help="Override master BOM quantity column name")
    parser.add_argument("--master-item", default=None,
                        help="Override master BOM item column name")
    parser.add_argument("--master-product", default=None,
                        help="Override master BOM product column name")
    parser.add_argument("--csv", action="store_true",
                        help="Output as CSV instead of Excel")
    args = parser.parse_args()

    print(f"\nReading inventory from : {args.inventory}")
    inventory = read_inventory(args.inventory, item_col=args.inv_item, qty_col=args.inv_qty)
    print(f"  → {len(inventory):,} unique items loaded\n")

    print(f"Reading master BOM from : {args.master}")
    bom_map = read_master(args.master, item_col=args.master_item, qty_col=args.master_qty, product_col=args.master_product)
    print(f"  → {len(bom_map):,} products loaded\n")

    # Analyze each product
    results: dict[str, dict] = {}
    for pname, bom in bom_map.items():
        results[pname] = analyze_product(bom, inventory)

    # Report
    print_report(results, inventory, args.master)

    # Write output
    if args.csv:
        out = args.output if args.output.endswith(".csv") else args.output.replace(".xlsx", ".csv")
        flat_rows = []
        for name, r in results.items():
            for item, have in sorted(inventory.items()):
                in_bom = item in bom_map[name]
                need = bom_map[name].get(item, 0)
                flat_rows.append({
                    "Product": name, "Item": item, "In BOM": in_bom,
                    "Qty Required/Unit": need, "Inventory": have,
                    "Max Units": r["max_units"] if in_bom else 0,
                    "Stock After": max(have - r["max_units"] * need, 0),
                })
        pd.DataFrame(flat_rows).to_csv(out, index=False)
        print(f"  CSV exported to: {out}\n")
    else:
        out = args.output if args.output.endswith(".xlsx") else args.output.replace(".csv", ".xlsx")
        write_output_excel(out, results, inventory, bom_map)
        print()


if __name__ == "__main__":
    main()
