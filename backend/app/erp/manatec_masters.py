"""Real Manatec master data for the mock ERP adapter.

`mock_erp.py` needs believable items, products, customers, suppliers and a BOM.
Rather than inventing filler ("Material 1"), this module derives them from the
real research already captured in `backend/seed_data/`:

  parts_intelligence.csv           93 components across 13 product families
  sample_manatec_inventory.csv    live quantities for 54 of those components
  sample_manatec_master_bom.csv   parent/component relationships
  catalog_manatec.json            95 catalogue entries with prices + specs

Everything is deterministic and file-backed: same input files, same masters.
Component codes stay in the `ITM0001..` series so existing ledger rows, FKs and
tests that reference `ITM0001` keep resolving -- only the descriptive text
becomes real. Swapping in the live ERP feed means replacing this module, not the
adapter contract.
"""
from __future__ import annotations

import csv
import hashlib
import json
import re
from functools import lru_cache
from pathlib import Path

SEED_DIR = Path(__file__).resolve().parents[2] / "seed_data"

# UOM by component group -- consumables ship in pieces, software is licensed.
_UOM_BY_GROUP = {
    "Consumables": "PCS",
    "Software": "LIC",
    "Electronics": "NOS",
    "Electrical": "NOS",
    "Mechanical": "NOS",
    "Pneumatic": "NOS",
    "Hydraulic-Pneumatic": "NOS",
    "Vacuum": "NOS",
}

# Reorder cover as a fraction of the captured on-hand quantity. Longer lead
# time means more buffer, which is what makes the inventory-health KPI move
# instead of sitting pinned at 100. Expressed as a share of real stock so the
# figure stays believable against the captured quantities.
_COVER_SHARE = {"Short": 0.25, "Medium": 0.4, "Long": 0.55}
# The first three items keep the quantities the original placeholder masters
# produced: existing ledger rows and the stores tests assert 100 - 3*i on hand.
LEGACY_ON_HAND = {1: 97, 2: 94, 3: 91}


def base_on_hand(item: dict) -> int:
    """Quantity on the shelf before any deliberate shortage is applied.

    Single source of truth shared by the item master (which sizes the reorder
    point) and the stock feed, so a reorder point can never be set above the
    stock it is measured against.
    """
    code = item["code"]
    i = int(code[3:])
    if i in LEGACY_ON_HAND:
        return LEGACY_ON_HAND[i]
    erp_code = item.get("erp_code", "")
    live = live_quantities().get(erp_code)
    if live:
        return live
    return 70 + _stable(erp_code or code, "base") % 120


def _stable(*parts: str) -> int:
    digest = hashlib.sha256("|".join(parts).encode()).digest()
    return int.from_bytes(digest[:4], "big")


def is_starved(item: dict) -> bool:
    """True when the seeder should run this component down, so the inventory
    alerts and the procurement worklist reflect genuine shortages.

    Skipped for the legacy items and for components the business holds only a
    handful of -- starving a 2-litre tin of powder coat is not a supply problem.
    """
    if int(item["code"][3:]) in LEGACY_ON_HAND or base_on_hand(item) < 8:
        return False
    return _stable(item.get("erp_code") or item["code"], "short") % 5 == 0


def reorder_point(on_hand: int | None, lead_class: str) -> int:
    """Reorder level for an item.

    A share of what is actually on the shelf, capped at half of it: longer lead
    times carry more cover. The cap is what keeps an item from reading as short
    by accident -- only `is_starved` items should show up in the alert list.
    """
    if not on_hand:
        return 45
    share = _COVER_SHARE.get(lead_class, _COVER_SHARE["Medium"])
    return max(1, min(int(on_hand * share), int(on_hand * 0.5)))

# Purchase type -> platform item_type.
_ITEM_TYPE = {
    "Bought-out": "raw",
    "Fabricated in-house": "component",
    "In-house": "component",
    "In-house SMT + bought components": "component",
    "In-house + licensed": "component",
    "Supplied subassembly": "component",
    "In-house or bought": "raw",
    "Disinfection": "raw",
    "Medium": "raw",
    " filters": "raw",
    "Service consumables": "raw",
    "etc.)": "raw",
    "15-30": "raw",
}

