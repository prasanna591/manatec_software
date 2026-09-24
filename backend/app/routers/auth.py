from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Employee, Permission, User
from ..security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user,
    verify_password,
)
from ..services import audit

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
    audit(db, actor=user, action="login", entity_type="user", entity_ref=user.username,
          ip=request.client.host if request.client else None)
    return {
        "access_token": create_access_token(user),
        "refresh_token": create_refresh_token(user),
        "token_type": "bearer",
        "user": _profile(db, user),
    }


@router.post("/refresh")
def refresh(body: dict, db: Session = Depends(get_db)):
    token = body.get("refresh_token", "")
    payload = decode_token(token)
    user = db.get(User, int(payload["sub"]))
    if not user or not user.active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User inactive or missing")
    return {"access_token": create_access_token(user), "token_type": "bearer"}


@router.get("/me")
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _profile(db, user)