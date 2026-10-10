from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Employee, Permission, User
from ..security import (
    create_access_token,
    decode_token,
    get_current_user,
    verify_password,
)
from ..services import audit, as_utc
from ..sessions import (
    issue_session,
    list_sessions,
    revoke_all,
    revoke_by_token,
    revoke_session,
    rotate_session,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _profile(db: Session, user: User) -> dict:
    perms = db.scalars(select(Permission).where(Permission.role_id == user.role_id)).all()
    emp = db.get(Employee, user.employee_id) if user.employee_id else None
    return {
        "id": user.id,
        "username": user.username,
        "role": user.role.code,
        "employee": {"id": emp.id, "name": emp.name, "code": emp.code} if emp else None,
        "department_id": emp.department_id if emp else None,
        "permissions": sorted({f"{p.module}:{p.action}" for p in perms}),
    }


@router.post("/login")
def login(
    request: Request,
    form: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    user = db.scalar(select(User).where(User.username == form.username))
    if not user or not user.active or not verify_password(form.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    from ..models import utcnow

    user.last_login_at = utcnow()
    db.commit()
    session, refresh_token = issue_session(db, user, request)
    audit(db, actor=user, action="login", entity_type="user", entity_ref=user.username,
          after={"session_id": session.id}, ip=request.client.host if request.client else None)
    return {
        "access_token": create_access_token(user),
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": _profile(db, user),
    }


@router.post("/refresh")
def refresh(request: Request, body: dict, db: Session = Depends(get_db)):
    """Rotate the refresh token: the old one is retired and a new pair issued.

    Presenting a token that was already rotated is treated as reuse and revokes
    every session for the user (see ``app/sessions.py``).
    """
    user, _session, refresh_token = rotate_session(db, body.get("refresh_token", ""), request)
    return {
        "access_token": create_access_token(user),
        "refresh_token": refresh_token,
        "token_type": "bearer",
    }


@router.get("/me")
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _profile(db, user)


@router.get("/sessions")
def sessions(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Device/session list for the signed-in user (AGENT.md §3)."""
    rows = list_sessions(db, user.id)
    return {
        "items": [
            {
                "id": r.id,
                "device": r.device,
                "user_agent": r.user_agent,
                "ip": r.ip,
                "created_at": r.created_at,
                "last_used_at": r.last_used_at,
                "expires_at": r.expires_at,
                "active": r.revoked_at is None and as_utc(r.expires_at) > _now(),
                "revoked_at": r.revoked_at,
                "revoked_reason": r.revoked_reason,
            }
            for r in rows
        ]
    }


@router.delete("/sessions/{session_id}")
def delete_session(
    session_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not revoke_session(db, user.id, session_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    audit(db, actor=user, action="revoke_session", entity_type="user", entity_ref=user.username,
          after={"session_id": session_id})
    return {"ok": True}


@router.post("/logout")
def logout(request: Request, body: dict | None = None, db: Session = Depends(get_db)):
    """Revoke the session behind ``refresh_token``; bodyless call revokes all."""
    token = (body or {}).get("refresh_token", "")
    if token:
        revoke_by_token(db, token)
    else:
        payload = decode_token(request.headers.get("Authorization", "").replace("Bearer ", ""))
        revoke_all(db, int(payload["sub"]), reason="logout")
    return {"ok": True}


@router.post("/logout-all")
def logout_all(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Revoke every active session for the user, on every device (AGENT.md §3)."""
    count = revoke_all(db, user.id, reason="logout_all")
    audit(db, actor=user, action="logout_all", entity_type="user", entity_ref=user.username,
          after={"revoked": count})
    return {"ok": True, "revoked": count}


def _now():
    from ..models import utcnow

    return utcnow()
