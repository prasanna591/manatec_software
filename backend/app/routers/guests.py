"""Guest visits — register a visitor, security clears the visit, checkout on exit.

Registering is open to every employee. Admitting (security ok) is limited to
Logistics / security-type roles plus HR & management so the gate queue works.
"""
from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Employee, GuestVisit, User
from ..security import get_current_user
from ..services import audit

router = APIRouter(prefix="/guests", tags=["guests"])

SECURITY_ROLES = {"ADMIN", "MGMT", "DH", "HR", "LOG"}


def _employee(db: Session, user: User) -> Employee | None:
    return db.get(Employee, user.employee_id) if user.employee_id else None


def _visitor_no(db: Session) -> str:
    stamp = date.today().strftime("%y%m")
    count = db.scalar(select(func.count(GuestVisit.id))) or 0
    return f"GV{stamp}-{count + 1:04d}"


def _serialize(g: GuestVisit) -> dict:
    return {
        "id": g.id,
        "visit_no": g.visit_no,
        "visitor_name": g.visitor_name,
        "phone": g.phone,
        "purpose": g.purpose,
        "host_name": g.host_name,
        "department_name": g.department_name,
        "vehicle_no": g.vehicle_no,
        "check_in": g.check_in.isoformat(),
        "check_out": g.check_out.isoformat() if g.check_out else None,
        "status": g.status,
        "status_label": {"pending": "Pending security", "admitted": "Inside premises",
                         "checked_out": "Checked out", "cancelled": "Cancelled"}.get(g.status, g.status),
        "security_approved_at": g.security_approved_at.isoformat() if g.security_approved_at else None,
        "created_by": g.created_by,
    }


def _is_security(user: User) -> bool:
    return user.role.code in SECURITY_ROLES


class RegisterIn(BaseModel):
    visitor_name: str = Field(..., min_length=2, max_length=128)
    phone: str = ""
    purpose: str = ""
    host_name: str = ""
    department_name: str = ""
    vehicle_no: str = ""


@router.get("")
def list_guests(
    status_filter: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    emp = _employee(db, user)
    q = select(GuestVisit)
    if status_filter:
        q = q.where(GuestVisit.status == status_filter)
    if not _is_security(user):
        q = q.where(or_(
            GuestVisit.created_by == user.id,
            GuestVisit.host_name == (emp.name if emp else ""),
        ))
    rows = db.scalars(q.order_by(GuestVisit.created_at.desc()).limit(100)).all()
    return [_serialize(g) for g in rows]


@router.post("")
def register_visit(
    body: RegisterIn,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    g = GuestVisit(
        visit_no=_visitor_no(db),
        visitor_name=body.visitor_name.strip(),
        phone=body.phone.strip(),
        purpose=body.purpose.strip(),
        host_name=body.host_name.strip(),
        department_name=body.department_name.strip(),
        vehicle_no=body.vehicle_no.strip(),
        check_in=datetime.now(timezone.utc),
        status="pending",
        created_by=user.id,
    )
    db.add(g)
    db.commit()
    db.refresh(g)
    audit(db, actor=user, action="register", entity_type="guest", entity_ref=g.visit_no,
          after={"visitor": g.visitor_name}, ip=request.client.host if request.client else None)
    return _serialize(g)


@router.post("/{visit_id}/admit")
def admit_visit(
    visit_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not _is_security(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only security / logistics may admit visitors")
    g = db.get(GuestVisit, visit_id)
    if not g:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Visit not found")
    if g.status in ("admitted", "checked_out", "cancelled"):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Visit already {g.status}")
    g.status = "admitted"
    g.security_approved_by = user.id
    g.security_approved_at = datetime.now(timezone.utc)
    db.commit()
    audit(db, actor=user, action="admit", entity_type="guest", entity_ref=g.visit_no,
          ip=request.client.host if request.client else None)
    return _serialize(g)


@router.post("/{visit_id}/checkout")
def checkout_visit(
    visit_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    g = db.get(GuestVisit, visit_id)
    if not g:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Visit not found")
    if g.status != "admitted":
        raise HTTPException(status.HTTP_409_CONFLICT, "Visit is not admitted")
    g.check_out = datetime.now(timezone.utc)
    g.status = "checked_out"
    db.commit()
    audit(db, actor=user, action="checkout", entity_type="guest", entity_ref=g.visit_no,
          ip=request.client.host if request.client else None)
    return _serialize(g)


@router.post("/{visit_id}/cancel")
def cancel_visit(
    visit_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    g = db.get(GuestVisit, visit_id)
    if not g:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Visit not found")
    if g.created_by != user.id and not _is_security(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your visit")
    if g.status not in ("pending",):
        raise HTTPException(status.HTTP_409_CONFLICT, "Only pending visits can be cancelled")
    g.status = "cancelled"
    db.commit()
    audit(db, actor=user, action="cancel", entity_type="guest", entity_ref=g.visit_no,
          ip=request.client.host if request.client else None)
    return _serialize(g)