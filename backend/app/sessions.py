"""Refresh-token session lifecycle (AGENT.md §3).

Backs refresh-token **rotation**, **revocation** (single device and
"logout all devices"), and the **device/session list**. Kept out of
``security.py`` because it needs the DB and request context.

Security model:
- Login mints a refresh token with a unique ``jti`` and stores only its
  SHA-256 hash in a ``RefreshSession`` row.
- Every refresh rotates: the presented row is retired (``revoked_at``,
  ``replaced_by_jti``) and a brand-new token/session is issued.
- Presenting a token whose row was already retired is treated as theft:
  the whole family for that user is revoked and the caller gets a 401.
"""
from __future__ import annotations

from datetime import timedelta

from fastapi import HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .models import RefreshSession, User, utcnow
from .security import create_refresh_token, decode_token, hash_token, new_jti
from .services import as_utc

_UNAUTH = HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired refresh token")


def _request_meta(request: Request | None) -> tuple[str | None, str | None, str | None]:
    if request is None:
        return None, None, None
    ua = request.headers.get("user-agent")
    ip = request.client.host if request.client else None
    device = request.headers.get("X-Device-Name")
    return (device[:128] if device else None), (ua[:256] if ua else None), ip


def _expiry():
    return utcnow() + timedelta(days=get_settings().refresh_expire_days)


def issue_session(
    db: Session,
    user: User,
    request: Request | None = None,
    device: str | None = None,
) -> tuple[RefreshSession, str]:
    """Create a session row and return it with the signed refresh token."""
    jti = new_jti()
    token = create_refresh_token(user, jti)
    req_device, ua, ip = _request_meta(request)
    row = RefreshSession(
        user_id=user.id,
        jti=jti,
        token_hash=hash_token(token),
        device=device or req_device,
        user_agent=ua,
        ip=ip,
        expires_at=_expiry(),
    )
    db.add(row)
    db.commit()
    return row, token


def rotate_session(db: Session, raw_token: str, request: Request | None = None) -> tuple[User, RefreshSession, str]:
    """Validate + rotate a refresh token; return (user, new_row, new_token)."""
    if not raw_token:
        raise _UNAUTH
    payload = decode_token(raw_token, expected_type="refresh")
    jti = payload.get("jti")
    try:
        user_id = int(payload.get("sub"))
    except (TypeError, ValueError):
        raise _UNAUTH
    if not jti:
        raise _UNAUTH

    row = db.scalar(select(RefreshSession).where(RefreshSession.jti == jti))
    if row is None or row.user_id != user_id:
        raise _UNAUTH

    # Reuse detection: a retired token means the family is compromised.
    if row.revoked_at is not None:
        revoke_all(db, row.user_id, reason="reuse_detected")
        raise _UNAUTH

    if row.token_hash != hash_token(raw_token):
        revoke_all(db, row.user_id, reason="reuse_detected")
        raise _UNAUTH

    if as_utc(row.expires_at) <= utcnow():
        _retire(db, row, reason="expired")
        db.commit()
        raise _UNAUTH

    user = db.get(User, user_id)
    if not user or not user.active:
        revoke_all(db, user_id, reason="user_inactive")
        raise _UNAUTH

    new_jti_value = new_jti()
    new_token = create_refresh_token(user, new_jti_value)
    _, ua, ip = _request_meta(request)
    new_row = RefreshSession(
        user_id=user.id,
        jti=new_jti_value,
        token_hash=hash_token(new_token),
        device=row.device,
        user_agent=ua or row.user_agent,
        ip=ip or row.ip,
        expires_at=_expiry(),
    )
    row.last_used_at = utcnow()
    _retire(db, row, reason="rotated", replaced_by=new_jti_value)
    db.add(new_row)
    db.commit()
    return user, new_row, new_token


def _retire(db: Session, row: RefreshSession, *, reason: str, replaced_by: str | None = None) -> None:
    row.revoked_at = utcnow()
    row.revoked_reason = reason
    row.replaced_by_jti = replaced_by


def revoke_all(db: Session, user_id: int, reason: str = "logout_all") -> int:
    """Revoke every active session for a user. Returns how many were retired."""
    rows = db.scalars(
        select(RefreshSession).where(
            RefreshSession.user_id == user_id,
            RefreshSession.revoked_at.is_(None),
        )
    ).all()
    now = utcnow()
    for row in rows:
        row.revoked_at = now
        row.revoked_reason = reason
    if rows:
        db.commit()
    return len(rows)


def revoke_by_token(db: Session, raw_token: str) -> bool:
    """Revoke the session behind a refresh token (used by logout)."""
    if not raw_token:
        return False
    try:
        payload = decode_token(raw_token, expected_type="refresh")
    except HTTPException:
        return False
    jti = payload.get("jti")
    if not jti:
        return False
    row = db.scalar(select(RefreshSession).where(RefreshSession.jti == jti))
    if row is None or row.revoked_at is not None:
        return False
    _retire(db, row, reason="logout")
    db.commit()
    return True


def revoke_session(db: Session, user_id: int, session_id: int) -> bool:
    """Revoke one session by id, only if it belongs to ``user_id``."""
    row = db.get(RefreshSession, session_id)
    if row is None or row.user_id != user_id:
        return False
    if row.revoked_at is None:
        _retire(db, row, reason="revoked")
        db.commit()
    return True


def list_sessions(db: Session, user_id: int) -> list[RefreshSession]:
    return list(
        db.scalars(
            select(RefreshSession)
            .where(RefreshSession.user_id == user_id)
            .order_by(RefreshSession.created_at.desc())
        ).all()
    )
