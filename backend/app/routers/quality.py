"""Quality — incoming / in-process / final inspection and the NCR loop.

    supplier material → incoming inspection → production → in-process inspection
    → assembly → final inspection → PASS → finished goods
                                              ↘ FAIL → NCR → root cause
                                                        → corrective action
                                                        → verification → closed

A failed inspection always raises an NCR, and the NCR always raises a task for the
owning department. That is the point: the failure has to re-enter the workflow as
work somebody is accountable for, otherwise it is just a red row an inspector
walks past.
"""
from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Department, Employee, Inspection, Ncr, Task, User
from ..security import requires
from ..services import audit, notify
from ..workflows import transition_objects, transition_statuses

router = APIRouter(prefix="/quality", tags=["quality"])

INSPECTION_KINDS = ("incoming", "in_process", "final")
SEVERITIES = ("minor", "major", "critical")

NCR_FLOW: dict[str, tuple[str, ...]] = {
    "open": ("investigating", "rejected"),
    "investigating": ("corrective", "rejected"),
    "corrective": ("verification", "rework"),  # after corrective action, can go to verification or rework
    "rework": ("verification",),  # rework triggers re-inspection
    "verification": ("closed", "corrective"),  # verification can send it back to corrective
    "closed": (),
    "rejected": (),
}

NCR_LABEL = {
    "open": "Open",
    "investigating": "Root cause analysis",
    "corrective": "Corrective action",
    "rework": "Rework / Re-inspect",
    "verification": "Awaiting verification",
    "closed": "Closed",
    "rejected": "Rejected",
}

# Default checklists per stage. Kept server-side so every inspector sees the same
# items for a given kind and the QA baseline cannot drift department to department.
CHECKLISTS: dict[str, list[dict]] = {
    "incoming": [
        {"key": "material_grade", "label": "Material grade matches PO"},
        {"key": "qty", "label": "Received quantity as per GRN"},
        {"key": "damage", "label": "No transit damage"},
        {"key": "certs", "label": "Test certificates / COC present"},
        {"key": "marking", "label": "Item marking and labelling legible"},
        {"key": "storage", "label": "Storage condition acceptable"},
    ],
    "in_process": [
        {"key": "dimensions", "label": "Dimensions within drawing tolerance"},
        {"key": "weld", "label": "Weld / joint quality acceptable"},
        {"key": "finish", "label": "Surface finish as specified"},
        {"key": "fit", "label": "Component fit-up correct"},
        {"key": "tools", "label": "Correct tooling used"},
    ],
    "final": [
        {"key": "frame", "label": "Frame alignment and rigidity"},
        {"key": "sensor", "label": "Sensor alignment / calibration"},
        {"key": "electronics", "label": "Electronics and wiring"},
        {"key": "software", "label": "Software build and calibration pass"},
        {"key": "safety", "label": "Safety interlock and emergency stop test"},
        {"key": "accessories", "label": "Accessories and documents packed"},
    ],
}

SEVERITY_COLOR_HINT = {"minor": "warn", "major": "warn", "critical": "danger"}


def _insp_no(db: Session, kind: str) -> str:
    stamp = date.today().strftime("%y%m")
    prefix = {"incoming": "IQ", "in_process": "PQ", "final": "FQ"}.get(kind, "Q")
    count = db.scalar(select(func.count(Inspection.id))) or 0
    return f"{prefix}{stamp}-{count + 1:04d}"


def _ncr_no(db: Session) -> str:
    stamp = date.today().strftime("%y%m")
    count = db.scalar(select(func.count(Ncr.id))) or 0
    return f"NCR{stamp}-{count + 1:04d}"


