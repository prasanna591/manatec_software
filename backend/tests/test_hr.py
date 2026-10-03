"""HR common-app tests: attendance, leave (2-step approval), guests, notices."""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


def _login(client: TestClient, username: str, password: str = "demo123") -> str:
    r = client.post("/api/v1/auth/login", data={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_attendance_checkin_checkout_and_roster():
    with TestClient(app) as client:
        op = _login(client, "operator")
        r = client.post("/api/v1/attendance/check-in", headers=_h(op))
        assert r.status_code in (200, 409)  # 409 when demo seed already checked in
        today = client.get("/api/v1/attendance/today", headers=_h(op)).json()
        assert today["status"] in ("present", "checked_out")
        me = client.get("/api/v1/attendance/me", headers=_h(op)).json()
        assert len(me) >= 1

        roster = client.get("/api/v1/attendance/roster", headers=_h(_login(client, "manager"))).json()
        assert roster["rows"] and all("attendance" in row for row in roster["rows"])

        # operator is not a dept head → 403 on roster
        r = client.get("/api/v1/attendance/roster", headers=_h(op))
        assert r.status_code == 403


def test_leave_two_step_approval_updates_balance():
    with TestClient(app) as client:
        op = _login(client, "operator")
        bal_before = {b["leave_type"]: b["used"] for b in
                      client.get("/api/v1/leave/balances", headers=_h(op)).json()["items"]}

        r = client.post("/api/v1/leave/apply", headers=_h(op), json={
            "leave_type": "sick", "from_date": "2026-11-02", "to_date": "2026-11-02",
            "reason": "fever"})
        assert r.status_code == 200, r.text
        lid = r.json()["id"]
        assert r.json()["status"] == "pending_dept"

        # step 1: department head (Suresh SUP over PROD) approves → pending_hr
        sup = _login(client, "prod_sup")
        r = client.post(f"/api/v1/leave/{lid}/approve", headers=_h(sup), json={"note": ""})
        assert r.json()["status"] == "pending_hr"

        # step 2: HR approves → done + balance consumed
        hr = _login(client, "hr")
        open_approvals = client.get("/api/v1/leave/approvals", headers=_h(hr)).json()
        assert any(x["id"] == lid for x in open_approvals)
        r = client.post(f"/api/v1/leave/{lid}/approve", headers=_h(hr), json={"note": "ok"})
        assert r.json()["status"] == "approved"
        bal_after = {b["leave_type"]: b["used"] for b in
                     client.get("/api/v1/leave/balances", headers=_h(op)).json()["items"]}
        assert bal_after["sick"] == bal_before["sick"] + 1

        # operator (not an approver) cannot approve anyone
        r = client.post(f"/api/v1/leave/{lid}/reject", headers=_h(op), json={"note": ""})
        assert r.status_code in (403, 409)  # 409 if already settled above


def test_guest_visit_flow_security_admit():
    with TestClient(app) as client:
        op = _login(client, "operator")
        r = client.post("/api/v1/guests", headers=_h(op), json={
            "visitor_name": "Mr Vendor", "phone": "9123", "purpose": "quotation",
            "host_name": "Arun", "department_name": "Production"})
        assert r.status_code == 200, r.text
        gid = r.json()["id"]
        assert r.json()["status"] == "pending"

        # operator not security → cannot admit
        r = client.post(f"/api/v1/guests/{gid}/admit", headers=_h(op))
        assert r.status_code == 403

        log = _login(client, "logistics")
        r = client.post(f"/api/v1/guests/{gid}/admit", headers=_h(log))
        assert r.json()["status"] == "admitted"
        r = client.post(f"/api/v1/guests/{gid}/checkout", headers=_h(log))
        assert r.json()["status"] == "checked_out"
        mine = client.get("/api/v1/guests", headers=_h(op)).json()
        assert any(x["id"] == gid for x in mine)


def test_announcements_post_gated_and_fan_out():
    with TestClient(app) as client:
        op = _login(client, "operator")
        hr = _login(client, "hr")

        r = client.post("/api/v1/announcements", headers=_h(op),
                        json={"title": "Not allowed", "body": "x"})
        assert r.status_code == 403

        r = client.post("/api/v1/announcements", headers=_h(hr),
                        json={"title": "Safety drill tomorrow", "body": "10:00 am"})
        assert r.status_code == 201
        feed = client.get("/api/v1/announcements", headers=_h(op)).json()
        assert any(n["title"] == "Safety drill tomorrow" for n in feed)

        notifs = client.get("/api/v1/notifications/my", headers=_h(op)).json()
        assert any("announcement" in (n["title"] or "").lower() for n in notifs)