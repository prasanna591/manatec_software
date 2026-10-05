"""Company-wide visit register — the common service every department uses.

A visit is a workflow, not a gate log:

    created → confirmed → on_the_way → arrived → meeting → follow_up → completed
                                        └──────────────→ cancelled (any pre-arrival)

Any employee may raise a visit (module `Visits`, action `create`). The host sees
it as a notification and confirms it; the host or security moves it through
check-in and meeting; closing it records an outcome and, when a follow-up is
flagged, raises a task with a due date.

Coordinates (buyer tracking) are a separate permission — `BuyerTracking:view` —
so knowing *that* a customer is on site does not entitle a production operator to
reading where they are.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Department, Employee, Task, User, Visit, VisitNote
from ..security import get_current_user, requires, requires_any
from ..services import audit, notify

router = APIRouter(prefix="/visits", tags=["visits"])

# ── workflow ───────────────────────────────────────────────────────────────
# Every transition the API accepts. Anything not listed here is rejected, so a
# half-finished visit can never skip the "arrived" step and jump to "completed".
VISIT_FLOW: dict[str, tuple[str, ...]] = {
    "created": ("confirmed", "cancelled"),
    "confirmed": ("on_the_way", "arrived", "cancelled"),
    "on_the_way": ("arrived", "cancelled"),
    "arrived": ("meeting", "cancelled"),
    "meeting": ("follow_up", "completed"),
    "follow_up": ("completed",),
    "completed": (),
    "cancelled": (),
}

# A visit is closed through /close (which records the outcome), never through
# the plain status transition, so these are the only states that can close.
CLOSEABLE_FROM = ("meeting", "follow_up")

VISIT_TYPES = ("supplier", "customer", "buyer", "vendor", "guest", "official", "other")
FOOD_OPTIONS = ("none", "refreshments", "lunch", "dinner", "full_meals", "veg_meals")

# Types where the visitor's live position is useful to the host while en route.
TRACKABLE_TYPES = ("buyer", "customer", "vendor", "official")

STATUS_LABEL = {
    "created": "Invited",
    "confirmed": "Confirmed",
    "on_the_way": "On the way",
    "arrived": "Arrived at gate",
    "meeting": "In meeting",
    "follow_up": "Follow-up pending",
    "completed": "Completed",
    "cancelled": "Cancelled",
}

OPEN_STATES = ("created", "confirmed", "on_the_way", "arrived", "meeting", "follow_up")


def _visit_no(db: Session, prefix: str) -> str:
    stamp = date.today().strftime("%y%m")
    count = db.scalar(select(func.count(Visit.id))) or 0
    return f"{prefix}{stamp}-{count + 1:04d}"


def _type_prefix(visit_type: str) -> str:
    return {
        "supplier": "VS",
        "customer": "VC",
        "buyer": "VB",
        "vendor": "VV",
        "guest": "VG",
        "official": "VO",
        "other": "VX",
    }.get(visit_type, "VX")


def _host_names(db: Session, user_ids: set[int]) -> dict[int, str]:
    if not user_ids:
        return {}
    rows = db.execute(
        select(User.id, Employee.name)
        .join(Employee, User.employee_id == Employee.id)
        .where(User.id.in_(user_ids))
    ).all()
    return dict(rows)


def _serialize(
    db: Session,
    v: Visit,
    *,
    can_track: bool,
    can_view_all: bool,
    host_names: dict[int, str] | None = None,
) -> dict:
    if host_names is None:
        host_names = _host_names(db, {v.host_user_id} if v.host_user_id else set())
    dept = db.get(Department, v.department_id) if v.department_id else None
    # Coordinates are stripped for anyone without BuyerTracking:view. The
    # `tracking_enabled` flag stays visible so the host still knows to expect a
    # ping without being able to read one they are not entitled to.
    location = None
    if can_track and v.tracking_enabled:
        location = {
            "latitude": v.latitude,
            "longitude": v.longitude,
            "note": v.location_note_tracking,
            "eta_minutes": v.eta_minutes,
            "updated_at": v.location_updated_at.isoformat() if v.location_updated_at else None,
        }
    return {
        "id": v.id,
        "visit_no": v.visit_no,
        "visit_type": v.visit_type,
        "visitor_name": v.visitor_name,
        "company": v.company,
        "contact": v.contact,
        "purpose": v.purpose,
        "requirement": v.requirement,
        "host_name": host_names.get(v.host_user_id, "") if v.host_user_id else "",
        "department_name": dept.name if dept else "",
        "visit_date": v.visit_date.isoformat() if v.visit_date else None,
        "expected_time": v.expected_time,
        "food_arrangement": v.food_arrangement,
        "transport_required": v.transport_required,
        "vehicle_no": v.vehicle_no,
        "location_note": v.location_note,
        "attachments": v.attachments or [],
        "status": v.status,
        "status_label": STATUS_LABEL.get(v.status, v.status),
        "next_states": [s for s in VISIT_FLOW.get(v.status, ()) if s != "completed"],
        "can_close": v.status in CLOSEABLE_FROM,
        "tracking_enabled": v.tracking_enabled,
        "location": location,
        "outcome_requirement": v.outcome_requirement,
        "outcome_sample": v.outcome_sample,
        "outcome_purchase": v.outcome_purchase,
        "outcome_followup": v.outcome_followup,
        "next_action": v.next_action,
        "followup_due": v.followup_due.isoformat() if v.followup_due else None,
        "notes": v.notes,
        "created_at": v.created_at.isoformat(),
        "confirmed_at": v.confirmed_at.isoformat() if v.confirmed_at else None,
        "arrived_at": v.arrived_at.isoformat() if v.arrived_at else None,
        "meeting_at": v.meeting_at.isoformat() if v.meeting_at else None,
        "closed_at": v.closed_at.isoformat() if v.closed_at else None,
        "is_mine": False,  # filled by the caller that knows the current user
        "can_view_all": can_view_all,
    }


class VisitIn(BaseModel):
    visit_type: str = Field(..., pattern="^(supplier|customer|buyer|vendor|guest|official|other)$")
    visitor_name: str = Field(..., min_length=2, max_length=128)
    company: str = ""
    contact: str = ""
    purpose: str = ""
    requirement: str = ""
    host_user_id: int | None = None
    department_id: int | None = None
    visit_date: str | None = None
    expected_time: str = ""
    food_arrangement: str = Field(default="none", pattern="^(none|refreshments|lunch|dinner|full_meals|veg_meals)$")
    transport_required: bool = False
    vehicle_no: str = ""
    location_note: str = ""
    tracking_enabled: bool = False
    notes: str = ""


class StatusIn(BaseModel):
    status: str
    note: str = ""


class LocationIn(BaseModel):
    latitude: float | None = None
    longitude: float | None = None
    note: str = ""
    eta_minutes: int | None = Field(default=None, ge=0, le=600)


class CloseIn(BaseModel):
    outcome_requirement: bool = False
    outcome_sample: bool = False
    outcome_purchase: bool = False
    outcome_followup: bool = False
    next_action: str = ""
    followup_due: str | None = None
    assign_to: int | None = None
    notes: str = ""


class NoteIn(BaseModel):
    body: str = Field(..., min_length=1, max_length=4000)


def _parse_date(value: str | None, field: str) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"{field} must be YYYY-MM-DD")


def _can_view_all(user: User) -> bool:
    """Management / security / admin see the whole register, not just their own."""
    return user.role.code in {"ADMIN", "MGMT", "DH", "LOG", "HR"}


@router.get("")
def list_visits(
    status_filter: str | None = None,
    visit_type: str | None = None,
    scope: str = "open",
    db: Session = Depends(get_db),
    user: User = Depends(requires("Visits", "view")),
):
    q = select(Visit)
    if status_filter:
        q = q.where(Visit.status == status_filter)
    elif scope == "open":
        q = q.where(Visit.status.in_(OPEN_STATES))
    elif scope == "all":
        pass
    elif scope == "mine":
        q = q.where(or_(Visit.created_by == user.id, Visit.host_user_id == user.id))
    if visit_type:
        q = q.where(Visit.visit_type == visit_type)
    if not _can_view_all(user):
        # Scoped to what the employee raised or is hosting — the rest of the
        # factory's visitor book is not theirs to read.
        q = q.where(or_(Visit.created_by == user.id, Visit.host_user_id == user.id))

    rows = db.scalars(q.order_by(Visit.visit_date.is_(None), Visit.visit_date, Visit.id.desc()).limit(200)).all()
    can_track = _has_tracking_permission(db, user)
    host_names = _host_names(db, {r.host_user_id for r in rows if r.host_user_id})
    out = []
    for v in rows:
        item = _serialize(db, v, can_track=can_track, can_view_all=_can_view_all(user), host_names=host_names)
        item["is_mine"] = v.created_by == user.id or v.host_user_id == user.id
        out.append(item)
    return out


@router.get("/summary")
def visits_summary(db: Session = Depends(get_db), user: User = Depends(requires("Visits", "view"))):
    today = date.today()
    rows = db.scalars(select(Visit)).all()
    visible = [v for v in rows if _can_view_all(user) or v.created_by == user.id or v.host_user_id == user.id]
    return {
        "today": sum(1 for v in visible if v.visit_date == today),
        "open": sum(1 for v in visible if v.status in OPEN_STATES),
        "awaiting_confirmation": sum(1 for v in visible if v.status == "created"),
        "in_meeting": sum(1 for v in visible if v.status in ("arrived", "meeting")),
        "followups_due": sum(
            1 for v in visible if v.status == "follow_up" and v.followup_due and v.followup_due <= today
        ),
        "on_the_way": sum(1 for v in visible if v.status == "on_the_way"),
        "by_type": {
            t: sum(1 for v in visible if v.visit_type == t and v.status in OPEN_STATES) for t in VISIT_TYPES
        },
    }


@router.get("/buyers/tracking")
def buyer_tracking(db: Session = Depends(get_db), user: User = Depends(requires("BuyerTracking", "view"))):
    """Visitors en route to the plant, with last known position.

    Gated on `BuyerTracking:view` rather than `Visits:view` — location is the
    sensitive part, not the visit itself.
    """
    rows = db.scalars(
        select(Visit)
        .where(Visit.tracking_enabled.is_(True), Visit.status.in_(("created", "confirmed", "on_the_way")))
        .order_by(Visit.expected_time)
    ).all()
    host_names = _host_names(db, {r.host_user_id for r in rows if r.host_user_id})
    return [_serialize(db, v, can_track=True, can_view_all=True, host_names=host_names) for v in rows]


@router.get("/{visit_id}")
def visit_detail(visit_id: int, db: Session = Depends(get_db), user: User = Depends(requires("Visits", "view"))):
    v = db.get(Visit, visit_id)
    if not v:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Visit not found")
    if not _can_view_all(user) and v.created_by != user.id and v.host_user_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your visit")
    can_track = _has_tracking_permission(db, user)
    data = _serialize(db, v, can_track=can_track, can_view_all=_can_view_all(user))
    data["is_mine"] = v.created_by == user.id or v.host_user_id == user.id
    data["notes_log"] = [
        {
            "id": n.id,
            "body": n.body,
            "author": _host_names(db, {n.author_id}).get(n.author_id, "") if n.author_id else "",
            "created_at": n.created_at.isoformat(),
        }
        for n in db.scalars(
            select(VisitNote).where(VisitNote.visit_id == v.id).order_by(VisitNote.created_at.desc())
        ).all()
    ]
    return data


@router.post("", status_code=201)
def create_visit(
    body: VisitIn,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(requires("Visits", "create")),
):
    now = datetime.now(timezone.utc)
    host_id = body.host_user_id or user.id
    if host_id != user.id and db.get(User, host_id) is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Host user not found")

    v = Visit(
        visit_no=_visit_no(db, _type_prefix(body.visit_type)),
        visit_type=body.visit_type,
        visitor_name=body.visitor_name.strip(),
        company=body.company.strip(),
        contact=body.contact.strip(),
        purpose=body.purpose.strip(),
        requirement=body.requirement.strip(),
        host_user_id=host_id,
        department_id=body.department_id or (
            db.get(Employee, user.employee_id).department_id if user.employee_id else None
        ),
        visit_date=_parse_date(body.visit_date, "visit_date"),
        expected_time=body.expected_time.strip(),
        food_arrangement=body.food_arrangement,
        transport_required=body.transport_required,
        vehicle_no=body.vehicle_no.strip(),
        location_note=body.location_note.strip(),
        # Tracking is only meaningful for a visitor travelling to the plant.
        tracking_enabled=bool(body.tracking_enabled and body.visit_type in TRACKABLE_TYPES),
        status="created",
        notes=body.notes.strip(),
        created_by=user.id,
    )
    db.add(v)
    db.commit()
    db.refresh(v)

    audit(db, actor=user, action="create", entity_type="visit", entity_ref=v.visit_no,
          after={"visitor": v.visitor_name, "type": v.visit_type},
          ip=request.client.host if request.client else None)

    # Notify the host so the invitation lands on their phone, and give the
    # department head a task to confirm it — an unconfirmed visit is how a guest
    # reaches the gate with nobody expecting them.
    if host_id != user.id:
        notify(db, recipient_id=host_id,
               title=f"New {v.visit_type} visit · {v.visitor_name}",
               body=f"{v.purpose or 'No purpose recorded'}"
                    + (f" · {v.visit_date.isoformat()}" if v.visit_date else ""),
               priority="high" if v.visit_date == date.today() else "normal",
               entity_type="visit", entity_ref=v.visit_no)

    db.add(Task(
        type="approval",
        title=f"Confirm visit {v.visit_no} — {v.visitor_name}",
        description=f"{v.company or v.visitor_name} · {v.purpose}",
        source_ref=v.visit_no,
        assigned_to=host_id,
        department_id=v.department_id,
        priority="high" if v.visit_date == date.today() else "normal",
        status="open",
        due_date=None,
        created_by=user.id,
    ))
    db.commit()
    db.refresh(v)

    return _serialize(db, v, can_track=_has_tracking_permission(db, user), can_view_all=_can_view_all(user))


@router.post("/{visit_id}/status")
def move_visit(
    visit_id: int,
    body: StatusIn,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(requires("Visits", "edit")),
):
    v = db.get(Visit, visit_id)
    if not v:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Visit not found")
    if not _can_view_all(user) and v.created_by != user.id and v.host_user_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your visit")

    target = body.status.strip().lower()
    if target == "completed":
        # Reaching "completed" here would skip the outcome record and any
        # follow-up task, so closing is only possible through /close.
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Close the visit with its outcome instead of marking it completed directly.",
        )
    allowed = VISIT_FLOW.get(v.status, ())
    if target not in allowed:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Cannot move a {STATUS_LABEL.get(v.status, v.status)} visit to "
            f"{STATUS_LABEL.get(target, target)}. Allowed next: "
            + (", ".join(STATUS_LABEL.get(s, s) for s in allowed) or "none, this visit is closed"),
        )

    now = datetime.now(timezone.utc)
    v.status = target
    if target == "confirmed":
        v.confirmed_at = now
    elif target == "arrived":
        v.arrived_at = now
    elif target == "meeting":
        v.meeting_at = now
    elif target in ("completed", "cancelled"):
        v.closed_at = now
    if body.note.strip():
        db.add(VisitNote(visit_id=v.id, author_id=user.id, body=body.note.strip()))

    # Confirming closes the host's confirmation task; the rest of the flow is
    # driven from the visit itself, so no task churn per transition.
    if target == "confirmed":
        for t in db.scalars(
            select(Task).where(Task.source_ref == v.visit_no, Task.type == "approval", Task.status == "open")
        ).all():
            t.status = "done"

    db.commit()
    db.refresh(v)
    audit(db, actor=user, action=f"status:{target}", entity_type="visit", entity_ref=v.visit_no,
          ip=request.client.host if request.client else None)
    return _serialize(db, v, can_track=_has_tracking_permission(db, user), can_view_all=_can_view_all(user))


@router.post("/{visit_id}/location")
def ping_location(
    visit_id: int,
    body: LocationIn,
    db: Session = Depends(get_db),
    user: User = Depends(requires("Visits", "edit")),
):
    """Last known position of an en-route visitor."""
    v = db.get(Visit, visit_id)
    if not v:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Visit not found")
    if not _can_view_all(user) and v.created_by != user.id and v.host_user_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your visit")
    if not v.tracking_enabled:
        raise HTTPException(status.HTTP_409_CONFLICT, "Tracking is not enabled for this visit")

    v.latitude = body.latitude if body.latitude is not None else v.latitude
    v.longitude = body.longitude if body.longitude is not None else v.longitude
    v.location_note_tracking = body.note.strip() or v.location_note_tracking
    v.eta_minutes = body.eta_minutes if body.eta_minutes is not None else v.eta_minutes
    v.location_updated_at = datetime.now(timezone.utc)
    if v.status == "confirmed" and v.eta_minutes is not None:
        v.status = "on_the_way"
    db.commit()
    db.refresh(v)
    return _serialize(db, v, can_track=True, can_view_all=_can_view_all(user))


@router.post("/{visit_id}/notes", status_code=201)
def add_note(
    visit_id: int,
    body: NoteIn,
    db: Session = Depends(get_db),
    user: User = Depends(requires("Visits", "edit")),
):
    v = db.get(Visit, visit_id)
    if not v:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Visit not found")
    if not _can_view_all(user) and v.created_by != user.id and v.host_user_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your visit")
    note = VisitNote(visit_id=v.id, author_id=user.id, body=body.body.strip())
    db.add(note)
    db.commit()
    db.refresh(note)
    return {"id": note.id, "body": note.body, "created_at": note.created_at.isoformat()}


@router.post("/{visit_id}/close")
def close_visit(
    visit_id: int,
    body: CloseIn,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(requires_any(("Visits", "edit"), ("Visits", "approve"))),
):
    """Close with an outcome. A flagged follow-up becomes a real task with a due date.

    Open to the host department (`edit`) as well as management (`approve`): the
    people who met the visitor are the ones who know what was agreed, and the FRS
    matrix never grants both permissions to the same roles.
    """
    v = db.get(Visit, visit_id)
    if not v:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Visit not found")
    if not _can_view_all(user) and v.created_by != user.id and v.host_user_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your visit")
    if v.status not in CLOSEABLE_FROM:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Only a visit in meeting can be closed. This one is {STATUS_LABEL.get(v.status, v.status)}.",
        )

    v.outcome_requirement = body.outcome_requirement
    v.outcome_sample = body.outcome_sample
    v.outcome_purchase = body.outcome_purchase
    v.outcome_followup = body.outcome_followup
    v.next_action = body.next_action.strip()
    v.followup_due = _parse_date(body.followup_due, "followup_due")
    if body.notes.strip():
        v.notes = (v.notes + "\n" + body.notes.strip()).strip()
        db.add(VisitNote(visit_id=v.id, author_id=user.id, body=body.notes.strip()))

    db.commit()
    db.refresh(v)

    # The visit ends as "completed" once an outcome is recorded; leaving it in
    # "follow_up" would make the register look unfinished when the decision has
    # in fact been made.
    v.status = "completed"
    v.closed_at = datetime.now(timezone.utc)

    if body.outcome_followup and body.assign_to:
        due = v.followup_due or (date.today() + timedelta(days=3))
        db.add(Task(
            type="request",
            title=f"Follow up {v.visit_no} — {v.visitor_name}",
            description=v.next_action or f"Follow up on {v.company or v.visitor_name} visit",
            source_ref=v.visit_no,
            assigned_to=body.assign_to,
            department_id=v.department_id,
            priority="high" if v.visit_type in ("supplier", "buyer") else "normal",
            status="open",
            due_date=datetime.combine(due, datetime.min.time()),
            created_by=user.id,
        ))
        notify(db, recipient_id=body.assign_to,
               title=f"Follow-up from {v.company or v.visitor_name}",
               body=v.next_action or f"Visit {v.visit_no} needs a follow-up",
               priority="high", entity_type="visit", entity_ref=v.visit_no)

    db.commit()
    db.refresh(v)
    audit(db, actor=user, action="close", entity_type="visit", entity_ref=v.visit_no,
          after={"followup": body.outcome_followup, "next_action": v.next_action},
          ip=request.client.host if request.client else None)
    return _serialize(db, v, can_track=_has_tracking_permission(db, user), can_view_all=_can_view_all(user))


def _has_tracking_permission(db: Session, user: User) -> bool:
    """`BuyerTracking:view`, ADMIN always true. Mirrors security.requires()."""
    if user.role.code == "ADMIN":
        return True
    from ..models import Permission

    hit = db.scalar(
        select(Permission.id).where(
            Permission.role_id == user.role_id,
            Permission.module == "BuyerTracking",
            Permission.action == "view",
        )
    )
    return bool(hit)
