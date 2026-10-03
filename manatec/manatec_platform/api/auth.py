"""Auth endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import get_session
from ..models import User
from ..security import authenticate, create_token, hash_password
from .deps import admin_only, get_current_user, require_roles

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginIn(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: int
    username: str
    full_name: str
    role: str


class CreateUserIn(BaseModel):
    username: str
    password: str
    full_name: str = ""
    role: str = "viewer"


def user_out(u: User) -> UserOut:
    return UserOut(id=u.id, username=u.username, full_name=u.full_name, role=u.role)


@router.post("/login")
def login(body: LoginIn, db: Session = Depends(get_session)):
    user = authenticate(db, body.username, body.password)
    if not user:
        raise HTTPException(401, "Invalid username or password")
    return {"token": create_token(user), "user": user_out(user).model_dump()}


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return user_out(user).model_dump()


@router.get("/users")
def list_users(user: User = Depends(require_roles("admin")), db: Session = Depends(get_session)):
    return [
        user_out(u).model_dump()
        for u in db.query(User).filter(User.is_active.is_(True)).all()
    ]


@router.post("/users")
def create_user(
    body: CreateUserIn,
    user: User = Depends(admin_only),
    db: Session = Depends(get_session),
):
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(409, "Username exists")
    if body.role not in ("admin", "stores", "purchase", "production", "sales", "viewer"):
        raise HTTPException(400, "Unknown role")
    u = User(
        username=body.username,
        full_name=body.full_name,
        role=body.role,
        password_hash=hash_password(body.password),
    )
    db.add(u)
    db.commit()
    return user_out(u).model_dump()