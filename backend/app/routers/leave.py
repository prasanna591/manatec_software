"""Leave — self-service apply + lightweight 2-step approval (dept head → HR).

Any authenticated employee can apply, view their own requests and balances.
Approvals are role-driven: step 1 by the applicant's department head (or
management), step 2 by HR/management. No workflow engine needed for now.
"""
from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Department, Employee, LeaveBalance, LeaveRequest, Role, Task, User
from ..security import get_current_user
from ..services import audit, notify

router = APIRouter(prefix="/leave", tags=["leave"])

LEAVE_TYPES = ("casual", "sick", "earned", "other")
# year is fixed to the leave *year* when a request is created
DEFAULT_BALANCES = {"casual": 12, "sick": 10, "earned": 15, "other": 5}

APPROVER_ROLES = {"ADMIN", "MGMT", "DH"}
HR_ROLES = {"ADMIN", "MGMT", "DH", "HR"}

STATUS_LABEL = {
    "pending_dept": "Pending dept head",
    "pending_hr": "Pending HR",
    "approved": "Approved",
    "rejected": "Rejected",
    "cancelled": "Cancelled",
}


def _employee(db: Session, user: User) -> Employee:
    emp = db.get(Employee, user.employee_id) if user.employee_id else None
    if emp is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No employee profile linked to your account")
    return emp


def _balances(db: Session, emp: Employee, year: int) -> list[dict]:
    rows = db.scalars(select(LeaveBalance).where(
        LeaveBalance.employee_id == emp.id, LeaveBalance.year == year)).all()
    by_type = {r.leave_type: r for r in rows}
    out = []
    for lt in LEAVE_TYPES:
        row = by_type.get(lt)
        if row is None:
            row = LeaveBalance(employee_id=emp.id, leave_type=lt, year=year,
                               allocated=DEFAULT_BALANCES.get(lt, 0))
            db.add(row)
            db.flush()
            by_type[lt] = row
        out.append({"leave_type": lt, "allocated": row.allocated, "used": row.used,
                    "available": round(row.allocated - row.used, 1)})
    return out


def _serialize(db: Session, lr: LeaveRequest) -> dict:
    emp = db.get(Employee, lr.employee_id)
    return {
        "id": lr.id,
        "employee_id": lr.employee_id,
        "employee_name": emp.code + " · " + emp.name if emp else None,
        "department_id": emp.department_id if emp else None,
        "leave_type": lr.leave_type,
        "from_date": lr.from_date.isoformat(),
        "to_date": lr.to_date.isoformat(),
        "days": lr.days,
        "reason": lr.reason,
        "status": lr.status,
        "status_label": STATUS_LABEL.get(lr.status, lr.status),
        "decided_note": lr.decided_note,
        "created_at": lr.created_at.isoformat(),
    }


def _dept_head_user(db: Session, lr: LeaveRequest) -> User | None:
    emp = db.get(Employee, lr.employee_id)
    if not emp or not emp.department_id:
        return None
    dept = db.get(Department, emp.department_id)
    if not dept or not dept.head_employee_id:
        return None
    head_emp = db.get(Employee, dept.head_employee_id)
    return head_emp.user if head_emp and head_emp.user else None


def _ensure_balance(db: Session, emp: Employee, ltype: str, days: float) -> None:
    year = date.today().year
    rows = {r.leave_type: r for r in db.scalars(select(LeaveBalance).where(
        LeaveBalance.employee_id == emp.id, LeaveBalance.year == year)).all()}
    row = rows.get(ltype)
    if row is None:
        row = LeaveBalance(employee_id=emp.id, leave_type=ltype, year=year,
                           allocated=DEFAULT_BALANCES.get(ltype, 0))
        db.add(row)
        db.flush()
    if row.allocated - row.used < days:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Not enough {ltype} leave — {max(row.allocated - row.used, 0)} day(s) available",
        )


class ApplyIn(BaseModel):
    leave_type: str = Field(..., description="casual | sick | earned | other")
    from_date: date
    to_date: date
    reason: str = ""