def _insp_out(i: Inspection) -> dict:
    return {
        "id": i.id,
        "insp_no": i.insp_no,
        "kind": i.kind,
        "kind_label": {"incoming": "Incoming QC", "in_process": "In-process QC", "final": "Final QC"}.get(
            i.kind, i.kind
        ),
        "ref_type": i.ref_type,
        "ref_no": i.ref_no,
        "product_name": i.product_name,
        "serial_no": i.serial_no,
        "qty": i.qty,
        "result": i.result,
        "result_label": {"pending": "Pending", "pass": "Pass", "fail": "Fail", "rework": "Rework"}.get(
            i.result, i.result
        ),
        "severity": i.severity,
        "checklist": i.checklist or [],
        "default_checklist": CHECKLISTS.get(i.kind, []),
        "remarks": i.remarks,
        "ncr_id": i.ncr_id,
        "inspector_name": i.inspector_name,
        "inspected_at": i.inspected_at.isoformat() if i.inspected_at else None,
        "created_at": i.created_at.isoformat(),
        "checked_count": sum(1 for c in (i.checklist or []) if c.get("result") in ("pass", "fail")),
        "total_checks": len(CHECKLISTS.get(i.kind, []) or i.checklist or []),
    }


def _ncr_out(db: Session, n: Ncr) -> dict:
    assignee = None
    if n.assigned_to:
        row = db.execute(
            select(Employee.name).join(User, User.employee_id == Employee.id).where(User.id == n.assigned_to)
        ).first()
        assignee = row[0] if row else None
    dept = db.get(Department, n.department_id) if n.department_id else None
    today = date.today()
    return {
        "id": n.id,
        "ncr_no": n.ncr_no,
        "title": n.title,
        "issue": n.issue,
        "detected_at": n.detected_at,
        "ref_no": n.ref_no,
        "severity": n.severity,
        "status": n.status,
        "status_label": NCR_LABEL.get(n.status, n.status),
        "valid_transitions": transition_objects(
            NCR_FLOW.get(n.status, ()), permission="Quality:edit", labels=NCR_LABEL
        ),
        "next_states": transition_statuses(
            transition_objects(NCR_FLOW.get(n.status, ()), permission="Quality:edit", labels=NCR_LABEL)
        ),
        "assigned_to": n.assigned_to,
        "assigned_name": assignee or "",
        "department_name": dept.name if dept else "",
        "qty_affected": n.qty_affected,
        "root_cause": n.root_cause,
        "corrective_action": n.corrective_action,
        "preventive_action": n.preventive_action,
        "verification": n.verification,
        "due_date": n.due_date.isoformat() if n.due_date else None,
        "overdue": bool(n.due_date and n.due_date < today and n.status not in ("closed", "rejected")),
        "closed_at": n.closed_at.isoformat() if n.closed_at else None,
        "created_at": n.created_at.isoformat(),
    }


class ChecklistIn(BaseModel):
    key: str
    result: str = Field(..., pattern="^(pass|fail|na)$")
    remark: str = ""


class InspectionIn(BaseModel):
    kind: str = Field(..., pattern="^(incoming|in_process|final)$")
    ref_type: str = ""
    ref_no: str = ""
    product_name: str = ""
    serial_no: str = ""
    qty: int = Field(default=1, ge=1)
    severity: str = Field(default="minor", pattern="^(minor|major|critical)$")


class InspectionSubmitIn(BaseModel):
    result: str = Field(..., pattern="^(pass|fail|rework)$")
    checklist: list[ChecklistIn] = Field(default_factory=list)
    remarks: str = ""
    # Raise an NCR when a check fails. Defaults on for fail/rework so a
    # non-conformance cannot be recorded without an owner.
    raise_ncr: bool | None = None
    ncr_title: str = ""
    ncr_issue: str = ""
    assigned_to: int | None = None
    department_id: int | None = None
    due_date: str | None = None


class NcrIn(BaseModel):
    title: str = Field(..., min_length=3, max_length=200)
    issue: str = ""
    detected_at: str = ""
    ref_no: str = ""
    severity: str = Field(default="minor", pattern="^(minor|major|critical)$")
    qty_affected: int = Field(default=0, ge=0)
    assigned_to: int | None = None
    department_id: int | None = None
    due_date: str | None = None


class NcrStageIn(BaseModel):
    """One stage payload — only the fields relevant to that stage are read."""

    status: str
    root_cause: str = ""
    corrective_action: str = ""
    preventive_action: str = ""
    verification: str = ""
    assigned_to: int | None = None
    note: str = ""


def _parse_date(value: str | None, field: str) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"{field} must be YYYY-MM-DD")


