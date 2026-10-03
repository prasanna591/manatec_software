"""FRS 10 Stores/Inventory smoke tests.

Run: `cd backend && python -m pytest -q`
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


def _login(client: TestClient, username: str, password: str) -> str:
    r = client.post("/api/v1/auth/login", data={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(client: TestClient, username: str = "stores", password: str = "demo123") -> dict:
    return {"Authorization": f"Bearer {_login(client, username, password)}"}


def test_stock_seeded_and_warehouses():
    with TestClient(app) as client:
        h = _h(client)
        stock = client.get("/api/v1/stores/stock", headers=h)
        assert stock.status_code == 200
        rows = stock.json()
        assert len(rows) >= 10
        assert any(r["warehouse"] == "MAIN" for r in rows)
        assert any(r["warehouse"] == "WIP" for r in rows)
        assert all("available" in r and "status" in r for r in rows)

        wh = client.get("/api/v1/stores/warehouses", headers=h)
        assert {"MAIN", "WIP"} <= set(wh.json()["warehouses"])


def test_grn_posts_balance_and_ledger():
    with TestClient(app) as client:
        h = _h(client)
        r = client.post("/api/v1/stores/grn", headers=h, json={
            "supplier_code": "SUP001", "po_ref": "PO00001", "warehouse": "MAIN",
            "lines": [{"item": "ITM0001", "qty": 25}],
        })
        assert r.status_code == 201, r.text
        grn = r.json()
        assert grn["grn_no"].startswith("GRN")
        assert grn["lines"][0]["qty"] == 25

        row = next(x for x in client.get("/api/v1/stores/stock", headers=h).json()
                   if x["item"] == "ITM0001" and x["warehouse"] == "MAIN")
        assert row["on_hand"] == 100 - 3 + 25  # seeded 97 + 25

        tx = client.get("/api/v1/stores/transactions", headers=h).json()
        assert any(m["ref_no"] == grn["grn_no"] and m["delta"] == 25 for m in tx)


def test_issue_decrements_and_insufficient_blocks():
    with TestClient(app) as client:
        h = _h(client)
        item = "ITM0002"
        on_hand_before = next(
            x for x in client.get("/api/v1/stores/stock", headers=h).json()
            if x["item"] == item and x["warehouse"] == "MAIN"
        )["on_hand"]

        r = client.post("/api/v1/stores/issues", headers=h, json={
            "warehouse": "MAIN", "issued_to": "PROD", "purpose": "PO test",
            "lines": [{"item": item, "qty": 10}],
        })
        assert r.status_code == 201, r.text

        after = next(x for x in client.get("/api/v1/stores/stock", headers=h).json()
                     if x["item"] == item and x["warehouse"] == "MAIN")
        assert after["on_hand"] == on_hand_before - 10

        blocked = client.post("/api/v1/stores/issues", headers=h, json={
            "warehouse": "MAIN", "issued_to": "PROD",
            "lines": [{"item": item, "qty": 999999}],
        })
        assert blocked.status_code == 409


def test_material_request_lifecycle():
    with TestClient(app) as client:
        # consuming-department operator creates (MaterialReq:C); Stores fulfils
        creator = _h(client, "operator")
        r = client.post("/api/v1/stores/material-requests", headers=creator, json={
            "purpose_ref": "WO-42", "priority": "high",
            "lines": [{"item": "ITM0001", "qty": 5}],
        })
        assert r.status_code == 201, r.text
        req = r.json()
        assert req["req_no"].startswith("MRQ")
        assert req["status"] == "open"

        stores = _h(client)
        requester_view = client.get("/api/v1/stores/material-requests", headers=stores)
        assert requester_view.status_code == 200
        assert any(x["id"] == req["id"] for x in requester_view.json())

        fulfil = client.post(f"/api/v1/stores/material-requests/{req['id']}/fulfil",
                             headers=stores, json={"warehouse": "MAIN"})
        assert fulfil.status_code == 200, fulfil.text
        assert fulfil.json()["status"] == "fulfilled"
        assert fulfil.json()["lines"][0]["issued_qty"] == 5

        row = next(x for x in client.get("/api/v1/stores/stock", headers=stores).json()
                   if x["item"] == "ITM0001" and x["warehouse"] == "MAIN")
        assert row["on_hand"] == 100 - 3 + 25 - 5  # seeded + grn - fulfilled

        cancel = client.post(f"/api/v1/stores/material-requests/{req['id']}/cancel",
                             headers=stores)
        assert cancel.status_code == 409  # already issued


def test_transfer_and_stock_take():
    with TestClient(app) as client:
        h = _h(client)
        t = client.post("/api/v1/stores/transfers", headers=h, json={
            "from_wh": "MAIN", "to_wh": "WIP", "lines": [{"item": "ITM0003", "qty": 8}],
        })
        assert t.status_code == 201, t.text
        main_row = next(x for x in client.get("/api/v1/stores/stock", headers=h).json()
                        if x["item"] == "ITM0003" and x["warehouse"] == "MAIN")
        wip_before = next(x for x in client.get("/api/v1/stores/stock", headers=h).json()
                          if x["item"] == "ITM0003" and x["warehouse"] == "WIP")

        take = client.post("/api/v1/stores/stock-takes", headers=h, json={"warehouse": "WIP"})
        assert take.status_code == 201, take.text
        assert take.json()["lines"][0]["book"] == wip_before["on_hand"]

        counts = [{"item": l["item"], "counted": l["book"] + 2} for l in take.json()["lines"][:2]]
        scarce = {"item": take.json()["lines"][0]["item"], "counted": take.json()["lines"][0]["book"] - 5}
        c = client.post(f"/api/v1/stores/stock-takes/{take.json()['id']}/count",
                        headers=h, json={"counts": counts + [scarce]})
        assert c.status_code == 200, c.text

        rec = client.post(f"/api/v1/stores/stock-takes/{take.json()['id']}/reconcile", headers=h)
        assert rec.status_code == 200, rec.text
        assert rec.json()["status"] == "reconciled"
        vars_ = [l["variance"] for l in rec.json()["lines"]]
        assert -5 in vars_ and 2 in vars_ and all(v == 0 or v in (-5, 2) for v in vars_)


def test_stores_summary_and_rbac():
    with TestClient(app) as client:
        h = _h(client)
        s = client.get("/api/v1/stores/summary", headers=h)
        assert s.status_code == 200
        body = s.json()
        assert body["skus"] > 0
        assert body["shortage_count"] >= 0
        assert body["open_requests"] >= 0

        # operator (Inventory:R / MaterialReq:C) may view stock but not post GRN
        op = _h(client, "operator")
        assert client.get("/api/v1/stores/stock", headers=op).status_code == 200
        blocked = client.post("/api/v1/stores/grn", headers=op, json={
            "lines": [{"item": "ITM0001", "qty": 1}],
        })
        assert blocked.status_code == 403