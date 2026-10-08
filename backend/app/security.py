from __future__ import annotations

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


def _token(user: User, minutes: int) -> str:
    cfg = get_settings()
    payload = {
        "sub": str(user.id),
        "username": user.username,
        "role": user.role.code,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=minutes),
        "type": "access",
    }
    return jwt.encode(payload, cfg.jwt_secret, algorithm=cfg.jwt_algorithm)


def create_access_token(user: User) -> str:
    return _token(user, get_settings().token_expire_hours * 60)


def create_refresh_token(user: User) -> str:
    return _token(user, get_settings().refresh_expire_days * 24 * 60)


def decode_token(token: str) -> dict:
    cfg = get_settings()
    try:
        return jwt.decode(token, cfg.jwt_secret, algorithms=[cfg.jwt_algorithm])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    payload = decode_token(token)
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