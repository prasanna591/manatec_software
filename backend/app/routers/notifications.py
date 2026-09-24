from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Notification, User
from ..security import get_current_user

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/my")
def my_notifications(
    unread_only: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = select(Notification).where(Notification.recipient_id == user.id)
    if unread_only:
        q = q.where(Notification.read_at.is_(None))
    rows = db.scalars(q.order_by(Notification.created_at.desc()).limit(100)).all()
    return [
        {
            "id": n.id,
            "title": n.title,
            "body": n.body,
            "priority": n.priority,
            "entity_type": n.entity_type,
            "entity_ref": n.entity_ref,
            "read": n.read_at is not None,
            "created_at": n.created_at.isoformat(),
        }
        for n in rows
    ]


@router.get("/unread-count")
def unread_count(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    count = db.scalar(
        select(func.count(Notification.id)).where(
            Notification.recipient_id == user.id, Notification.read_at.is_(None)
        )
    )
    return {"unread": count or 0}


@router.post("/{notification_id}/read")
def mark_read(
    notification_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from ..models import utcnow

    n = db.get(Notification, notification_id)
    if not n or n.recipient_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notification not found")
    n.read_at = utcnow()
    db.commit()
    return {"ok": True}