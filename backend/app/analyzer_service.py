"""BOM Analyzer engine (ported from manatec/bom_solver.py + catalog.py).

Stateless: it reads uploaded inventory + master-BOM files and produces a
structure suitable for both the web UI and Excel/CSV export.
"""
from __future__ import annotations

import io
import json
import math
import re
from functools import lru_cache
from pathlib import Path

import pandas as pd

#: Candidate locations for the catalogue (backend/data has a copy).
_CATALOG_CANDIDATES = [
    Path(__file__).resolve().parent.parent / "data" / "catalog_manatec.json",
    Path(__file__).resolve().parent.parent / "catalog_manatec.json",
    Path(__file__).resolve().parent.parent.parent / "manatec" / "data" / "catalog_manatec.json",
]

ITEM_KEYWORDS = {
    "item", "part", "component", "code", "id", "sku", "number", "material",
    "item code", "part number", "item id", "part id", "material code", "component code",
}
QTY_KEYWORDS = {
    "qty", "quantity", "stock", "available", "count", "inventory", "on hand",
    "in stock", "qty available", "quantity available", "stock qty", "on-hand",
}
MASTER_QTY_KW = {
    "qty", "quantity", "required", "needed", "qty required", "quantity required",
    "qty needed", "quantity needed", "count", "no", "per unit",
}
PRODUCT_KEYWORDS = {
    "product", "assembly", "finished", "model", "sku", "product name",
    "product id", "model name", "assembly id", "finished goods", "fg",
}


def _normalise(s: str) -> str:
    return " ".join(str(s).strip().lower().split())


def _find_col(columns: list[str], keywords: set[str], label: str) -> str:
    norm_map = {c: _normalise(c) for c in columns}
    for col, n in norm_map.items():
        if n in keywords:
            return col
    for col, n in norm_map.items():
        for kw in keywords:
            if kw in n:
                return col
    raise KeyError(
        f"Could not identify the {label} column.\n"
        f"  Available columns: {columns}\n"
        f"  Expected any of: {sorted(keywords)[:8]}\u2026"
    )


def _load_table(source, filename: str | None = None) -> pd.DataFrame:
    if isinstance(source, (str, Path)):
        ext = Path(str(source)).suffix.lower()
        if ext in (".xlsx", ".xls"):
            return pd.read_excel(source)
        if ext == ".csv":
            return pd.read_csv(source)
        raise ValueError(f"Unsupported file format: {ext}")
    name = filename or "upload.csv"
    ext = Path(name).suffix.lower()
    if ext in (".xlsx", ".xls"):
        return pd.read_excel(source)
    if ext == ".csv":
        return pd.read_csv(source)
    raise ValueError(f"Unsupported file format: {ext}")


def read_inventory(source, filename: str | None = None, *,
                   item_col: str | None = None, qty_col: str | None = None) -> dict[str, int]:
    df = _load_table(source, filename)
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


def _read_master_sheet(df: pd.DataFrame, item_col: str | None, qty_col: str | None,
                       product_col: str | None) -> dict[str, dict[str, int]]:
    cols = list(df.columns)
    if not item_col:
        item_col = _find_col(cols, ITEM_KEYWORDS, "master item")
    if not qty_col:
        qty_col = _find_col(cols, MASTER_QTY_KW, "master quantity")
    if not product_col:
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


def read_master(source, filename: str | None = None, *,
                item_col: str | None = None, qty_col: str | None = None,
                product_col: str | None = None) -> dict[str, dict[str, int]]:
    df = _load_table(source, filename)
    if filename and Path(filename).suffix.lower() in (".xlsx", ".xls"):
        xls = pd.ExcelFile(source)
        all_products: dict[str, dict[str, int]] = {}
        for sheet_name in xls.sheet_names:
            sheet_df = pd.read_excel(xls, sheet_name=sheet_name)
            prods = _read_master_sheet(sheet_df, item_col, qty_col, product_col)
            if list(prods.keys()) == ["<default>"]:
                all_products[sheet_name.strip()] = prods["<default>"]
            else:
                all_products.update(prods)
        return all_products
    return _read_master_sheet(df, item_col, qty_col, product_col)


