"""ERP integration contract (FRS 18).

`ERPAdapter` is the contract every ERP connector implements. `MockERP` is a
deterministic stand-in used until Manatec's real ERP API/DB details are
confirmed in Phase 0; swapping to the real connector is config + one new
class, never a change to the platform.
"""
from __future__ import annotations

import hashlib
from typing import Protocol

from ..config import get_settings


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


class MockERP:
    """Deterministic mock ERP. Same shape as the documented REST contract."""

    def __init__(self, item_count: int | None = None) -> None:
        self.item_count = item_count or get_settings().mock_erp_items

    def items(self) -> list[dict]:
        return [
            {
                "code": f"ITM{i:04d}",
                "name": f"Material {i}",
                "uom": "NOS",
                "category": "RAW" if i % 3 else "COMPONENT",
                "item_type": "raw" if i % 3 else "component",
                "min_stock": 10 * (i % 5 + 1),
            }
            for i in range(1, self.item_count + 1)
        ]

    def products(self) -> list[dict]:
        return [
            {"code": f"PRD{i:03d}", "name": f"Product {i}", "uom": "NOS", "active": True}
            for i in range(1, 6)
        ]

    def customers(self) -> list[dict]:
        return [
            {"code": f"CUS{i:03d}", "name": f"Customer {i}", "contact": f"+91-90000-{i:05d}"}
            for i in range(1, 6)
        ]

    def suppliers(self) -> list[dict]:
        return [
            {"code": f"SUP{i:03d}", "name": f"Supplier {i}", "lead_days": 7 * (i % 4 + 1)}
            for i in range(1, 5)
        ]

    def bom(self) -> list[dict]:
        lines = []
        for p in range(1, 6):
            for c in range(1, 4):
                lines.append(
                    {
                        "product": f"PRD{p:03d}",
                        "component": f"ITM{c:04d}",
                        "qty_per_unit": c,
                        "level": 1,
                    }
                )
        return lines

    def stock(self) -> list[dict]:
        rows = []
        for i in range(1, self.item_count + 1):
            rows.append(
                {
                    "item": f"ITM{i:04d}",
                    "warehouse": "MAIN",
                    "on_hand": 100 - i * 3,
                    "reserved": i,
                }
            )
            if i % 3 == 0:  # a second warehouse so transfers/stock-takes demo
                rows.append(
                    {
                        "item": f"ITM{i:04d}",
                        "warehouse": "WIP",
                        "on_hand": 15 + i,
                        "reserved": 0,
                    }
                )
        return rows

    def sales_orders(self) -> list[dict]:
        """Deterministic demo orders; several intentionally past-due to exercise
        delay KPIs. Replaced by the real ERP feed in Phase 0."""
        from datetime import datetime, timedelta, timezone

        now = datetime.now(timezone.utc)
        orders = []
        for i in range(1, 19):
            due = now + timedelta(days=(i % 9) - 4)   # some negative => delayed
            status = "dispatched" if i % 7 == 0 else "open"
            orders.append(
                {
                    "order_no": f"SO{i:05d}",
                    "customer": f"CUS{(i % 5) + 1:03d}",
                    "product": f"PRD{(i % 5) + 1:03d}",
                    "qty": 10 * (i % 6 + 1),
                    "required_date": due.date().isoformat(),
                    "status": status,
                }
            )
        return orders

    def production_orders(self) -> list[dict]:
        from datetime import datetime, timedelta, timezone

        now = datetime.now(timezone.utc)
        result = []
        for i in range(1, 19):
            qty = 10 * (i % 6 + 1)
            completed = int(qty * ((i % 10) + 1) / 10)
            result.append(
                {
                    "order_no": f"PO{i:05d}",
                    "product": f"PRD{(i % 5) + 1:03d}",
                    "qty": qty,
                    "completed_qty": completed,
                    "status": "completed" if completed >= qty else "in_progress",
                    "due_date": (now + timedelta(days=(i % 9) - 4)).date().isoformat(),
                }
            )
        return result


def snapshot_hash(snapshot: dict) -> str:
    return hashlib.sha256(repr(sorted(snapshot.items())).encode()).hexdigest()[:16]


def get_adapter() -> ERPAdapter:
    return MockERP()