_CATEGORY_BY_GROUP = {
    "Consumables": "CONSUM",
    "Software": "SOFT",
    "Electronics": "ELEC",
    "Electrical": "ELEC",
}

# Indian garage / workshop trade customers (tyre, alignment, AC, paint, wash).
_CUSTOMERS = [
    ("CUS001", "Shree Auto Tyres & Alignments", "Ahmedabad"),
    ("CUS002", "Patel Multi-Point Service Centre", "Surat"),
    ("CUS003", "Rajpath Motors Workshop", "Vadodara"),
    ("CUS004", "Kisan Auto Garage & Tyre House", "Rajkot"),
    ("CUS005", "Hi-Tech Car Care & Detailing", "Mumbai"),
    ("CUS006", "Gokul Motor Works", "Bhavnagar"),
    ("CUS007", "Sardar Auto Body & Paint", "Jamnagar"),
    ("CUS008", "Novotel Motors (Authorised Workshop)", "Delhi"),
]

# Vendors matched to the purchase type they actually supply.
_SUPPLIERS = [
    ("SUP001", "Bharat Forge Castings Pvt Ltd", "Bought-out", 21),
    ("SUP002", "Gujarat Precision Components", "Bought-out", 14),
    ("SUP003", "Deccan Auto Electricals", "Bought-out", 10),
    ("SUP004", "Sahyadri Pneumatics LLP", "Bought-out", 28),
    ("SUP005", "Manatec In-House Fabrication", "Fabricated in-house", 7),
    ("SUP006", "Prime Hydraulic Systems", "Bought-out", 35),
]


def _read_csv(name: str) -> list[dict[str, str]]:
    path = SEED_DIR / name
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8-sig") as fh:
        return [
            {(k or "").strip(): (v or "").strip() for k, v in row.items() if k}
            for row in csv.DictReader(fh)
        ]


@lru_cache(maxsize=1)
def components() -> tuple[dict[str, str], ...]:
    """Real components, ordered so heavier mechanical parts lead the catalogue."""
    rows = [r for r in _read_csv("parts_intelligence.csv") if r.get("component")]
    seen: set[str] = set()
    out: list[dict[str, str]] = []
    for r in rows:
        name = r["component"]
        if name.lower() in seen:
            continue
        seen.add(name.lower())
        r["lead_class"] = r.get("lead_time_class", "") if r.get("lead_time_class") in _COVER_SHARE else "Medium"
        r["purchase_type"] = r.get("purchase_type", "Bought-out") if r.get("purchase_type") in _ITEM_TYPE else "Bought-out"
        out.append(r)
    return tuple(out)


@lru_cache(maxsize=1)
def live_quantities() -> dict[str, int]:
    path = SEED_DIR / "sample_manatec_inventory.csv"
    out: dict[str, int] = {}
    if not path.exists():
        return out
    with path.open(newline="", encoding="utf-8-sig") as fh:
        for row in csv.DictReader(fh):
            code = (row.get("Item Code") or "").strip()
            qty = (row.get("Quantity Available") or "").strip()
            if code and qty.isdigit():
                out[code] = int(qty)
    return out


@lru_cache(maxsize=1)
def families() -> tuple[str, ...]:
    seen: list[str] = []
    for r in components():
        fam = r.get("product_family", "")
        if fam and fam not in seen:
            seen.append(fam)
    return tuple(seen)


@lru_cache(maxsize=1)
def catalogue() -> tuple[dict, ...]:
    path = SEED_DIR / "catalog_manatec.json"
    if not path.exists():
        return ()
    try:
        return tuple(json.loads(path.read_text(encoding="utf-8")))
    except (json.JSONDecodeError, OSError):
        return ()


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


