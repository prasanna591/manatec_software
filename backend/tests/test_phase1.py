"""Phase 1 smoke tests for the Manatec platform foundation.

Run: `cd backend && python -m pytest -q`
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


def _login(client: TestClient, username: str, password: str) -> dict:
    r = client.post("/api/v1/auth/login", data={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return r.json()


def test_health():
    with TestClient(app) as client:
        r = client.get("/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"


def test_login_and_me_and_permissions():
    with TestClient(app) as client:
        auth = _login(client, "admin", "admin123")
        assert auth["user"]["role"] == "ADMIN"
        token = auth["access_token"]

        me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me.status_code == 200
        assert "Admin:create" in me.json()["permissions"]


def test_rbac_denies_operator_from_admin_module():
    with TestClient(app) as client:
        auth = _login(client, "operator", "demo123")
        token = auth["access_token"]
        r = client.post(
            "/api/v1/admin/departments",
            json={"code": "X1", "name": "Nope"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 403, r.text


def test_admin_create_department_is_audited():
    with TestClient(app) as client:
        token = _login(client, "admin", "admin123")["access_token"]
        h = {"Authorization": f"Bearer {token}"}
        r = client.post("/api/v1/admin/departments", json={"code": "TST", "name": "Test Dept"}, headers=h)
        assert r.status_code == 201, r.text

        audit = client.get("/api/v1/audit?entity_type=department&limit=50", headers=h).json()
        assert any(a["action"] == "create" and a["entity_ref"] == "TST" for a in audit)


def test_integration_sync_populates_cache():
    with TestClient(app) as client:
        token = _login(client, "admin", "admin123")["access_token"]
        h = {"Authorization": f"Bearer {token}"}
        r = client.post("/api/v1/integration/sync", json={"entities": ["item", "stock"]}, headers=h)
        assert r.status_code == 200
        assert all(j["status"] == "ok" for j in r.json()["jobs"])

        items = client.get("/api/v1/integration/cache/item", headers=h).json()
        assert len(items["rows"]) >= 10


def test_dashboard_overview_uses_real_data():
    with TestClient(app) as client:
        token = _login(client, "manager", "demo123")["access_token"]
        r = client.get("/api/v1/dashboard/overview", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        kpis = r.json()["kpis"]
        assert kpis["orders"] > 0
        assert 0 <= kpis["production_pct"] <= 100
        assert kpis["material_alerts"] >= 0


def test_operator_my_tasks_and_status_update():
    with TestClient(app) as client:
        token = _login(client, "operator", "demo123")["access_token"]
        h = {"Authorization": f"Bearer {token}"}
        mine = client.get("/api/v1/tasks/my", headers=h).json()
        assert len(mine) >= 1
        tid = mine[0]["id"]
        r = client.post(f"/api/v1/tasks/{tid}/status", json={"status": "in_progress"}, headers=h)
        assert r.status_code == 200
        assert r.json()["status"] == "in_progress"


def test_search_finds_erp_and_local_entities():
    with TestClient(app) as client:
        token = _login(client, "manager", "demo123")["access_token"]
        h = {"Authorization": f"Bearer {token}"}
        items = client.get("/api/v1/search?q=ITM0001", headers=h).json()
        assert any(r["kind"] == "item" and r["ref"] == "ITM0001" for r in items["results"])

        so = client.get("/api/v1/search?q=SO00001", headers=h).json()
        assert any(r["kind"] == "sales_order" for r in so["results"])

        emp = client.get("/api/v1/search?q=arun", headers=h).json()
        assert any(r["kind"] == "employee" and "Arun" in r["label"] for r in emp["results"])

        short = client.get("/api/v1/search?q=a", headers=h).json()
        assert short["results"] == []


def test_admin_update_and_delete_department_is_audited():
    with TestClient(app) as client:
        token = _login(client, "admin", "admin123")["access_token"]
        h = {"Authorization": f"Bearer {token}"}
        r = client.post("/api/v1/admin/departments", json={"code": "TST2", "name": "Test Dept"}, headers=h)
        assert r.status_code == 201
        did = r.json()["id"]

        upd = client.put(f"/api/v1/admin/departments/{did}", json={"name": "Renamed"}, headers=h)
        assert upd.status_code == 200
        assert upd.json()["name"] == "Renamed"

        audit = client.get("/api/v1/audit?entity_type=department&limit=50", headers=h).json()
        assert any(a["action"] == "update" and a["entity_ref"] == "TST2" for a in audit)

        # deleting a department that still has employees/tasks must be refused
        refused = client.delete("/api/v1/admin/departments/1", headers=h)
        assert refused.status_code == 409

        done = client.delete(f"/api/v1/admin/departments/{did}", headers=h)
        assert done.status_code == 200
        depts = client.get("/api/v1/admin/departments", headers=h).json()
        assert all(d["id"] != did for d in depts)
        audit = client.get("/api/v1/audit?entity_type=department&limit=50", headers=h).json()
        assert any(a["action"] == "delete" and a["entity_ref"] == "TST2" for a in audit)


def test_admin_update_user_and_deactivate():
    with TestClient(app) as client:
        token = _login(client, "admin", "admin123")["access_token"]
        h = {"Authorization": f"Bearer {token}"}
        created = client.post(
            "/api/v1/admin/users",
            json={"username": "tempuser", "password": "pass1234", "role_code": "OPER"},
            headers=h,
        )
        assert created.status_code == 201
        uid = created.json()["id"]

        upd = client.put(
            f"/api/v1/admin/users/{uid}",
            json={"role_code": "SUP", "password": "newpass9"},
            headers=h,
        )
        assert upd.status_code == 200

        deact = client.delete(f"/api/v1/admin/users/{uid}", headers=h)
        assert deact.status_code == 200
        assert deact.json()["active"] is False

        # deactivated user can no longer log in
        denied = client.post("/api/v1/auth/login", data={"username": "tempuser", "password": "newpass9"})
        assert denied.status_code == 401


def test_admin_edit_delete_rbac_denies_operator():
    with TestClient(app) as client:
        token = _login(client, "operator", "demo123")["access_token"]
        h = {"Authorization": f"Bearer {token}"}
        r = client.put("/api/v1/admin/departments/1", json={"name": "Nope"}, headers=h)
        assert r.status_code == 403
        r = client.delete("/api/v1/admin/departments/1", headers=h)
        assert r.status_code == 403


def test_notifications_unread_and_mark_read():
    with TestClient(app) as client:
        token = _login(client, "admin", "admin123")["access_token"]
        h = {"Authorization": f"Bearer {token}"}
        assert client.get("/api/v1/notifications/unread-count", headers=h).json()["unread"] >= 1
        note = client.get("/api/v1/notifications/my", headers=h).json()[0]
        assert client.post(f"/api/v1/notifications/{note['id']}/read", headers=h).status_code == 200