@router.get("/summary")
def quality_summary(db: Session = Depends(get_db), _: User = Depends(requires("Quality", "view"))):
    today = date.today()
    by_kind: dict[str, dict[str, int]] = {}
    for kind in INSPECTION_KINDS:
        rows = db.scalars(select(Inspection).where(Inspection.kind == kind)).all()
        by_kind[kind] = {
            "pending": sum(1 for r in rows if r.result == "pending"),
            "pass": sum(1 for r in rows if r.result == "pass"),
            "fail": sum(1 for r in rows if r.result == "fail"),
            "rework": sum(1 for r in rows if r.result == "rework"),
        }
    ncrs = db.scalars(select(Ncr)).all()
    return {
        "inspections": by_kind,
        "pending_total": sum(v["pending"] for v in by_kind.values()),
        "failed_total": sum(v["fail"] + v["rework"] for v in by_kind.values()),
        "ncr_open": sum(1 for n in ncrs if n.status not in ("closed", "rejected")),
        "ncr_awaiting_root_cause": sum(1 for n in ncrs if n.status == "open"),
        "ncr_awaiting_verification": sum(1 for n in ncrs if n.status == "verification"),
        "ncr_overdue": sum(
            1 for n in ncrs if n.due_date and n.due_date < today and n.status not in ("closed", "rejected")
        ),
        "ncr_critical": sum(1 for n in ncrs if n.severity == "critical" and n.status not in ("closed", "rejected")),
    }


@router.get("/inspections")
def list_inspections(
    kind: str | None = None,
    result: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(requires("Quality", "view")),
):
    q = select(Inspection)
    if kind:
        q = q.where(Inspection.kind == kind)
    if result:
        q = q.where(Inspection.result == result)
    rows = db.scalars(q.order_by(Inspection.created_at.desc()).limit(200)).all()
    return [_insp_out(r) for r in rows]


@router.post("/inspections", status_code=201)
def create_inspection(
    body: InspectionIn,
    db: Session = Depends(get_db),
    user: User = Depends(requires("Quality", "create")),
):
    i = Inspection(
        insp_no=_insp_no(db, body.kind),
        kind=body.kind,
        ref_type=body.ref_type.strip(),
        ref_no=body.ref_no.strip(),
        product_name=body.product_name.strip(),
        serial_no=body.serial_no.strip(),
        qty=body.qty,
        severity=body.severity,
        checklist=[],
        result="pending",
        created_by=user.id,
    )
    db.add(i)
    db.commit()
    db.refresh(i)
    audit(db, actor=user, action="create", entity_type="inspection", entity_ref=i.insp_no)
    return _insp_out(i)


