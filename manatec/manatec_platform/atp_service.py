"""Available-to-Promise engine — the core of the platform."""

from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from . import bom_service
from .helpers import available, item_avg_price, items_map
from .leadtime import max_project_lead_days, resolve_lead_days
from .models import Item, Product


@dataclass
class BuildCoverage:
    """Per-item detail of an ATP or build-N calculation."""
    item_id: int
    code: str
    description: str
    need_per_unit: float          # quantity consumed per finished unit
    req_for_target: float         # need_per_unit * target qty
    on_hand: float
    in_transit: float
    committed: float
    avail: float
    short: float                  # 0 if sufficient
    unit_cost: float
    lead_days_min: int
    lead_days_max: int
    buildable_this_item: float    # avail // need_per_unit (0 if need 0)
    shared_with: list[str] = field(default_factory=list)


@dataclass
class AtpResult:
    product_id: int
    product_name: str
    has_bom: bool
    buildable_now: float | None   # None when no BOM
    limiting_item: str | None
    limiting_item_id: int | None
    coverage: list[BuildCoverage]
    total_line_value: float = 0.0
    whatif_qty: float | None = None
    shortage_value: float = 0.0
    max_lead_days: int = 0
    ok_for_target: bool = False


def _shared_with(db: Session, item_id: int, product_ids: list[int]) -> list[str]:
    """Which other BOM-linked products use this item (for pegging display)."""
    names: list[str] = []
    for pid in product_ids:
        flat = bom_service.explode(db, pid)
        if item_id in flat:
            p = db.get(Product, pid)
            if p:
                names.append(p.name)
            if len(names) >= 6:
                break
    return names


def buildable_now(db: Session, product_id: int) -> AtpResult:
    return build_n(db, product_id, target_qty=0)


def build_n(db: Session, product_id: int, target_qty: float) -> AtpResult:
    product = db.get(Product, product_id)
    if product is None:
        raise ValueError(f"Product {product_id} not found")

    flat = bom_service.explode(db, product_id)
    if not flat:
        return AtpResult(
            product_id=product_id, product_name=product.name, has_bom=False,
            buildable_now=None, limiting_item=None, limiting_item_id=None, coverage=[],
        )

    bom_products = _bom_products(db)

    cov: list[BuildCoverage] = []
    limiting_item = None
    limiting_item_id = None
    buildable = float("inf")
    total_line_value = 0.0
    max_lead = 0

    for item_id, need_per_unit in sorted(flat.items(), key=lambda kv: kv[1], reverse=True):
        item = db.get(Item, item_id)
        if item is None:
            continue
        oh = available(db, item_id)  # already on_hand + in_transit - committed
        on_hand_raw = _on_hand_raw(db, item_id)
        in_trans_raw = _in_transit_raw(db, item_id)
        comm_raw = _committed_raw(db, item_id)
        need = round(float(need_per_unit), 6)

        cap = (oh // need) if need > 0 else float("inf")
        buildable = min(buildable, cap)

        short_needed = 0.0
        if target_qty and need > 0:
            req = need * target_qty
            short_needed = max(0.0, req - oh)
            unit_cost = item_avg_price(db, item.id)
            total_line_value += short_needed * unit_cost
            lo, hi = resolve_lead_days(db, item)
            max_lead = max(max_lead, hi)
            if short_needed > 0 and limiting_item is None:
                limiting_item = item.code
                limiting_item_id = item.id
        elif need > 0 and cap == buildable and limiting_item is None:
            limiting_item = item.code
            limiting_item_id = item.id

        cov.append(BuildCoverage(
            item_id=item.id,
            code=item.code,
            description=item.description,
            need_per_unit=need,
            req_for_target=need * target_qty if target_qty else 0.0,
            on_hand=on_hand_raw,
            in_transit=in_trans_raw,
            committed=comm_raw,
            avail=oh,
            short=short_needed,
            unit_cost=item_avg_price(db, item.id),
            lead_days_min=resolve_lead_days(db, item)[0],
            lead_days_max=resolve_lead_days(db, item)[1],
            buildable_this_item=(oh // need) if need > 0 else float("inf"),
            shared_with=_shared_with(db, item.id, bom_products),
        ))

    if buildable == float("inf"):
        buildable = None

    return AtpResult(
        product_id=product_id,
        product_name=product.name,
        has_bom=True,
        buildable_now=buildable,
        limiting_item=limiting_item or (cov[0].code if cov else None),
        limiting_item_id=limiting_item_id,
        coverage=cov,
        total_line_value=round(total_line_value, 2),
        whatif_qty=target_qty or None,
        shortage_value=round(total_line_value, 2),
        max_lead_days=max_lead,
        ok_for_target=(target_qty == 0) or (target_qty is not None and buildable is not None and target_qty <= buildable),
    )


def _bom_products(db: Session) -> list[int]:
    from .models import BomHeader
    return [
        pid for (pid,) in db.query(BomHeader.product_id).filter(
            BomHeader.product_id.isnot(None), BomHeader.status == "active").distinct().all()
    ]


def _on_hand_raw(db: Session, item_id: int) -> float:
    from .helpers import on_hand
    return on_hand(db, item_id)


def _in_transit_raw(db: Session, item_id: int) -> float:
    from .helpers import in_transit
    return in_transit(db, item_id)


def _committed_raw(db: Session, item_id: int) -> float:
    from .helpers import committed
    return committed(db, item_id)


def all_buildable(db: Session) -> list[AtpResult]:
    """ATP across every BOM-linked product."""
    results = []
    for pid in _bom_products(db):
        try:
            results.append(buildable_now(db, pid))
        except ValueError:
            continue
    return results