def analyze_product(bom: dict[str, int], inventory: dict[str, int]) -> dict:
    missing_items: dict[str, int] = {}
    shortage_details: list[tuple[str, int, int, int]] = []
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

    not_in_inventory = [item for item in bom if item not in inventory]
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


# ── catalogue enrichment (ported from catalog.py) ──────────────────────────
_STOP = {
    "the", "a", "an", "with", "for", "and", "of", "lux", "plus", "premium",
    "model", "type", "machine", "made", "india", "computerized", "computerised",
    "fully", "automatic", "semi", "wheel", "car", "cars", "2", "3d",
}
_BRAND_TOKENS = {"manatec"}


def _tokens(name: str) -> set[str]:
    words = re.findall(r"[a-z0-9]{2,}", name.lower())
    return {w for w in words if w not in _STOP}


def _brand_clean(name: str) -> list[str]:
    return [t for t in _tokens(name) if t not in _BRAND_TOKENS]


@lru_cache(maxsize=1)
def _catalog_path() -> Path | None:
    for cand in _CATALOG_CANDIDATES:
        if cand.exists():
            return cand
    return None


@lru_cache(maxsize=1)
def load_catalog() -> list[dict]:
    path = _catalog_path()
    if not path:
        return []
    return json.loads(path.read_text(encoding="utf-8"))


def lookup_product(query: str, threshold: float = 0.35) -> dict | None:
    q = set(_brand_clean(query))
    if not q:
        return None
    best: dict | None = None
    best_score = 0.0
    for card in load_catalog():
        c = set(_brand_clean(card["name"]))
        if not c:
            continue
        inter = q & c
        union = q | c
        score = len(inter) / len(union)
        if inter == q and inter == c:
            score = 1.0
        elif inter == q and len(c) <= len(q):
            score = max(score, 0.9)
        if score > best_score:
            best_score = score
            best = card
    if best_score >= threshold:
        return best
    return None


def enrich(product_name: str) -> dict:
    card = lookup_product(product_name)
    if not card:
        return {"catalog_image": "", "catalog_category": "", "catalog_price": ""}
    return {
        "catalog_image": card.get("image", ""),
        "catalog_category": card.get("category", ""),
        "catalog_price": card.get("price_raw", ""),
    }


