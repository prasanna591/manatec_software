"""ERP integration contract (FRS 18).

`ERPAdapter` is the contract every ERP connector implements. `MockERP` is a
deterministic stand-in used until Manatec's real ERP API/DB details are
confirmed in Phase 0; swapping to the real connector is config + one new
class, never a change to the platform.

Masters (items, products, customers, suppliers, BOM) come from the captured
Manatec research in `seed_data/` via `manatec_masters`, so the platform shows
real component and product names rather than placeholders. Transaction streams
carry ~6 weeks of backdated history so dashboards, delay KPIs and trend charts
have something real to show. Every value is derived deterministically from
fixed seeds -- no `random` -- so restarts and tests reproduce exactly.
"""
from __future__ import annotations

import hashlib
from datetime import date, timedelta
from typing import Protocol

from ..config import get_settings
from . import manatec_masters as masters


class ERPAdapter(Protocol):
    """Read side of FRS 18.3. Write methods (GRN, consumption, production,
    dispatch, PO creation) are added to the contract as later phases need them."""

    def items(self) -> list[dict]: ...
    def products(self) -> list[dict]: ...
    def customers(self) -> list[dict]: ...
    def suppliers(self) -> list[dict]: ...
    def bom(self) -> list[dict]: ...
    def stock(self) -> list[dict]: ...
    def sales_orders(self) -> list[dict]: ...
    def production_orders(self) -> list[dict]: ...


def _jitter(*parts: str) -> int:
    """Stable pseudo-random integer in [0, 97] derived from the given keys."""
    digest = hashlib.sha256("|".join(parts).encode()).digest()
    return digest[0] % 98


HISTORY_DAYS = 45
SALES_ORDERS = 68
PRODUCTION_ORDERS = 64

