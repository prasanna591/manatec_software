from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

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