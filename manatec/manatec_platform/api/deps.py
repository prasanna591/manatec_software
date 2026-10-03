"""FastAPI dependencies — current user + role guards."""

from __future__ import annotations

from fastapi import Cookie, Depends, Header, HTTPException, status as http_status
from sqlalchemy.orm import Session

from ..db import get_session
from ..models import User
from ..security import decode_token

COOKIE = "manatec_token"


def _token_from(authorization: str | None, cookie: str | None) -> str | None:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization.split(" ", 1)[1]
    return cookie or None


def get_current_user(
    authorization: str | None = Header(default=None),
    manatec_token: str | None = Cookie(default=None, alias=COOKIE),
    db: Session = Depends(get_session),
) -> User:
    token = _token_from(authorization, manatec_token)
    if not token:
        raise HTTPException(http_status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    try:
        payload = decode_token(token)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(http_status.HTTP_401_UNAUTHORIZED, "Invalid or expired token") from exc
    user = db.get(User, int(payload.get("sub", 0)))
    if not user or not user.is_active:
        raise HTTPException(http_status.HTTP_401_UNAUTHORIZED, "User not found")
    return user


def require_roles(*roles: str):
    def guard(user: User = Depends(get_current_user)) -> User:
        if user.role != "admin" and user.role not in roles:
            raise HTTPException(http_status.HTTP_403_FORBIDDEN, "Insufficient role")
        return user

    return guard


def admin_only(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(http_status.HTTP_403_FORBIDDEN, "Admin role required")
    return user