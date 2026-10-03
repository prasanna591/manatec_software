"""Lead-time resolution — "how long to order and arrive" per item."""
from __future__ import annotations

from sqlalchemy.orm import Session

from .models import Item, SupplierItem

DEFAULT_LEAD_DAYS = 20
CLASS_DEFAULTS = {"short": 7, "medium": 20, "long": 45, "import": 45, "fabricated": 10}


def resolve_lead_days(db: Session, item: Item) -> tuple[int, int]:
    """Return (min_days, max_days) for an item.

    Resolution: item's own registry → supplier-specific lead time for the item's
    default supplier → class-based default.
    """
    lo, hi = int(item.lead_time_days_min or 0), int(item.lead_time_days_max or 0)
    if lo > 0 or hi > 0:
        return (lo, hi)

    if item.default_supplier_id:
        si = (
            db.query(SupplierItem)
            .filter_by(item_id=item.id, supplier_id=item.default_supplier_id)
            .first()
        )
        if si and si.lead_time_days:
            return (int(si.lead_time_days), int(si.lead_time_days))

    lo = DEFAULT_LEAD_DAYS
    hi = DEFAULT_LEAD_DAYS
    if item.source_class:
        hi = lo = CLASS_DEFAULTS.get(item.source_class.lower(), DEFAULT_LEAD_DAYS)
    return (lo, hi)


def max_project_lead_days(db: Session, items: list[Item]) -> int:
    """Worst-case lead time across a set of items (drives promised date)."""
    best = 0
    for it in items:
        _lo, hi = resolve_lead_days(db, it)
        best = max(best, hi)
    return best