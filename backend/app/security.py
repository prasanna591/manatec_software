from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .errors import ApiError
from .models import Permission, User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def hash_password(raw: str) -> str:
    return bcrypt.hashpw(raw.encode(), bcrypt.gensalt()).decode()


def verify_password(raw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(raw.encode(), hashed.encode())
    except ValueError:
        return False


def _token(user: User, minutes: int, token_type: str, jti: str | None = None) -> str:
    cfg = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "username": user.username,
        "role": user.role.code,
        "iat": now,
        "exp": now + timedelta(minutes=minutes),
        "type": token_type,
        "jti": jti or uuid.uuid4().hex,
    }
    return jwt.encode(payload, cfg.jwt_secret, algorithm=cfg.jwt_algorithm)


def new_jti() -> str:
    return uuid.uuid4().hex


def create_access_token(user: User) -> str:
    """Short-lived bearer token (AGENT.md §3: 15-30 min)."""
    return _token(user, get_settings().access_token_minutes, "access")


def create_refresh_token(user: User, jti: str) -> str:
    """Long-lived refresh token bound to a ``RefreshSession`` row by ``jti``."""
    return _token(user, get_settings().refresh_expire_days * 24 * 60, "refresh", jti)


def hash_token(token: str) -> str:
    """SHA-256 hex digest of a token — what we persist, never the token itself."""
    return hashlib.sha256(token.encode()).hexdigest()


def decode_token(token: str, expected_type: str | None = None) -> dict:
    cfg = get_settings()
    try:
        payload = jwt.decode(token, cfg.jwt_secret, algorithms=[cfg.jwt_algorithm])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    if expected_type and payload.get("type") != expected_type:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong token type")
    return payload


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    # Only access tokens authenticate requests; a refresh token presented as a
    # bearer must not act as an access token.
    payload = decode_token(token, expected_type="access")
    user = db.get(User, int(payload["sub"]))
    if not user or not user.active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User inactive or missing")
    return user


def requires(module: str, action: str):
    """RBAC dependency factory. Usage: Depends(requires("Inventory", "view"))."""

    def _check(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> User:
        if user.role.code == "ADMIN":
            return user
        allowed = db.scalar(
            select(Permission.id).where(
                Permission.role_id == user.role_id,
                Permission.module == module,
                Permission.action == action,
            )
        )
        if not allowed:
            raise ApiError(
                status.HTTP_403_FORBIDDEN,
                f"Role {user.role.code} lacks {action} on {module}",
                code="DENIED",
                required_permission=f"{module}:{action}",
            )
        return user

    return _check


def requires_any(*pairs: tuple[str, str]):
    """Accept a user holding *any one* of several (module, action) grants.

    Needed where two different roles legitimately perform the same action, and
    forcing a single permission would exclude one of them. Closing a visit is
    the case in point: the host department records the outcome (`edit`) while
    management can also close one on their behalf (`approve`), and the FRS matrix
    deliberately does not grant both to the same roles.

    Usage: Depends(requires_any(("Visits", "edit"), ("Visits", "approve"))).
    """

    def _check(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> User:
        if user.role.code == "ADMIN":
            return user
        for module, action in pairs:
            allowed = db.scalar(
                select(Permission.id).where(
                    Permission.role_id == user.role_id,
                    Permission.module == module,
                    Permission.action == action,
                )
            )
            if allowed:
                return user
        wanted = " or ".join(f"{action} on {module}" for module, action in pairs)
        raise ApiError(
            status.HTTP_403_FORBIDDEN,
            f"Role {user.role.code} lacks {wanted}",
            code="DENIED",
            required_permission=" or ".join(f"{module}:{action}" for module, action in pairs),
        )

    return _check