@lru_cache(maxsize=1)
def item_identities() -> tuple[tuple[str, str], ...]:
    """Ordered ``(erp_item_code, display_name)`` for every real component.

    Ordering is driven by `sample_manatec_inventory.csv` because those are the
    codes the ERP actually issues and the ones `sample_manatec_master_bom.csv`
    references. Components present in the parts intelligence but absent from
    inventory are appended so the catalogue still covers them.

    ITM0001/0002/0003 therefore stay *Shaft & cone assembly*, *Wheel adapters /
    cones set* and *Cabinet & side covers sheet metal* -- the same three items
    the previous placeholder masters mapped onto.
    """
    comps = components()
    tokens = [_tokens(r["component"]) for r in comps]
    used: set[int] = set()

    def best_match(code: str) -> int | None:
        want = _tokens(code)
        best: tuple[int, int] | None = None
        for i, cand in enumerate(tokens):
            if i in used:
                continue
            overlap = len(want & cand)
            if overlap and (best is None or overlap > best[0]):
                best = (overlap, i)
        return best[1] if best and best[0] >= 2 else None

    out: list[tuple[str, str]] = []
    for code in live_quantities():
        idx = best_match(code)
        if idx is None:
            out.append((code, code.replace("-", " ").title()))
        else:
            used.add(idx)
            out.append((code, comps[idx]["component"]))
    for i, r in enumerate(comps):
        if i not in used:
            out.append((_slug(r["component"]), r["component"]))
    return tuple(out)


def item_masters(count: int) -> list[dict]:
    """`count` items coded ITM0001.. with real Manatec component descriptions.

    Codes are positional and stable across restarts, so ledger rows, FKs and
    tests that reference `ITM0001` keep resolving -- only the descriptive text
    becomes real.
    """
    ids = item_identities()
    if not ids:  # seed data missing -- caller falls back to generic masters
        return []
    out: list[dict] = []
    for i in range(1, count + 1):
        erp_code, name = ids[(i - 1) % len(ids)]
        src = _component_for(erp_code, name)
        group = src.get("component_group", "Mechanical")
        lead_class = src.get("lead_class", "Medium")
        draft = {"code": f"ITM{i:04d}", "erp_code": erp_code}
        min_stock = reorder_point(base_on_hand(draft), lead_class)
        out.append(
            {
                "code": f"ITM{i:04d}",
                "name": name,
                "uom": _UOM_BY_GROUP.get(group, "NOS"),
                "category": _CATEGORY_BY_GROUP.get(group, src.get("product_family", "MECH").upper()[:8]),
                "item_type": _ITEM_TYPE.get(src.get("purchase_type", ""), "raw"),
                "min_stock": min_stock,
                # descriptive extras -- the ERP contract carries them through to the cache
                "erp_code": erp_code,
                "family": src.get("product_family", ""),
                "purchase_type": src.get("purchase_type", "Bought-out"),
                "lead_time_class": src.get("lead_class", "Medium"),
                "typical_use": src.get("typical_use", ""),
            }
        )
    return out


def _component_for(erp_code: str, display: str) -> dict[str, str]:
    for r in components():
        if r["component"] == display or _slug(r["component"]) == erp_code:
            return r
    return {}


def _family_keyword(family: str) -> str:
    """'Two Post / Four Post / Scissor Lift' -> 'lift'."""
    words = [w for w in re.split(r"[^A-Za-z0-9]+", family) if len(w) > 2]
    return (words[-1] if words else family).lower()


def product_masters(per_family: int = 2) -> list[dict]:
    """Real catalogue products, one group per Manatec product family."""
    fams = families()
    cat = catalogue()
    by_keyword: dict[str, list[dict]] = {}
    for entry in cat:
        name = (entry.get("name") or "").strip()
        if not name:
            continue
        blob = f"{name} {entry.get('category', '')}".lower()
        for fam in fams:
            kw = _family_keyword(fam)
            if kw and kw in blob and len(by_keyword.setdefault(fam, [])) < per_family:
                by_keyword[fam].append(entry)

    out: list[dict] = []
    n = 0
    for fam in fams:
        chosen = by_keyword.get(fam, [])
        for slot in range(per_family):
            n += 1
            entry = chosen[slot] if slot < len(chosen) else None
            name = (entry or {}).get("name") or f"{fam} Model {slot + 1}"
            out.append(
                {
                    "code": f"PRD{n:03d}",
                    "name": name.strip()[:70],
                    "uom": "NOS",
                    "active": True,
                    "family": fam,
                    "list_price": (entry or {}).get("price_raw", ""),
                    "url": (entry or {}).get("url", ""),
                }
            )
    return out