@router.get("/me")
def my_leave(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    emp = _employee(db, user)
    rows = db.scalars(select(LeaveRequest).where(LeaveRequest.employee_id == emp.id)
                      .order_by(LeaveRequest.created_at.desc()).limit(100)).all()
    return [_serialize(db, r) for r in rows]


@router.get("/balances")
def balances(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    emp = _employee(db, user)
    year = date.today().year
    from ..models import utcnow

    bal = _balances(db, emp, year)
    db.commit()
    return {"year": year, "items": bal, "as_of": utcnow().isoformat()}


@router.post("/apply")
def apply_leave(
    body: ApplyIn,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    emp = _employee(db, user)
    if body.leave_type not in LEAVE_TYPES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"leave_type must be one of {LEAVE_TYPES}")
    if body.to_date < body.from_date:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "to_date must be on/after from_date")
    days = float((body.to_date - body.from_date).days + 1)
    _ensure_balance(db, emp, body.leave_type, days)

    lr = LeaveRequest(employee_id=emp.id, leave_type=body.leave_type,
                      from_date=body.from_date, to_date=body.to_date,
                      days=days, reason=body.reason, created_by=user.id)
    db.add(lr)
    db.commit()
    db.refresh(lr)
    audit(db, actor=user, action="apply", entity_type="leave", entity_ref=str(lr.id),
          after={"leave_type": lr.leave_type, "days": lr.days, "status": lr.status},
          ip=request.client.host if request.client else None)

    # step 1 — notify the applicant's department head (surfaces as an in-app
    # notification + approval task so it shows on their My Tasks screen)
    head = _dept_head_user(db, lr)
    if head:
        notify(db, recipient_id=head.id, title="Leave request pending",
               body=f"{emp.name} applied {lr.days} day(s) {lr.leave_type} leave",
               entity_type="leave", entity_ref=str(lr.id))
        task = db.scalar(select(Task).where(Task.source_ref == str(lr.id), Task.type == "approval"))
        if task is None:
            db.add(Task(type="approval", title="Approve leave request",
                        description=f"{emp.name} · {lr.leave_type} · {lr.days} day(s) "
                                    f"({lr.from_date} → {lr.to_date})",
                        source_ref=str(lr.id), assigned_to=head.id,
                        department_id=emp.department_id, priority="normal",
                        created_by=user.id))
            db.commit()
    return _serialize(db, lr)


@router.get("/approvals")
def my_approvals(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Pending leave requests visible to me as dept head or HR."""
    emp = _employee(db, user)
    rows = db.scalars(select(LeaveRequest).where(
        LeaveRequest.status.in_(("pending_dept", "pending_hr")))).all()
    out = []
    for lr in rows:
        applicant = db.get(Employee, lr.employee_id)
        is_their_head = bool(applicant and applicant.department_id
                             and db.get(Department, applicant.department_id)
                             and db.get(Department, applicant.department_id).head_employee_id == emp.id)
        if lr.status == "pending_dept" and not (is_their_head or user.role.code in APPROVER_ROLES):
            continue
        if lr.status == "pending_hr" and user.role.code not in HR_ROLES:
            continue
        out.append(_serialize(db, lr))
    return out


class DecideIn(BaseModel):
    note: str = ""


@router.post("/{leave_id}/approve")
def approve(
    leave_id: int,
    body: DecideIn,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    lr = db.get(LeaveRequest, leave_id)
    if not lr:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Leave request not found")
    if not lr.is_pending:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Already {lr.status}")
    emp = _employee(db, user)
    applicant = db.get(Employee, lr.employee_id)
    dept = db.get(Department, applicant.department_id) if applicant and applicant.department_id else None
    is_head = bool(dept and dept.head_employee_id == emp.id)

    if lr.status == "pending_dept":
        if not (is_head or user.role.code in APPROVER_ROLES):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Step 1 must be approved by the department head")
        lr.dept_approved_by, lr.dept_approved_at = user.id, datetime.now(timezone.utc)
        lr.status = "pending_hr"
        if body.note:
            lr.decided_note = body.note
        db.commit()
        audit(db, actor=user, action="approve_dept", entity_type="leave", entity_ref=str(lr.id),
              ip=request.client.host if request.client else None)
        hr = db.scalar(select(User).where(User.role_id.in_(
            select(Role.id).where(Role.code == "HR"), )))
        if hr:
            notify(db, recipient_id=hr.id, title="Leave pending HR approval",
                   body=f"{applicant.name if applicant else ''} {lr.leave_type} · {lr.days} day(s)",
                   entity_type="leave", entity_ref=str(lr.id))
        if applicant and applicant.user:
            notify(db, recipient_id=applicant.user.id, title="Leave approved by dept head",
                   body="Your leave moved to HR approval", entity_type="leave", entity_ref=str(lr.id))
        return _serialize(db, lr)

    # pending_hr step
    if user.role.code not in HR_ROLES:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Step 2 must be approved by HR / management")
    lr.hr_approved_by, lr.hr_approved_at = user.id, datetime.now(timezone.utc)
    lr.status = "approved"
    if body.note:
        lr.decided_note = body.note
    # update balance consumed
    year = lr.from_date.year
    bal = db.scalar(select(LeaveBalance).where(
        LeaveBalance.employee_id == lr.employee_id, LeaveBalance.leave_type == lr.leave_type,
        LeaveBalance.year == year))
    if bal:
        bal.used = round(bal.used + lr.days, 1)
    # close the dept-head approval task
    task = db.scalar(select(Task).where(Task.source_ref == str(lr.id), Task.type == "approval"))
    if task:
        task.status = "done"
    db.commit()
    audit(db, actor=user, action="approve_hr", entity_type="leave", entity_ref=str(lr.id),
          after={"status": "approved", "days": lr.days}, ip=request.client.host if request.client else None)
    if applicant and applicant.user:
        notify(db, recipient_id=applicant.user.id, title="Leave approved",
               body=f"{lr.days} day(s) {lr.leave_type} leave approved ✅",
               entity_type="leave", entity_ref=str(lr.id))
    return _serialize(db, lr)


@router.post("/{leave_id}/reject")
def reject(
    leave_id: int,
    body: DecideIn,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    lr = db.get(LeaveRequest, leave_id)
    if not lr:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Leave request not found")
    if not lr.is_pending:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Already {lr.status}")
    emp = _employee(db, user)
    applicant = db.get(Employee, lr.employee_id)
    dept = db.get(Department, applicant.department_id) if applicant and applicant.department_id else None
    is_head = bool(dept and dept.head_employee_id == emp.id)
    allowed = is_head or user.role.code in HR_ROLES
    if not allowed:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not an approver for this request")
    lr.status = "rejected"
    lr.decided_note = body.note
    task = db.scalar(select(Task).where(Task.source_ref == str(lr.id), Task.type == "approval"))
    if task:
        task.status = "done"
    db.commit()
    audit(db, actor=user, action="reject", entity_type="leave", entity_ref=str(lr.id),
          after={"status": "rejected"}, ip=request.client.host if request.client else None)
    if applicant and applicant.user:
        notify(db, recipient_id=applicant.user.id, title="Leave request rejected",
               body=body.note or f"Your {lr.leave_type} leave was not approved",
               entity_type="leave", entity_ref=str(lr.id))
    return _serialize(db, lr)