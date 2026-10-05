from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..csv_upload import _cell, guess_password, rows_from
from ..db import get_db
from ..models import Department, Employee, Permission, Role, Task, User
from ..schemas import (
    DepartmentIn,
    DepartmentOut,
    DepartmentUpdateIn,
    EmployeeIn,
    EmployeeOut,
    EmployeeUpdateIn,
    UserCreateIn,
    UserOut,
    UserUpdateIn,
)
from ..security import hash_password, requires
from ..services import audit, notify

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/departments", response_model=list[DepartmentOut])
def list_departments(db: Session = Depends(get_db), _: User = Depends(requires("Employees", "view"))):
    return db.scalars(select(Department).order_by(Department.code)).all()


@router.put("/departments/{department_id}", response_model=DepartmentOut)
def update_department(
    department_id: int,
    body: DepartmentUpdateIn,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(requires("Employees", "edit")),
):
    dept = db.get(Department, department_id)
    if not dept:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Department not found")
    if body.code and body.code != dept.code and db.scalar(
        select(Department).where(Department.code == body.code, Department.id != department_id)
    ):
        raise HTTPException(status.HTTP_409_CONFLICT, "Department code exists")
    before = {k: getattr(dept, k) for k in ("code", "name", "active")}
    changes = body.model_dump(exclude_unset=True)
    for k, v in changes.items():
        setattr(dept, k, v)
    db.commit()
    db.refresh(dept)
    after = {k: getattr(dept, k) for k in ("code", "name", "active")}
    if changes:
        audit(db, actor=actor, action="update", entity_type="department", entity_ref=dept.code,
              before=before if before != after else None, after=after if before != after else None,
              ip=request.client.host if request.client else None)
    return dept


@router.delete("/departments/{department_id}")
def delete_department(
    department_id: int,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(requires("Admin", "delete")),
):
    dept = db.get(Department, department_id)
    if not dept:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Department not found")
    if db.scalar(select(Employee.id).where(Employee.department_id == department_id).limit(1)) or \
       db.scalar(select(Task.id).where(Task.department_id == department_id).limit(1)):
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "Department still has employees or tasks; reassign before deleting")
    code = dept.code
    db.delete(dept)
    db.commit()
    audit(db, actor=actor, action="delete", entity_type="department", entity_ref=code,
          ip=request.client.host if request.client else None)
    return {"ok": True, "id": department_id}


@router.post("/departments", response_model=DepartmentOut, status_code=201)
def create_department(
    body: DepartmentIn,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(requires("Employees", "create")),
):
    if db.scalar(select(Department).where(Department.code == body.code)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Department code exists")
    dept = Department(**body.model_dump())
    db.add(dept)
    db.commit()
    db.refresh(dept)
    audit(db, actor=actor, action="create", entity_type="department", entity_ref=dept.code,
          after=body.model_dump(), ip=request.client.host if request.client else None)
    return dept


@router.get("/employees", response_model=list[EmployeeOut])
def list_employees(db: Session = Depends(get_db), _: User = Depends(requires("Employees", "view"))):
    return db.scalars(select(Employee).order_by(Employee.code)).all()


@router.put("/employees/{employee_id}", response_model=EmployeeOut)
def update_employee(
    employee_id: int,
    body: EmployeeUpdateIn,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(requires("Employees", "edit")),
):
    emp = db.get(Employee, employee_id)
    if not emp:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Employee not found")
    if body.code and body.code != emp.code and db.scalar(
        select(Employee).where(Employee.code == body.code, Employee.id != employee_id)
    ):
        raise HTTPException(status.HTTP_409_CONFLICT, "Employee code exists")
    before = {k: getattr(emp, k) for k in ("code", "name", "department_id", "active")}
    changes = body.model_dump(exclude_unset=True)
    for k, v in changes.items():
        setattr(emp, k, v)
    db.commit()
    db.refresh(emp)
    after = {k: getattr(emp, k) for k in ("code", "name", "department_id", "active")}
    if changes and before != after:
        audit(db, actor=actor, action="update", entity_type="employee", entity_ref=emp.code,
              before=before, after=after,
              ip=request.client.host if request.client else None)
    return emp


@router.delete("/employees/{employee_id}")
def delete_employee(
    employee_id: int,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(requires("Admin", "delete")),
):
    emp = db.get(Employee, employee_id)
    if not emp:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Employee not found")
    if db.scalar(select(User.id).where(User.employee_id == employee_id).limit(1)) or \
       db.scalar(select(Employee.id).where(Employee.manager_id == employee_id).limit(1)) or \
       db.scalar(select(Department.id).where(Department.head_employee_id == employee_id).limit(1)):
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "Employee is still referenced by a user, report, or department")
    code = emp.code
    db.delete(emp)
    db.commit()
    audit(db, actor=actor, action="delete", entity_type="employee", entity_ref=code,
          ip=request.client.host if request.client else None)
    return {"ok": True, "id": employee_id}