class MockERP:
    """Deterministic mock ERP. Same shape as the documented REST contract."""

    def __init__(self, item_count: int | None = None) -> None:
        self.item_count = item_count or get_settings().mock_erp_items

    # ── masters ────────────────────────────────────────────────────────
    def items(self) -> list[dict]:
        real = masters.item_masters(self.item_count)
        if real:
            return real
        return [  # seed_data absent -- keep the platform usable
            {
                "code": f"ITM{i:04d}",
                "name": f"Component {i}",
                "uom": "NOS",
                "category": "RAW" if i % 3 else "COMPONENT",
                "item_type": "raw" if i % 3 else "component",
                "min_stock": 10 * (i % 5 + 1),
            }
            for i in range(1, self.item_count + 1)
        ]

    def products(self) -> list[dict]:
        real = masters.product_masters()
        if real:
            return real
        return [
            {"code": f"PRD{i:03d}", "name": f"Product {i}", "uom": "NOS", "active": True}
            for i in range(1, 6)
        ]

    def customers(self) -> list[dict]:
        real = masters.customer_masters()
        if real:
            return real
        return [
            {"code": f"CUS{i:03d}", "name": f"Customer {i}", "contact": f"+91-90000-{i:05d}"}
            for i in range(1, 6)
        ]

    def suppliers(self) -> list[dict]:
        real = masters.supplier_masters()
        if real:
            return real
        return [
            {"code": f"SUP{i:03d}", "name": f"Supplier {i}", "lead_days": 7 * (i % 4 + 1)}
            for i in range(1, 5)
        ]

    def bom(self) -> list[dict]:
        real = masters.bom_lines(self.item_count, len(self.products()))
        if real:
            return real
        return [
            {
                "product": f"PRD{p:03d}",
                "component": f"ITM{c:04d}",
                "qty_per_unit": c,
                "level": 1,
            }
            for p in range(1, 6)
            for c in range(1, 4)
        ]

    # ── stock ──────────────────────────────────────────────────────────
    def stock(self) -> list[dict]:
        """On-hand quantities derived from the captured research, with a
        deterministic subset of components deliberately run down to a third of
        their captured level so the inventory KPIs and the procurement worklist
        have something genuine to act on."""
        rows: list[dict] = []
        for item in self.items():
            i = int(item["code"][3:])
            on_hand = masters.base_on_hand(item)
            # A shortage means the part is not sitting in WIP either, and the
            # inventory KPI sums across warehouses -- so starve both.
            starved = masters.is_starved(item)
            if starved:
                on_hand = max(1, int(on_hand * 0.35))
            rows.append(
                {
                    "item": item["code"],
                    "warehouse": "MAIN",
                    "on_hand": on_hand,
                    "reserved": _jitter(item["code"], "res") % 8,
                }
            )
            if i % 3 == 0 and not starved:  # a second warehouse so transfers/stock-takes demo
                rows.append(
                    {
                        "item": item["code"],
                        "warehouse": "WIP",
                        "on_hand": 12 + _jitter(item["code"], "wip"),
                        "reserved": 0,
                    }
                )
        return rows

    # ── transactions ───────────────────────────────────────────────────
    def sales_orders(self) -> list[dict]:
        """Backdated order book. Past-due orders stay open at a realistic rate
        so the delayed-order KPI reflects genuine lateness, not a fixed count."""
        today = date.today()
        products = [p["code"] for p in self.products()] or ["PRD001"]
        customers = [c["code"] for c in self.customers()] or ["CUS001"]
        out: list[dict] = []
        for i in range(1, SALES_ORDERS + 1):
            code = f"SO{i:05d}"
            ordered = today - timedelta(days=_jitter(code, "od") % HISTORY_DAYS)
            # Lead time 7-28 days from order date.
            required = ordered + timedelta(days=7 + _jitter(code, "lt") % 22)
            if required < today:
                # Old orders: mostly shipped, a slice still open => delayed.
                status = "open" if _jitter(code, "late") % 9 == 0 else (
                    "closed" if _jitter(code, "cls") % 3 == 0 else "dispatched"
                )
            else:
                status = "confirmed" if _jitter(code, "cfm") % 4 == 0 else "open"
            out.append(
                {
                    "order_no": code,
                    "customer": customers[_jitter(code, "cust") % len(customers)],
                    "product": products[_jitter(code, "prod") % len(products)],
                    "qty": 4 + _jitter(code, "qty") % 57,
                    "required_date": required.isoformat(),
                    "order_date": ordered.isoformat(),
                    "status": status,
                    "value": round(18000 + _jitter(code, "val") % 420000, 2),
                }
            )
        return out

    def production_orders(self) -> list[dict]:
        """Backdated production book with partial completions, so the completion
        KPI and the output trend both move instead of sitting at a constant."""
        today = date.today()
        products = [p["code"] for p in self.products()] or ["PRD001"]
        out: list[dict] = []
        for i in range(1, PRODUCTION_ORDERS + 1):
            code = f"PO{i:05d}"
            raised = today - timedelta(days=_jitter(code, "ra") % HISTORY_DAYS)
            due = raised + timedelta(days=5 + _jitter(code, "dd") % 25)
            qty = 10 + _jitter(code, "q") % 90
            if raised < today - timedelta(days=12):
                # Long-settled work: nearly all of it complete.
                completed = qty if _jitter(code, "done") % 11 else qty - (1 + _jitter(code, "part") % 5)
            elif due < today:
                # Currently late: partial, which is what drives the open-order count.
                completed = int(qty * (0.3 + (_jitter(code, "wip") % 50) / 100))
            else:
                completed = int(qty * (_jitter(code, "wip2") % 70) / 100)
            completed = max(0, min(qty, completed))
            out.append(
                {
                    "order_no": code,
                    "product": products[_jitter(code, "prod") % len(products)],
                    "qty": qty,
                    "completed_qty": completed,
                    "status": "completed" if completed >= qty else "in_progress",
                    "due_date": due.isoformat(),
                    "order_date": raised.isoformat(),
                    "completed_date": (raised + timedelta(days=1 + _jitter(code, "cd") % 12)).isoformat()
                    if completed >= qty
                    else None,
                }
            )
        return out


def snapshot_hash(snapshot: dict) -> str:
    return hashlib.sha256(repr(sorted(snapshot.items())).encode()).hexdigest()[:16]


def get_adapter() -> ERPAdapter:
    return MockERP()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)