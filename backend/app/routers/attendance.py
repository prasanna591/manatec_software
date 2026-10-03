"""Attendance — self check-in/check-out plus department roster view (FRS 15.4).

Self-service endpoints (my day/history/check-in/check-out) are open to every
authenticated user. The department roster is limited to the dept head and to
HR/management roles.
"""
from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Attendance, Department, Employee, User
from ..security import get_current_user
from ..services import audit

router = APIRouter(prefix="/attendance", tags=["attendance"])

MGMT_ROLES = {"ADMIN", "MGMT", "DH", "HR"}


def _employee(db: Session, user: User) -> Employee:
    emp = db.get(Employee, user.employee_id) if user.employee_id else None
    if emp is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No employee profile linked to your account")
    return emp


def _utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _serialize(a: Attendance) -> dict:
    minutes = None
    if a.check_in and a.check_out:
        minutes = round((_utc(a.check_out) - _utc(a.check_in)).total_seconds() / 60)
    return {
        "id": a.id,
        "work_date": a.work_date.isoformat(),
        "check_in": a.check_in.isoformat() if a.check_in else None,
        "check_out": a.check_out.isoformat() if a.check_out else None,
        "minutes": minutes,
        "status": "checked_out" if a.check_out else ("present" if a.check_in else "absent"),
    }


def _can_view_roster(db: Session, user: User) -> bool:
    if user.role.code in MGMT_ROLES:
        return True
    if not user.employee_id:
        return False
    emp = db.get(Employee, user.employee_id)
    if not emp or not emp.department_id:
        return False
    dept = db.get(Department, emp.department_id)
    return bool(dept and dept.head_employee_id == user.employee_id)


@router.get("/me")
def my_attendance(
    from_date: date | None = None,
    to_date: date | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    emp = _employee(db, user)
    q = select(Attendance).where(Attendance.employee_id == emp.id)
    if from_date:
        q = q.where(Attendance.work_date >= from_date)
    if to_date:
        q = q.where(Attendance.work_date <= to_date)
    rows = db.scalars(q.order_by(Attendance.work_date.desc()).limit(120)).all()
    return [_serialize(a) for a in rows]


@router.get("/today")
def today(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Today's attendance card for the current user."""
    emp = _employee(db, user)
    today = date.today()
    row = db.scalar(select(Attendance).where(
        Attendance.employee_id == emp.id, Attendance.work_date == today))
    return _serialize(row) if row else {"id": None, "work_date": today.isoformat(),
                                        "check_in": None, "check_out": None,
                                        "minutes": None, "status": "absent"}


@router.get("/roster")
def roster(
    for_date: date | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Department attendance for the caller's department (dept head/HR only)."""
    emp = _employee(db, user)
    if not _can_view_roster(db, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the department head / HR can view the roster")
    for_date = for_date or date.today()
    staff = db.scalars(select(Employee).where(Employee.department_id == emp.department_id)).all()
    by_id = {a.employee_id: a for a in db.scalars(
        select(Attendance).where(Attendance.work_date == for_date)).all()}
    return {
        "dept": db.get(Department, emp.department_id).name if emp.department_id else None,
        "date": for_date.isoformat(),
        "rows": [
            {
                "employee_id": s.id,
                "code": s.code,
                "name": s.name,
                "attendance": _serialize(by_id[s.id]) if s.id in by_id else None,
            }
            for s in staff
        ],
    }


@router.post("/check-in")
def check_in(
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    emp = _employee(db, user)
    today = date.today()
    row = db.scalar(select(Attendance).where(
        Attendance.employee_id == emp.id, Attendance.work_date == today))
    now = datetime.now(timezone.utc)
    if row and row.check_in:
        raise HTTPException(status.HTTP_409_CONFLICT, "Already checked in today")
    if row is None:
        row = Attendance(employee_id=emp.id, work_date=today, source="mobile")
        db.add(row)
    row.check_in = now
    db.commit()
    audit(db, actor=user, action="check_in", entity_type="attendance",
          entity_ref=f"{emp.code}:{today.isoformat()}",
          ip=request.client.host if request.client else None)
    return _serialize(row)


@router.post("/check-out")
def check_out(
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    emp = _employee(db, user)
    today = date.today()
    row = db.scalar(select(Attendance).where(
        Attendance.employee_id == emp.id, Attendance.work_date == today))
    if not row or not row.check_in:
        raise HTTPException(status.HTTP_409_CONFLICT, "Check in first")
    if row.check_out:
        raise HTTPException(status.HTTP_409_CONFLICT, "Already checked out today")
    row.check_out = datetime.now(timezone.utc)
    db.commit()
    audit(db, actor=user, action="check_out", entity_type="attendance",
          entity_ref=f"{emp.code}:{today.isoformat()}",
          ip=request.client.host if request.client else None)
    return _serialize(row)