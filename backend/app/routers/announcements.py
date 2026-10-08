"""Company announcements — a broadcast feed visible to every employee.

Any authenticated user can read. Posting requires the `Notifications:create`
grant (MGMT + HR per seed.py — note this predates role-gating the UI); each
post also fans out an in-app notification so the unread badge works.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import CompanyNotice, User
from ..security import get_current_user, requires
from ..services import audit, notify

router = APIRouter(prefix="/announcements", tags=["announcements"])


@router.get("")
def list_notices(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    rows = db.scalars(select(CompanyNotice).order_by(CompanyNotice.created_at.desc()).limit(50)).all()
    return [
        {
            "id": n.id,
            "title": n.title,
            "body": n.body,
            "created_at": n.created_at.isoformat(),
        }
        for n in rows
    ]


class NoticeIn(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    body: str = ""


@router.post("", status_code=status.HTTP_201_CREATED)
def post_notice(
    body: NoticeIn,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(requires("Notifications", "create")),
):
    n = CompanyNotice(title=body.title, body=body.body, posted_by=user.id)
    db.add(n)
    db.commit()
    db.refresh(n)
    for u in db.query(User).filter(User.active.is_(True)).all():
        notify(db, recipient_id=u.id, title="Company announcement",
               body=body.title, entity_type="notice", entity_ref=str(n.id))
    audit(db, actor=user, action="post", entity_type="notice", entity_ref=str(n.id),
          after={"title": body.title}, ip=request.client.host if request.client else None)
    return {"id": n.id, "title": n.title, "body": n.body, "created_at": n.created_at.isoformat()}