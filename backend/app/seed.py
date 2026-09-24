"""Idempotent seed: roles, FRS 5.2 permission matrix, departments, bootstrap admin.

Run automatically on startup and via `python -m app.seed`.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import SessionLocal, engine
from .models import Department, Employee, Permission, Role, User
from .security import hash_password
from .services import notify

ACTION = {"R": "view", "C": "create", "E": "edit", "A": "approve", "X": "export", "D": "delete"}

DEPARTMENTS = [
    ("MGMT", "Management"),
    ("COMM", "Commercial"),
    ("PLAN", "Planning"),
    ("PROD", "Production"),
    ("STOR", "Stores / Inventory"),
    ("PURC", "Purchase / Procurement"),
    ("LOGI", "Logistics / Dispatch"),
    ("QUAL", "Quality"),
    ("ENGI", "Engineering / R&D"),
    ("HRAD", "HR / Admin"),
]

ROLES = {
    "ADMIN": "Platform Administrator",
    "MGMT": "Management",
    "DH": "Department Head / Manager",
    "SUP": "Supervisor",
    "PLNR": "Planner",
    "OPER": "Production Operator",
    "STORE": "Stores Operator",
    "STK": "Stock Counter",
    "PUR": "Purchase Officer",
    "LOG": "Logistics / Dispatcher",
    "QINSP": "Quality Inspector",
    "ENG": "Engineer / Design",
    "COMM": "Commercial / Sales Officer",
    "HR": "HR / Admin Officer",
    "ACC": "Accounts",
    "ROBOT": "Robot system account",
}

# FRS 5.2 default permission matrix, verbatim. Columns: MGMT DH SUP PLNR OPER STORE PUR LOG QINSP ENG COMM HR ACC
_MATRIX: dict[str, list[str]] = {
    "Home":         ["RC", "RC", "RC", "RC", "RC", "RC", "RC", "RC", "RC", "RC", "RC", "RC", "R"],
    "Dashboard":    ["RX", "RX", "R",  "R",  "R",  "R",  "R",  "R",  "R",  "R",  "R",  "R",  "R"],
    "Orders":       ["RX", "R",  "R",  "RCE","R",  "R",  "R",  "R",  "R",  "R",  "RCE","R",  "R"],
    "Orders.Intel": ["R",  "R",  "-",  "R",  "-",  "-",  "R",  "-",  "-",  "-",  "R",  "-",  "-"],
    "Planning":     ["R",  "RCEA","RCE","RCE","-",  "R",  "R",  "R",  "-",  "-",  "-",  "-",  "-"],
    "Production":   ["R",  "RX", "RCE","RC", "CE", "R",  "R",  "R",  "R",  "RCE","R",  "-",  "-"],
    "Machines":     ["R",  "R",  "RCE","R",  "CE", "-",  "-",  "-",  "-",  "-",  "-",  "-",  "-"],
    "Inventory":    ["RX", "RX", "R",  "R",  "R",  "RCE","RCE","R",  "R",  "R",  "R",  "-",  "R"],
    "MaterialReq":  ["R",  "RA", "RCEA","RC", "C",  "CEA","R",  "-",  "-",  "RC", "RC", "-",  "-"],
    "Purchase":     ["RX", "RA", "R",  "R",  "-",  "R",  "RCEA","-",  "-",  "-",  "R",  "-",  "-"],
    "PurchaseReq":  ["R",  "R",  "R",  "RC", "-",  "RC", "RCA","-",  "-",  "RC", "RC", "-",  "-"],
    "Logistics":    ["R",  "RA", "RCE","R",  "-",  "R",  "-",  "RCEA","-",  "-",  "-",  "-",  "-"],
    "Quality":      ["R",  "RX", "R",  "R",  "R",  "R",  "R",  "R",  "RCEA","R",  "-",  "-",  "-"],
    "Engineering":  ["R",  "R",  "R",  "R",  "-",  "-",  "-",  "-",  "-",  "RCEA","-",  "-",  "-"],
    "Quotations":   ["R",  "RA", "-",  "R",  "-",  "-",  "-",  "-",  "-",  "R",  "RCE","-",  "-"],
    "Customers":    ["R",  "R",  "-",  "R",  "-",  "-",  "-",  "-",  "-",  "-",  "RCE","-",  "R"],
    "Suppliers":    ["R",  "R",  "-",  "R",  "-",  "-",  "RCE","-",  "-",  "-",  "-",  "-",  "-"],
    "Employees":    ["R",  "R",  "R",  "R",  "-",  "-",  "-",  "-",  "-",  "-",  "-",  "RCEA","R"],
    "Attendance":   ["RX", "RX", "RCE","-",  "RCE","RCE","RCE","RCE","RCE","RCE","RCE","RCEA","R"],
    "Approvals":    ["RA"] * 13,
    "Notifications":["RX"] * 13,
    "Reports":      ["RX"] * 13,
    "Admin":        ["-",  "-",  "-",  "-",  "-",  "-",  "-",  "-",  "-",  "-",  "-",  "CEAD","-"],
    "Analytics":    ["RX", "RX", "R",  "R",  "-",  "-",  "R",  "-",  "-",  "-",  "R",  "-",  "-"],
    "Robots":       ["R",  "R",  "R",  "RCE","-",  "-",  "-",  "-",  "-",  "-",  "-",  "-",  "-"],
}
# role columns in the same order as _MATRIX rows
_COLS = ["MGMT", "DH", "SUP", "PLNR", "OPER", "STORE", "PUR", "LOG", "QINSP", "ENG", "COMM", "HR", "ACC"]
# STK and ROBOT are not in the FRS 5.2 table; give them the documented minimum.
_EXTRA = {"STK": {"Inventory": "RCE", "MaterialReq": "-", "Attendance": "RCE"}, "ROBOT": {}}

# Demo accounts for the UI-first phase (dev only). (dept, role, username, name)
DEMO_USERS = [
    ("MGMT", "MGMT", "manager", "Meena Manager"),
    ("COMM", "COMM", "commercial", "Karthik Commercial"),
    ("PLAN", "PLNR", "planner", "Priya Planner"),
    ("PROD", "OPER", "operator", "Arun Operator"),
    ("PROD", "SUP", "prod_sup", "Suresh Supervisor"),
    ("STOR", "STORE", "stores", "Divya Stores"),
    ("PURC", "PUR", "purchase", "Ravi Purchase"),
    ("LOGI", "LOG", "logistics", "Lakshmi Logistics"),
    ("QUAL", "QINSP", "quality", "Ganesh Quality"),
    ("ENGI", "ENG", "engineer", "Nithya Engineer"),
    ("HRAD", "HR", "hr", "Anjali HR"),
]

DEMO_TASKS = [
    ("work_order", "Production Order PO00003 - Op 2", "Complete milling operation", "operator", "high"),
    ("work_order", "Production Order PO00005 - Op 1", "Start cutting operation", "operator", "urgent"),
    ("material_request", "Issue material for PO00003", "Item ITM0002 x 20 required", "stores", "high"),
    ("inspection", "Inspect lot SO00002", "Pre-dispatch inspection", "quality", "normal"),
    ("planning", "Set week plan w/c", "Freeze weekly plan and release work orders", "planner", "high"),
    ("purchase", "Expedite PO for ITM0007", "Shortage expected in 3 days", "purchase", "urgent"),
    ("dispatch", "Schedule dispatch SO00001", "Ready for dispatch", "logistics", "normal"),
    ("approval", "Approve leave request", "Pending HR approval", "hr", "normal"),
    ("engineering", "Drawing revision for PRD002", "ECR raised by production", "engineer", "normal"),
    ("generic", "Review delayed orders", "7 orders past due date", "manager", "high"),
]


def seed_demo(db: Session) -> None:
    """Dev demo accounts + tasks so the dashboard/mobile have something to render."""
    from datetime import datetime, timedelta, timezone

    from .models import Task

    dept_by_code = {d.code: d for d in db.scalars(select(Department)).all()}
    role_by_code = {r.code: r for r in db.scalars(select(Role)).all()}
    users: dict[str, User] = {}
    for dept_code, role_code, username, name in DEMO_USERS:
        user = db.scalar(select(User).where(User.username == username))
        if not user:
            emp = Employee(code=f"EMP{username.upper()[:4]}", name=name,
                           department_id=dept_by_code[dept_code].id)
            db.add(emp)
            db.flush()
            user = User(username=username, password_hash=hash_password("demo123"),
                        employee_id=emp.id, role_id=role_by_code[role_code].id)
            db.add(user)
            db.flush()
            notify(db, recipient_id=user.id, title="Welcome to Manatec Digital",
                   body=f"Demo account for {role_code}", priority="normal")
        users[username] = user
    db.commit()

    if not db.scalar(select(Task.id)):
        now = datetime.now(timezone.utc)
        for i, (ttype, title, desc, username, priority) in enumerate(DEMO_TASKS):
            owner = users[username]
            emp = db.get(Employee, owner.employee_id)
            db.add(Task(
                type=ttype, title=title, description=desc, priority=priority,
                assigned_to=owner.id, department_id=emp.department_id if emp else None,
                due_date=now + timedelta(days=(i % 5) - 1), created_by=users["manager"].id,
            ))
        db.commit()


def seed(db: Session) -> None:
    dept_by_code: dict[str, Department] = {}
    for code, name in DEPARTMENTS:
        dept = db.scalar(select(Department).where(Department.code == code))
        if not dept:
            dept = Department(code=code, name=name)
            db.add(dept)
            db.flush()
        dept_by_code[code] = dept

    role_by_code: dict[str, Role] = {}
    for code, name in ROLES.items():
        role = db.scalar(select(Role).where(Role.code == code))
        if not role:
            role = Role(code=code, name=name)
            db.add(role)
            db.flush()
        role_by_code[code] = role

    def add_perms(role: Role, module: str, letters: str) -> None:
        for letter in letters:
            action = ACTION.get(letter)
            if not action:
                continue
            exists = db.scalar(
                select(Permission.id).where(
                    Permission.role_id == role.id,
                    Permission.module == module,
                    Permission.action == action,
                )
            )
            if not exists:
                db.add(Permission(role_id=role.id, module=module, action=action))

    for module, cols in _MATRIX.items():
        for role_code, letters in zip(_COLS, cols):
            add_perms(role_by_code[role_code], module, letters)
    for role_code, modules in _EXTRA.items():
        for module, letters in modules.items():
            add_perms(role_by_code[role_code], module, letters)
    # ADMIN implies every permission (RBAC bypass also enforced in security.requires)
    for module in _MATRIX:
        add_perms(role_by_code["ADMIN"], module, "RCEAXD")

    if not db.scalar(select(User).where(User.username == "admin")):
        emp = Employee(code="ADM001", name="Platform Administrator", department_id=dept_by_code["MGMT"].id)
        db.add(emp)
        db.flush()
        admin = User(
            username="admin",
            password_hash=hash_password("admin123"),
            employee_id=emp.id,
            role_id=role_by_code["ADMIN"].id,
        )
        db.add(admin)
        db.flush()
        notify(db, recipient_id=admin.id, title="Welcome to Manatec Digital",
               body="Platform administrator account created.")
    db.commit()


def init_db() -> None:
    from . import models  # noqa: F401  (register models on Base.metadata)
    from .config import get_settings
    from .db import Base
    from .erp import sync_all

    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed(db)
        if get_settings().seed_demo:
            seed_demo(db)
        sync_all(db)   # FRS 18.5 — populate ERP cache at startup


if __name__ == "__main__":
    init_db()
    print("seeded")