@router.post("/inspections/{insp_id}/submit")
def submit_inspection(
    insp_id: int,
    body: InspectionSubmitIn,
    db: Session = Depends(get_db),
    user: User = Depends(requires("Quality", "edit")),
):
    """Record the inspection result. A non-pass raises an NCR and a task."""
    insp = db.get(Inspection, insp_id)
    if not insp:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Inspection not found")
    if insp.result != "pending":
        raise HTTPException(status.HTTP_409_CONFLICT, f"Inspection {insp.insp_no} already submitted")

    results = {c.key: c for c in body.checklist}
    checks = []
    for item in CHECKLISTS.get(insp.kind, []):
        got = results.get(item["key"])
        checks.append(
            {
                "key": item["key"],
                "label": item["label"],
                "result": got.result if got else "na",
                "remark": got.remark if got else "",
            }
        )
    # Preserve any ad-hoc items the caller added beyond the default list.
    default_keys = {c["key"] for c in CHECKLISTS.get(insp.kind, [])}
    for c in body.checklist:
        if c.key not in default_keys:
            checks.append({"key": c.key, "label": c.key.replace("_", " ").capitalize(),
                           "result": c.result, "remark": c.remark})

    failed_checks = [c for c in checks if c["result"] == "fail"]
    insp.checklist = checks
    insp.remarks = body.remarks.strip()
    insp.result = body.result
    insp.inspected_at = datetime.now(timezone.utc)
    insp.inspector_id = user.id
    emp = db.get(Employee, user.employee_id) if user.employee_id else None
    insp.inspector_name = emp.name if emp else user.username
    # A safety or calibration failure cannot be logged as "minor", whatever the
    # severity the inspector picked when raising the inspection.
    if failed_checks and insp.severity == "minor" and any(
        c["key"] in ("safety", "sensor", "calibration", "electronics") for c in failed_checks
    ):
        insp.severity = "critical"
    # And a lot with a failed check is never a pass, however the inspector
    # summarised it.
    if failed_checks:
        insp.result = "rework" if insp.result == "pass" else insp.result

    raise_ncr = body.raise_ncr if body.raise_ncr is not None else insp.result != "pass"
    if raise_ncr and insp.result != "pass":
        ncr = Ncr(
            ncr_no=_ncr_no(db),
            title=body.ncr_title.strip() or f"{insp.insp_no} failed {_insp_out(insp)['kind_label']}",
            issue=body.ncr_issue.strip()
            or insp.remarks.strip()
            or "; ".join(f"{c['label']}: {c.get('remark') or 'failed'}" for c in failed_checks),
            detected_at=insp.kind,
            ref_no=insp.ref_no or insp.insp_no,
            severity=insp.severity,
            status="open",
            qty_affected=insp.qty,
            assigned_to=body.assigned_to,
            department_id=body.department_id,
            due_date=_parse_date(body.due_date, "due_date"),
            created_by=user.id,
        )
        db.add(ncr)
        db.flush()
        insp.ncr_id = ncr.id
        if body.assigned_to:
            db.add(Task(
                type="quality",
                title=f"{ncr.ncr_no} · {ncr.title}",
                description=ncr.issue[:400],
                source_ref=ncr.ncr_no,
                assigned_to=body.assigned_to,
                department_id=body.department_id,
                priority="urgent" if ncr.severity == "critical" else "high",
                status="open",
                created_by=user.id,
            ))
            notify(db, recipient_id=body.assigned_to,
                   title=f"NCR raised · {ncr.ncr_no}",
                   body=ncr.title, priority="high" if ncr.severity != "critical" else "urgent",
                   entity_type="ncr", entity_ref=ncr.ncr_no)

    db.commit()
    db.refresh(insp)
    audit(db, actor=user, action=f"inspect:{insp.result}", entity_type="inspection", entity_ref=insp.insp_no,
          after={"failed_checks": len(failed_checks), "ncr": insp.ncr_id})
    return _insp_out(insp)


@router.get("/ncrs")
def list_ncrs(
    status_filter: str | None = None,
    mine: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(requires("Quality", "view")),
):
    q = select(Ncr)
    if status_filter:
        q = q.where(Ncr.status == status_filter)
    if mine:
        q = q.where(Ncr.assigned_to == user.id)
    rows = db.scalars(q.order_by(Ncr.created_at.desc()).limit(200)).all()
    return [_ncr_out(db, r) for r in rows]


@router.post("/ncrs", status_code=201)
def create_ncr(body: NcrIn, db: Session = Depends(get_db), user: User = Depends(requires("Quality", "create"))):
    ncr = Ncr(
        ncr_no=_ncr_no(db),
        title=body.title.strip(),
        issue=body.issue.strip(),
        detected_at=body.detected_at.strip(),
        ref_no=body.ref_no.strip(),
        severity=body.severity,
        status="open",
        qty_affected=body.qty_affected,
        assigned_to=body.assigned_to,
        department_id=body.department_id,
        due_date=_parse_date(body.due_date, "due_date"),
        created_by=user.id,
    )
    db.add(ncr)
    db.flush()
    if body.assigned_to:
        db.add(Task(
            type="quality",
            title=f"{ncr.ncr_no} · {ncr.title}",
            description=ncr.issue[:400],
            source_ref=ncr.ncr_no,
            assigned_to=body.assigned_to,
            department_id=body.department_id,
            priority="urgent" if ncr.severity == "critical" else "high",
            status="open",
            created_by=user.id,
        ))
        notify(db, recipient_id=body.assigned_to, title=f"NCR raised · {ncr.ncr_no}",
               body=ncr.title, priority="high" if ncr.severity != "critical" else "urgent",
               entity_type="ncr", entity_ref=ncr.ncr_no)
    db.commit()
    db.refresh(ncr)
    audit(db, actor=user, action="create", entity_type="ncr", entity_ref=ncr.ncr_no)
    return _ncr_out(db, ncr)