# ── combined report ─────────────────────────────────────────────────────────
def _collect_products(bom_map: dict[str, dict[str, int]], analysis: dict, inventory: dict) -> list[dict]:
    products = []
    for pname, bom in bom_map.items():
        r = analysis[pname]
        rows = []
        for item, need_per_unit in sorted(bom.items()):
            have = inventory.get(item, 0)
            buildable = r["max_units"]
            rows.append({
                "item": item,
                "in_bom": True,
                "need": need_per_unit,
                "have": have,
                "capacity": (have // need_per_unit) if need_per_unit > 0 else 0,
                "max_units": buildable,
                "stock_after": max(have - buildable * need_per_unit, 0),
                "shortage": max(need_per_unit - have, 0) if have < need_per_unit else 0,
                "status": "OK" if have >= need_per_unit else "SHORT",
            })
        for item, have in sorted(inventory.items()):
            if item not in bom:
                rows.append({
                    "item": item, "in_bom": False, "need": 0, "have": have,
                    "capacity": None, "max_units": 0, "stock_after": have,
                    "shortage": 0, "status": "EXTRA",
                })
        products.append({
            "name": pname,
            "max_units": r["max_units"],
            "status": "OK" if r["max_units"] > 0 else "BLOCKED",
            "bom_item_count": r["bom_item_count"],
            "missing_count": len(r["missing_items"]),
            "shortage_count": len(r["shortage_details"]),
            "leftover_count": len(r["leftover_after_production"]),
            "leftover_total": sum(r["leftover_after_production"].values()),
            "unused_count": len(r["extra_unmatched"]),
            "unused_total": sum(r["extra_unmatched"].values()),
            "rows": rows,
            **enrich(pname),
        })
    return products


def analyze_files(inventory_file, inventory_name: str, master_file, master_name: str,
                  overrides: dict | None = None) -> dict:
    """Run the full analysis over two uploaded file objects.

    Returns the same JSON shape as the Flask /api/analyze endpoint.
    """
    overrides = overrides or {}

    inv = read_inventory(
        _as_bytesio(inventory_file), filename=inventory_name,
        item_col=overrides.get("item_col") or None, qty_col=overrides.get("qty_col") or None,
    )
    bom_map = read_master(
        _as_bytesio(master_file), filename=master_name,
        item_col=overrides.get("master_item") or None, qty_col=overrides.get("master_qty") or None,
        product_col=overrides.get("master_product") or None,
    )
    analysis = {pname: analyze_product(bom, inv) for pname, bom in bom_map.items()}
    products = _collect_products(bom_map, analysis, inv)

    buildable = sum(1 for p in products if p["status"] == "OK")
    return {
        "inventory_count": len(inv),
        "master_item_count": sum(len(b) for b in bom_map.values()),
        "product_count": len(products),
        "buildable": buildable,
        "blocked": len(products) - buildable,
        "products": products,
    }


def _as_bytesio(file) -> io.BytesIO:
    if isinstance(file, io.BytesIO):
        return file
    if hasattr(file, "read"):
        return io.BytesIO(file.read())
    return io.BytesIO(file)


# ── export helpers ──────────────────────────────────────────────────────────
def export_csv(products: list[dict]) -> io.BytesIO:
    import csv

    lines = []
    for p in products:
        for row in p["rows"]:
            lines.append({
                "Product": p["name"], "Item": row["item"],
                "In BOM": "Yes" if row["in_bom"] else "No",
                "Qty Required/Unit": row["need"], "Inventory": row["have"],
                "Max Units": row["max_units"], "Stock After": row["stock_after"],
                "Shortage": row["shortage"], "Status": row["status"],
            })
    buf = io.BytesIO()
    if lines:
        text = io.StringIO()
        w = csv.DictWriter(text, fieldnames=list(lines[0].keys()))
        w.writeheader()
        w.writerows(lines)
        buf.write(text.getvalue().encode("utf-8"))
    buf.seek(0)
    return buf


def export_xlsx(products: list[dict]) -> io.BytesIO:
    buf = io.BytesIO()
    summary = []
    for p in products:
        summary.append({
            "Product": p["name"],
            "BOM Components": p["bom_item_count"],
            "Max Units Buildable": p["max_units"],
            "Missing Items": p["missing_count"],
            "Short Items": p["shortage_count"],
            "Leftover Items (post-build)": p["leftover_count"],
            "Unused Inventory Items": p["unused_count"],
        })
    with pd.ExcelWriter(buf, engine="xlsxwriter") as writer:
        pd.DataFrame(summary).to_excel(writer, sheet_name="Summary", index=False)
        ws = writer.sheets["Summary"]
        ws.set_column("A:A", 35)
        for col_letter in "BCDEFG":
            ws.set_column(f"{col_letter}:{col_letter}", 20)
        for p in products:
            sheet = (p["name"][:28] + "...") if len(p["name"]) > 31 else p["name"]
            df = pd.DataFrame([{
                "Item": row["item"], "In BOM": "Yes" if row["in_bom"] else "No",
                "Qty Required/Unit": row["need"], "Inventory": row["have"],
                "Units Buildable (this item only)": row["capacity"] if row["capacity"] is not None else "-",
                "Max Product Units": row["max_units"],
                "Stock After Production": row["stock_after"],
                "Shortage": row["shortage"],
            } for row in p["rows"]])
            df.to_excel(writer, sheet_name=sheet, index=False)
            ws = writer.sheets[sheet]
            ws.set_column("A:A", 40)
            ws.set_column("B:I", 16)
    buf.seek(0)
    return buf