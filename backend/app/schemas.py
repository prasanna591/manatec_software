from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class DepartmentIn(BaseModel):
    code: str
    name: str
    head_employee_id: int | None = None


class DepartmentUpdateIn(BaseModel):
    code: str | None = None
    name: str | None = None
    head_employee_id: int | None = None
    active: bool | None = None


class DepartmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    name: str
    active: bool


class EmployeeIn(BaseModel):
    code: str
    name: str
    department_id: int | None = None
    manager_id: int | None = None
    phone: str | None = None
    email: str | None = None


class EmployeeUpdateIn(BaseModel):
    code: str | None = None
    name: str | None = None
    department_id: int | None = None
    manager_id: int | None = None
    phone: str | None = None
    email: str | None = None
    active: bool | None = None


class EmployeeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    name: str
    department_id: int | None
    active: bool


class UserCreateIn(BaseModel):
    username: str
    password: str
    employee_id: int | None = None
    role_code: str


class UserUpdateIn(BaseModel):
    username: str | None = None
    password: str | None = None
    employee_id: int | None = None
    role_code: str | None = None
    active: bool | None = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    employee_id: int | None
    role_id: int
    active: bool


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    type: str
    title: str
    description: str | None
    source_ref: str | None
    priority: str
    status: str
    due_date: str | None = None


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    body: str | None
    priority: str
    entity_type: str | None
    entity_ref: str | None
    read_at: str | None = None
    created_at: str | None = None