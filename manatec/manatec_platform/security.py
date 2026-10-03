"""Authentication & authorization — JWT + role guards."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt
from passlib.hash import pbkdf2_sha256
from sqlalchemy.orm import Session

from .config import JWT_ALGO, JWT_SECRET, JWT_TTL_HOURS
from .models import User


def hash_password(plain: str) -> str:
    return pbkdf2_sha256.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return pbkdf2_sha256.verify(plain, hashed)
    except ValueError:
        return False


def create_token(user: User) -> str:
    payload = {
        "sub": str(user.id),
        "username": user.username,
        "role": user.role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_TTL_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def decode_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])


def authenticate(db: Session, username: str, password: str) -> User | None:
    user = db.query(User).filter(User.username == username, User.is_active.is_(True)).first()
    if user and verify_password(password, user.password_hash):
        return user
    return None