@router.post("/employees", response_model=EmployeeOut, status_code=201)
def create_employee(
    body: EmployeeIn,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(requires("Employees", "create")),
):
    if db.scalar(select(Employee).where(Employee.code == body.code)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Employee code exists")
    emp = Employee(**body.model_dump())
    db.add(emp)
    db.commit()
    db.refresh(emp)
    audit(db, actor=actor, action="create", entity_type="employee", entity_ref=emp.code,
          after=body.model_dump(), ip=request.client.host if request.client else None)
    return emp


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(
    body: UserCreateIn,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(requires("Employees", "create")),
):
    if db.scalar(select(User).where(User.username == body.username)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Username exists")
    role = db.scalar(select(Role).where(Role.code == body.role_code))
    if not role:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown role")
    user = User(
        username=body.username,
        password_hash=hash_password(body.password),
        employee_id=body.employee_id,
        role_id=role.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    audit(db, actor=actor, action="create", entity_type="user", entity_ref=user.username,
          after={"role": role.code, "employee_id": body.employee_id},
          ip=request.client.host if request.client else None)
    notify(db, recipient_id=user.id, title="Welcome to Manatec Digital",
           body="Your account has been created. Please change your password.")
    return user


@router.put("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    body: UserUpdateIn,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(requires("Employees", "edit")),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if body.username and body.username != user.username and db.scalar(
        select(User).where(User.username == body.username, User.id != user_id)
    ):
        raise HTTPException(status.HTTP_409_CONFLICT, "Username exists")
    if body.role_code:
        role = db.scalar(select(Role).where(Role.code == body.role_code))
        if not role:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown role")
    before = {"username": user.username, "role_id": user.role_id, "employee_id": user.employee_id,
              "active": user.active}
    changes = body.model_dump(exclude_unset=True)
    password_changed = bool(body.password)
    changes.pop("password", None)
    if password_changed:
        user.password_hash = hash_password(body.password)
    if body.role_code:
        user.role_id = db.scalar(select(Role).where(Role.code == body.role_code)).id
        changes.pop("role_code", None)
    for k, v in changes.items():
        setattr(user, k, v)
    db.commit()
    db.refresh(user)
    after = {"username": user.username, "role_id": user.role_id, "employee_id": user.employee_id,
             "active": user.active}
    if before != after or password_changed:
        if password_changed:
            after["password"] = "changed"
        audit(db, actor=actor, action="update", entity_type="user", entity_ref=user.username,
              before=before, after=after,
              ip=request.client.host if request.client else None)
    return user


@router.delete("/users/{user_id}")
def deactivate_user(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(requires("Admin", "delete")),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if actor.id == user_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot deactivate your own account")
    before = {"active": user.active}
    user.active = False
    db.commit()
    audit(db, actor=actor, action="deactivate", entity_type="user", entity_ref=user.username,
          before=before, after={"active": False},
          ip=request.client.host if request.client else None)
    return {"ok": True, "id": user_id, "active": False}


@router.get("/users")
def list_users(db: Session = Depends(get_db), _: User = Depends(requires("Employees", "view"))):
    rows = db.scalars(select(User).order_by(User.username)).all()
    return [
        {
            "id": u.id,
            "username": u.username,
            "employee_id": u.employee_id,
            "role_code": u.role.code,
            "active": u.active,
        }
        for u in rows
    ]


@router.get("/roles")
def list_roles(db: Session = Depends(get_db), _: User = Depends(requires("Employees", "view"))):
    roles = db.scalars(select(Role).order_by(Role.code)).all()
    return [{"id": r.id, "code": r.code, "name": r.name} for r in roles]


@router.get("/roles/{code}/permissions")
def role_permissions(code: str, db: Session = Depends(get_db), _: User = Depends(requires("Employees", "view"))):
    role = db.scalar(select(Role).where(Role.code == code))
    if not role:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Role not found")
    perms = db.scalars(select(Permission).where(Permission.role_id == role.id)).all()
    return {"role": role.code, "permissions": sorted({f"{p.module}:{p.action}" for p in perms})}


@router.get("/employees/import-template")
def employee_import_template(_: User = Depends(requires("Employees", "view"))) -> Response:
    """Blank CSV the HR team fills in, so the upload screen can offer a download."""
    header = (
        "employee_code,name,department_code,manager_code,phone,email,"
        "username,role_code,password\n"
    )
    sample = (
        "EMP1001,Ramesh Patil,PROD,,+91-90000-00001,ramesh.patil@manatec.net,"
        "ramesh.patil,OPER,\n"
        "EMP1002,Sneha Kulkarni,QUAL,EMP1001,+91-90000-00002,sneha.k@manatec.net,"
        "sneha.kulkarni,QINSP,\n"
    )
    return Response(
        content=header + sample,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="employee-import-template.csv"'},
    )


@router.post("/employees/import")
def import_employees(
    request: Request,
    upload: UploadFile = File(...),
    db: Session = Depends(get_db),
    actor: User = Depends(requires("Employees", "create")),
) -> dict:
    """Bulk-onboard employees from a spreadsheet, optionally with mobile logins.

    One row per employee. When `username` and `role_code` are supplied the row
    also provisions a login, which is what lets the person open the mobile app
    with exactly the department access their role carries in FRS 5.2.

    Columns (header matching is case/space/underscore insensitive):
      employee_code, name, department_code, manager_code, phone, email,
      username, role_code, password

    `password` may be left blank, in which case a readable initial password is
    generated and returned once so it can be handed over. Rows are independent:
    a bad row is reported and skipped, it does not abort the upload.
    """
    rows = rows_from(upload)
    if not rows:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "No rows found in the file")
    if len(rows) > 2000:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            "At most 2000 rows per upload")

    departments = {d.code.upper(): d for d in db.scalars(select(Department)).all()}
    roles = {r.code.upper(): r for r in db.scalars(select(Role)).all()}
    by_code = {e.code.upper(): e for e in db.scalars(select(Employee)).all()}

    created_emps = 0
    updated_emps = 0
    created_users = 0
    results: list[dict] = []

    for index, row in enumerate(rows, start=2):  # row 1 is the header
        emp_code = _cell(row, "employee_code", "code", "emp_code")
        name = _cell(row, "name", "employee_name", "full_name")
        problems: list[str] = []
        if not emp_code:
            problems.append("employee_code is required")
        if not name:
            problems.append("name is required")
        if problems:
            results.append({"row": index, "employee_code": emp_code, "status": "failed",
                            "detail": "; ".join(problems)})
            continue

        dept_code = _cell(row, "department_code", "department").upper()
        department = departments.get(dept_code) if dept_code else None
        if dept_code and not department:
            results.append({"row": index, "employee_code": emp_code, "status": "failed",
                            "detail": f"unknown department_code '{dept_code}'"})
            continue

        mgr_code = _cell(row, "manager_code", "manager").upper()
        manager = by_code.get(mgr_code) if mgr_code else None
        if mgr_code and not manager:
            results.append({"row": index, "employee_code": emp_code, "status": "failed",
                            "detail": f"unknown manager_code '{mgr_code}'"})
            continue

        existing = by_code.get(emp_code.upper())
        if existing:
            existing.name = name
            if department:
                existing.department_id = department.id
            if manager:
                existing.manager_id = manager.id
            existing.phone = _cell(row, "phone", "mobile") or None
            existing.email = _cell(row, "email") or None
            existing.active = True
            emp = existing
            updated_emps += 1
            emp_status = "updated"
        else:
            emp = Employee(
                code=emp_code,
                name=name,
                department_id=department.id if department else None,
                manager_id=manager.id if manager else None,
                phone=_cell(row, "phone", "mobile") or None,
                email=_cell(row, "email") or None,
            )
            db.add(emp)
            db.flush()
            by_code[emp.code.upper()] = emp
            created_emps += 1
            emp_status = "created"

        # ── optional mobile login for this person ────────────────────────
        username = _cell(row, "username", "login", "user_name")
        role_code = _cell(row, "role_code", "role").upper()
        if username or role_code:
            if not username or not role_code:
                results.append({"row": index, "employee_code": emp_code, "status": emp_status,
                                "detail": "employee saved, but username and role_code are both "
                                          "needed to create the login"})
                continue
            role = roles.get(role_code)
            if not role:
                results.append({"row": index, "employee_code": emp_code, "status": emp_status,
                                "detail": f"employee saved, but unknown role_code '{role_code}'"})
                continue
            if db.scalar(select(User).where(User.username == username)):
                results.append({"row": index, "employee_code": emp_code, "status": emp_status,
                                "detail": f"employee saved, but username '{username}' already exists"})
                continue
            password = _cell(row, "password") or guess_password(username)
            user = User(
                username=username,
                password_hash=hash_password(password),
                employee_id=emp.id,
                role_id=role.id,
            )
            db.add(user)
            db.flush()
            created_users += 1
            notify(db, recipient_id=user.id, title="Welcome to Manatec Digital",
                   body="Your account has been created. Please change your password.")
            results.append({
                "row": index, "employee_code": emp_code, "status": emp_status,
                "detail": f"login created with role {role.code}",
                "username": username, "password": password, "role_code": role.code,
            })
            continue

        results.append({"row": index, "employee_code": emp_code, "status": emp_status,
                        "detail": "no login requested"})

    audit(db, actor=actor, action="import", entity_type="employee", entity_ref=upload.filename,
          after={"rows": len(rows), "employees_created": created_emps,
                 "employees_updated": updated_emps, "accounts_created": created_users},
          ip=request.client.host if request.client else None)
    db.commit()

    failed = sum(1 for r in results if r["status"] == "failed")
    return {
        "ok": True,
        "rows": len(rows),
        "employees_created": created_emps,
        "employees_updated": updated_emps,
        "accounts_created": created_users,
        "failed": failed,
        # Credentials are returned exactly once -- they are never stored in clear.
        "accounts": [r for r in results if r.get("username")],
        "results": results,
    }