def customer_masters() -> list[dict]:
    return [
        {
            "code": code,
            "name": name,
            "contact": f"+91-9{8000 + i:04d}-{4000 + i * 7:05d}",
            "city": city,
            "type": "Garage / Workshop",
        }
        for i, (code, name, city) in enumerate(_CUSTOMERS)
    ]


def supplier_masters() -> list[dict]:
    return [
        {
            "code": code,
            "name": name,
            "lead_days": lead,
            "supplies": supplies,
        }
        for code, name, supplies, lead in _SUPPLIERS
    ]


STOP = {"the", "and", "for", "with", "dsp", "model", "type"}


def _tokens(text: str) -> set[str]:
    return {w for w in re.split(r"[^A-Za-z0-9]+", text.lower()) if len(w) > 1 and w not in STOP}


class _ProductResolver:
    """Map a captured BOM product name onto a generated product code.

    `sample_manatec_master_bom.csv` uses trade names ("WBVL65 DSP Computerized
    Wheel Balancer") while the catalogue uses marketing names, so exact prefix
    matching fails. Match on shared significant tokens, preferring the family
    keyword, and require the family to agree so we never bolt a balancer onto a
    tyre changer.
    """

    def __init__(self, item_count: int, product_count: int) -> None:
        self.by_family: dict[str, list[dict]] = {}
        for p in product_masters():
            if p["code"] in {f"PRD{i:03d}" for i in range(1, product_count + 1)}:
                self.by_family.setdefault(p["family"], []).append(p)
        self._all = [p for group in self.by_family.values() for p in group]

    def resolve(self, raw: str) -> str | None:
        want = _tokens(raw)
        if not want:
            return None
        best: tuple[int, str] | None = None
        for p in self._all:
            cand = _tokens(p["name"]) | _tokens(p["family"])
            overlap = len(want & cand)
            if not overlap:
                continue
            # A family keyword hit is a strong signal that we matched the right product.
            if _family_keyword(p["family"]) in want:
                overlap += 2
            if best is None or overlap > best[0]:
                best = (overlap, p["code"])
        if best is None or best[0] < 2:
            return None
        return best[1]


def bom_lines(item_count: int, product_count: int) -> list[dict]:
    """Real BOM where the captured data names both ends, else a family-consistent
    level-1 structure (every product consumes parts from its own family)."""
    comps = components()
    if not comps:
        return []

    code_of: dict[str, str] = {}
    for i in range(1, item_count + 1):
        erp_code, display = item_identities()[(i - 1) % len(item_identities())]
        code_of.setdefault(_slug(erp_code), f"ITM{i:04d}")
        code_of.setdefault(_slug(display), f"ITM{i:04d}")

    rows = _read_csv("sample_manatec_master_bom.csv")
    out: list[dict] = []
    used: set[tuple[str, str]] = set()
    resolver = _ProductResolver(item_count, product_count)
    for row in rows:
        comp_code = code_of.get(_slug(row.get("Item Code", "")))
        if not comp_code:
            continue
        prod_code = resolver.resolve(row.get("Product", ""))
        if not prod_code or (prod_code, comp_code) in used:
            continue
        try:
            qty = int(float(row.get("Qty Required Per Unit", "1") or 1))
        except ValueError:
            qty = 1
        used.add((prod_code, comp_code))
        out.append({"product": prod_code, "component": comp_code, "qty_per_unit": max(1, qty), "level": 1})

    if out:
        return out

    # Fallback: deterministic family-consistent structure.
    for r in comps[:item_count]:
        fam = r.get("product_family", "")
        idx = fams_index(fam)
        if idx is None:
            continue
        prod_code = f"PRD{idx * 2 + 1:03d}"
        comp_code = f"ITM{(comps.index(r) + 1):04d}"
        if prod_code in {f"PRD{i:03d}" for i in range(1, product_count + 1)}:
            out.append(
                {
                    "product": prod_code,
                    "component": comp_code,
                    "qty_per_unit": 1 + (comps.index(r) % 4),
                    "level": 1,
                }
            )
    return out


def fams_index(family: str) -> int | None:
    fams = families()
    return fams.index(family) if family in fams else None