@router.get("/ncrs/{ncr_id}")
def ncr_detail(ncr_id: int, db: Session = Depends(get_db), _: User = Depends(requires("Quality", "view"))):
    ncr = db.get(Ncr, ncr_id)
    if not ncr:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "NCR not found")
    data = _ncr_out(db, ncr)
    insp_id = db.scalar(select(Inspection.id).where(Inspection.ncr_id == ncr.id))
    insp = db.get(Inspection, insp_id) if insp_id else None
    data["inspection"] = _insp_out(insp) if insp else None
    return data


@router.post("/ncrs/{ncr_id}/stage")
def ncr_stage(
    ncr_id: int,
    body: NcrStageIn,
    db: Session = Depends(get_db),
    user: User = Depends(requires("Quality", "edit")),
):
    """Advance the NCR one stage: root cause → corrective action → rework → verification → closed."""
    ncr = db.get(Ncr, ncr_id)
    if not ncr:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "NCR not found")

    target = body.status.strip().lower()
    allowed = NCR_FLOW.get(ncr.status, ())
    if target not in allowed:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Cannot move {NCR_LABEL.get(ncr.status, ncr.status)} to "
            f"{NCR_LABEL.get(target, target)}. Allowed next: "
            + (", ".join(NCR_LABEL.get(s, s) for s in allowed) or "none, this NCR is closed"),
        )

    # Each stage must actually carry its content — an NCR with no root cause is
    # how a repeat defect gets signed off.
    if target == "investigating" and not (body.root_cause.strip() or ncr.root_cause):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Record the root cause before continuing")
    if target == "corrective" and not (body.corrective_action.strip() or ncr.corrective_action):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Record the corrective action before continuing")
    if target == "rework" and not (body.corrective_action.strip() or ncr.corrective_action):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Record the rework performed before continuing")
    if target == "closed" and not (body.verification.strip() or ncr.verification):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Record the verification result before closing")

    ncr.root_cause = body.root_cause.strip() or ncr.root_cause
    ncr.corrective_action = body.corrective_action.strip() or ncr.corrective_action
    ncr.preventive_action = body.preventive_action.strip() or ncr.preventive_action
    ncr.verification = body.verification.strip() or ncr.verification
    if body.assigned_to:
        ncr.assigned_to = body.assigned_to
    ncr.status = target
    if target == "closed":
        ncr.closed_at = datetime.now(timezone.utc)

    # When moving to rework, create a new inspection linked to this NCR
    if target == "rework":
        # Find the original inspection to copy reference info
        orig_insp = db.scalar(select(Inspection).where(Inspection.ncr_id == ncr.id))
        if orig_insp:
            new_insp = Inspection(
                insp_no=_insp_no(db, orig_insp.kind),
                kind=orig_insp.kind,
                ref_type=orig_insp.ref_type,
                ref_no=orig_insp.ref_no,
                product_name=orig_insp.product_name,
                serial_no=orig_insp.serial_no,
                qty=orig_insp.qty,
                severity=orig_insp.severity,
                checklist=[],
                result="pending",
                created_by=user.id,
            )
            db.add(new_insp)
            db.flush()
            ncr.reinspection_id = new_insp.id
            audit(db, actor=user, action="create", entity_type="inspection", entity_ref=new_insp.insp_no,
                  after={"ncr_id": ncr.id, "rework_of": orig_insp.insp_no})

    if target == "closed":
        ncr.closed_at = datetime.now(timezone.utc)

    if target == "closed":
        for t in db.scalars(
            select(Task).where(Task.source_ref == ncr.ncr_no, Task.status.in_(("open", "in_progress")))
        ).all():
            t.status = "done"

    db.commit()
    db.refresh(ncr)
    audit(db, actor=user, action=f"ncr:{target}", entity_type="ncr", entity_ref=ncr.ncr_no,
          before={"status": body.status}, after={"status": target})
    return _ncr_out(db, ncr)
