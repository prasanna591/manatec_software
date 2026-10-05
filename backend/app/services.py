"""Shared helpers: audit trail (FRS 20.2) and notification creation (FRS 17.2)."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from .models import AuditLog, Notification, User


def as_utc(dt: datetime | None) -> datetime | None:
    """Tag a stored timestamp as UTC when it comes back naive.

    SQLite has no timezone type, so a `DateTime` column round-trips without
    `tzinfo`. Comparing that against an aware `datetime.now(timezone.utc)`
    raises, so every elapsed-time calculation goes through this. Same convention
    as `routers/attendance.py::_utc`.
    """
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def audit(
    db: Session,
    *,
    actor: User | None,
    action: str,
    entity_type: str,
    entity_ref: str | None = None,
    before: dict | None = None,
    after: dict | None = None,
    ip: str | None = None,
) -> AuditLog:
    row = AuditLog(
        actor_id=actor.id if actor else None,
        actor_username=actor.username if actor else None,
        action=action,
        entity_type=entity_type,
        entity_ref=entity_ref,
        before=before,
        after=after,
        ip=ip,
    )
    db.add(row)
    db.commit()
    return row


def notify(
    db: Session,
    *,
    recipient_id: int,
    title: str,
    body: str | None = None,
    priority: str = "normal",
    entity_type: str | None = None,
    entity_ref: str | None = None,
    channel: str = "inapp",
) -> Notification:
    row = Notification(
        recipient_id=recipient_id,
        title=title,
        body=body,
        priority=priority,
        entity_type=entity_type,
        entity_ref=entity_ref,
        channel=channel,
    )
    db.add(row)
    db.commit()
    return row