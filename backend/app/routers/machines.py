"""Machine shop — asset status, live jobs and downtime capture.

Downtime is the number that decides where to spend money on a machine shop, so it
is captured as a first-class event with a fixed reason list rather than a free
note. Every stop is reported, resolved with a resolution, and aggregated so the
bottleneck is visible instead of guessed at.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Machine, MachineDowntime, User
from ..security import requires
from ..services import as_utc, audit, notify

router = APIRouter(prefix="/machines", tags=["machines"])

MACHINE_STATUSES = ("running", "idle", "setup", "maintenance", "down", "offline")

STATUS_LABEL = {
    "running": "Running",
    "idle": "Idle",
    "setup": "Setup",
    "maintenance": "Maintenance",
    "down": "Down",
    "offline": "Offline",
}

# Fixed reason list so downtime aggregates into comparable buckets. Anything
# unlisted goes to "other" rather than a free-text bucket nobody can report on.
DOWNTIME_REASONS = (
    "tool_breakage",
    "material_unavailable",
    "machine_fault",
    "setup",
    "maintenance",
    "power_failure",
    "operator_unavailable",
    "quality_issue",
    "other",
)

REASON_LABEL = {
    "tool_breakage": "Tool breakage",
    "material_unavailable": "Material unavailable",
    "machine_fault": "Machine fault",
    "setup": "Setup / changeover",
    "maintenance": "Planned maintenance",
    "power_failure": "Power failure",
    "operator_unavailable": "Operator unavailable",
    "quality_issue": "Quality hold",
    "other": "Other",
}

STOP_STATUSES = ("down", "maintenance")


def _out(m: Machine, open_stop: MachineDowntime | None) -> dict:
    return {
        "id": m.id,
        "code": m.code,
        "name": m.name,
        "work_center": m.work_center,
        "status": m.status,
        "status_label": STATUS_LABEL.get(m.status, m.status),
        "current_job": m.current_job,
        "part_no": m.part_no,
        "operator_name": m.operator_name,
        "job_started_at": m.job_started_at.isoformat() if m.job_started_at else None,
        "est_completion": m.est_completion.isoformat() if m.est_completion else None,
        "running_minutes": (
            int((datetime.now(timezone.utc) - as_utc(m.job_started_at)).total_seconds() // 60)
            if m.job_started_at and m.status == "running"
            else 0
        ),
        "utilization_pct": m.utilization_pct,
        "tool_life_pct": m.tool_life_pct,
        "oee_pct": m.oee_pct,
        "notes": m.notes,
        "open_downtime": (
            {
                "id": open_stop.id,
                "reason": open_stop.reason,
                "reason_label": REASON_LABEL.get(open_stop.reason, open_stop.reason),
                "started_at": open_stop.started_at.isoformat(),
                "minutes": int(
                    (datetime.now(timezone.utc) - as_utc(open_stop.started_at)).total_seconds() // 60
                ),
            }
            if open_stop
            else None
        ),
    }


def _open_stop(db: Session, machine_id: int) -> MachineDowntime | None:
    return db.scalar(
        select(MachineDowntime)
        .where(MachineDowntime.machine_id == machine_id, MachineDowntime.ended_at.is_(None))
        .order_by(MachineDowntime.started_at.desc())
    )


class MachineIn(BaseModel):
    code: str = Field(..., min_length=1, max_length=32)
    name: str = Field(..., min_length=1, max_length=128)
    work_center: str = ""
    notes: str = ""


class StatusIn(BaseModel):
    status: str = Field(..., pattern="^(running|idle|setup|maintenance|down|offline)$")
    note: str = ""


class JobIn(BaseModel):
    job_ref: str = Field(..., min_length=1, max_length=64)
    part_no: str = ""
    operator_name: str = ""
    est_minutes: int | None = Field(default=None, ge=1, le=1440)


class DowntimeIn(BaseModel):
    reason: str = Field(..., pattern="^(tool_breakage|material_unavailable|machine_fault|setup|maintenance|power_failure|operator_unavailable|quality_issue|other)$")
    note: str = ""


class ResolveIn(BaseModel):
    resolution: str = Field(..., min_length=2, max_length=1000)
    minutes: int | None = Field(default=None, ge=0, le=100000)
    restart_job: bool = True


def _machine(db: Session, machine_id: int) -> Machine:
    m = db.get(Machine, machine_id)
    if not m:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Machine not found")
    return m


@router.get("")
def list_machines(
    work_center: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(requires("Machines", "view")),
):
    q = select(Machine)
    if work_center:
        q = q.where(Machine.work_center == work_center)
    rows = db.scalars(q.order_by(Machine.code)).all()
    return [_out(m, _open_stop(db, m.id)) for m in rows]


@router.get("/work-centers")
def work_centers(db: Session = Depends(get_db), _: User = Depends(requires("Machines", "view"))):
    rows = db.execute(select(Machine.work_center).distinct().order_by(Machine.work_center)).scalars().all()
    return [r for r in rows if r]


@router.get("/summary")
def machine_summary(db: Session = Depends(get_db), _: User = Depends(requires("Machines", "view"))):
    rows = db.scalars(select(Machine)).all()
    by_status = {s: sum(1 for m in rows if m.status == s) for s in MACHINE_STATUSES}
    today = date.today()
    day_start = datetime.combine(today, datetime.min.time())
    stops = db.scalars(
        select(MachineDowntime).where(MachineDowntime.started_at >= day_start)
    ).all()
    open_stops = [s for s in stops if s.ended_at is None]
    today_minutes = sum(
        s.minutes or int((datetime.now(timezone.utc) - as_utc(s.started_at)).total_seconds() // 60) for s in stops
    )
    return {
        "total": len(rows),
        "running": by_status["running"],
        "idle": by_status["idle"],
        "setup": by_status["setup"],
        "down": by_status["down"],
        "maintenance": by_status["maintenance"],
        "offline": by_status["offline"],
        "utilization_pct": round(
            (sum(1 for m in rows if m.status in ("running", "setup")) / len(rows) * 100) if rows else 0, 1
        ),
        "avg_oee_pct": round(sum(m.oee_pct for m in rows) / len(rows), 1) if rows else 0,
        "open_stops": len(open_stops),
        "today_downtime_minutes": today_minutes,
        "low_tool_life": [
            {"id": m.id, "code": m.code, "name": m.name, "tool_life_pct": m.tool_life_pct}
            for m in rows
            if m.tool_life_pct < 20
        ],
    }


@router.get("/downtime")
def downtime_analytics(
    days: int = 30,
    db: Session = Depends(get_db),
    _: User = Depends(requires("Machines", "view")),
):
    since = datetime.now(timezone.utc) - timedelta(days=min(max(days, 1), 365))
    stops = db.scalars(
        select(MachineDowntime).where(MachineDowntime.started_at >= since)
    ).all()
    now = datetime.now(timezone.utc)

    def minutes(s: MachineDowntime) -> int:
        end = as_utc(s.ended_at) or now
        return s.minutes or max(0, int((end - as_utc(s.started_at)).total_seconds() // 60))

    by_reason: dict[str, dict] = {
        r: {"reason": r, "label": REASON_LABEL[r], "count": 0, "minutes": 0, "open": 0, "share_pct": 0.0}
        for r in DOWNTIME_REASONS
    }
    for s in stops:
        bucket = by_reason.setdefault(
            s.reason,
            {"reason": s.reason, "label": REASON_LABEL.get(s.reason, s.reason),
             "count": 0, "minutes": 0, "open": 0, "share_pct": 0.0},
        )
        bucket["count"] += 1
        bucket["minutes"] += minutes(s)
        if s.ended_at is None:
            bucket["open"] += 1

    ranked = sorted(by_reason.values(), key=lambda b: b["minutes"], reverse=True)
    total = sum(b["minutes"] for b in ranked) or 1
    for b in ranked:
        b["share_pct"] = round(b["minutes"] / total * 100, 1)

    machines = db.scalars(select(Machine).order_by(Machine.code)).all()
    code_by_id = {m.id: m.code for m in machines}
    machine_rows = [
        {
            "machine_id": m.id,
            "code": m.code,
            "name": m.name,
            "status": m.status,
            "status_label": STATUS_LABEL.get(m.status, m.status),
            "stops": sum(1 for s in stops if s.machine_id == m.id),
            "downtime_minutes": sum(minutes(s) for s in stops if s.machine_id == m.id),
            "utilization_pct": m.utilization_pct,
            "oee_pct": m.oee_pct,
            "tool_life_pct": m.tool_life_pct,
        }
        for m in machines
    ]
    machine_rows.sort(key=lambda r: r["downtime_minutes"], reverse=True)

    return {
        "days": days,
        "total_stops": len(stops),
        "total_minutes": sum(b["minutes"] for b in ranked),
        "by_reason": ranked,
        "by_machine": machine_rows,
        "recent": [
            {
                "id": s.id,
                "machine_code": code_by_id.get(s.machine_id, ""),
                "reason": s.reason,
                "reason_label": REASON_LABEL.get(s.reason, s.reason),
                "started_at": s.started_at.isoformat(),
                "ended_at": s.ended_at.isoformat() if s.ended_at else None,
                "minutes": minutes(s),
                "open": s.ended_at is None,
                "resolution": s.resolution,
                "reported_by": s.reported_by,
            }
            for s in sorted(stops, key=lambda s: s.started_at, reverse=True)[:40]
        ],
    }


@router.post("", status_code=201)
def create_machine(body: MachineIn, db: Session = Depends(get_db), user: User = Depends(requires("Machines", "create"))):
    if db.scalar(select(Machine.id).where(Machine.code == body.code.strip())):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Machine {body.code} already registered")
    m = Machine(code=body.code.strip(), name=body.name.strip(), work_center=body.work_center.strip(),
                notes=body.notes.strip(), status="idle")
    db.add(m)
    db.commit()
    db.refresh(m)
    audit(db, actor=user, action="create", entity_type="machine", entity_ref=m.code)
    return _out(m, None)


@router.post("/{machine_id}/status")
def set_status(
    machine_id: int,
    body: StatusIn,
    db: Session = Depends(get_db),
    user: User = Depends(requires("Machines", "edit")),
):
    m = _machine(db, machine_id)
    m.status = body.status
    if body.note.strip():
        m.notes = (m.notes + "\n" + body.note.strip()).strip()
    db.commit()
    db.refresh(m)
    audit(db, actor=user, action=f"status:{body.status}", entity_type="machine", entity_ref=m.code)
    return _out(m, _open_stop(db, m.id))


@router.post("/{machine_id}/job")
def assign_job(
    machine_id: int,
    body: JobIn,
    db: Session = Depends(get_db),
    user: User = Depends(requires("Machines", "edit")),
):
    m = _machine(db, machine_id)
    m.current_job = body.job_ref.strip()
    m.part_no = body.part_no.strip()
    m.operator_name = body.operator_name.strip()
    m.job_started_at = datetime.now(timezone.utc)
    m.est_completion = (
        m.job_started_at + timedelta(minutes=body.est_minutes) if body.est_minutes else None
    )
    m.status = "running"
    db.commit()
    db.refresh(m)
    audit(db, actor=user, action="assign_job", entity_type="machine", entity_ref=m.code,
          after={"job": m.current_job, "part": m.part_no, "operator": m.operator_name})
    return _out(m, _open_stop(db, m.id))


@router.post("/{machine_id}/downtime", status_code=201)
def report_downtime(
    machine_id: int,
    body: DowntimeIn,
    db: Session = Depends(get_db),
    user: User = Depends(requires("Machines", "create")),
):
    """Operator reports a stop. The machine flips to `down` and alerts maintenance."""
    m = _machine(db, machine_id)
    if _open_stop(db, m.id):
        raise HTTPException(status.HTTP_409_CONFLICT, f"{m.code} already has an open stop")

    stop = MachineDowntime(
        machine_id=m.id,
        reason=body.reason,
        started_at=datetime.now(timezone.utc),
        reported_by=user.username,
        reported_role=user.role.code,
    )
    db.add(stop)
    m.status = "maintenance" if body.reason == "maintenance" else "down"
    db.commit()
    db.refresh(stop)

    # A machine down is a plant problem, not a local one: tell management and the
    # department head so someone acts on it even when they are not on the floor.
    from ..models import Role

    for u in db.scalars(
        select(User).join(Role, User.role_id == Role.id).where(Role.code.in_(("MGMT", "DH", "SUP")))
    ).all():
        if u.id == user.id:
            continue
        notify(db, recipient_id=u.id,
               title=f"{m.code} down · {REASON_LABEL.get(body.reason, body.reason)}",
               body=f"{m.name}{' · ' + m.current_job if m.current_job else ''}",
               priority="urgent" if body.reason in ("machine_fault", "power_failure") else "high",
               entity_type="machine", entity_ref=m.code)

    audit(db, actor=user, action="report_downtime", entity_type="machine", entity_ref=m.code,
          after={"reason": body.reason})
    return _out(m, stop)


@router.post("/downtime/{stop_id}/resolve")
def resolve_downtime(
    stop_id: int,
    body: ResolveIn,
    db: Session = Depends(get_db),
    user: User = Depends(requires("Machines", "edit")),
):
    stop = db.get(MachineDowntime, stop_id)
    if not stop:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Downtime record not found")
    if stop.ended_at:
        raise HTTPException(status.HTTP_409_CONFLICT, "This stop is already resolved")

    now = datetime.now(timezone.utc)
    stop.ended_at = now
    stop.resolution = body.resolution.strip()
    stop.minutes = body.minutes if body.minutes is not None else max(
        0, int((now - as_utc(stop.started_at)).total_seconds() // 60)
    )

    m = _machine(db, stop.machine_id)
    m.status = "running" if (body.restart_job and m.current_job) else "idle"
    if body.restart_job and m.current_job:
        m.job_started_at = now
    db.commit()
    db.refresh(stop)
    audit(db, actor=user, action="resolve_downtime", entity_type="machine", entity_ref=m.code,
          after={"minutes": stop.minutes, "resolution": stop.resolution})
    return _out(m, _open_stop(db, m.id))
