from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Task, User
from ..security import get_current_user, requires
from ..services import audit

router = APIRouter(prefix="/tasks", tags=["tasks"])

VALID_STATUS = {"open", "in_progress", "done", "cancelled"}


def _serialize(t: Task) -> dict:
    return {
        "id": t.id,
        "type": t.type,
        "title": t.title,
        "description": t.description,
        "source_ref": t.source_ref,
        "priority": t.priority,
        "status": t.status,
        "due_date": t.due_date.isoformat() if t.due_date else None,
        "assigned_to": t.assigned_to,
        "department_id": t.department_id,
    }


@router.get("/my")
def my_tasks(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.scalars(
        select(Task)
        .where(Task.assigned_to == user.id)
        .order_by(Task.status, Task.due_date.is_(None), Task.due_date)
    ).all()
    return [_serialize(t) for t in rows]


@router.get("")
def all_tasks(
    department_id: int | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(requires("Dashboard", "view")),
):
    q = select(Task).order_by(Task.status, Task.due_date.is_(None), Task.due_date)
    if department_id:
        q = q.where(Task.department_id == department_id)
    return [_serialize(t) for t in db.scalars(q).all()]


class StatusIn(BaseModel):
    status: str


@router.post("/{task_id}/status")
def set_status(
    task_id: int,
    body: StatusIn,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if body.status not in VALID_STATUS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"status must be one of {VALID_STATUS}")
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")
    if task.assigned_to not in (None, user.id) and user.role.code not in ("ADMIN", "MGMT", "DH", "SUP"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your task")
    before = {"status": task.status}
    task.status = body.status
    db.commit()
    audit(db, actor=user, action="status_change", entity_type="task", entity_ref=str(task.id),
          before=before, after={"status": task.status},
          ip=request.client.host if request.client else None)
    return _serialize(task)