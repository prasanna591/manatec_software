from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import (
    GoodsReceiptNote,
    MaterialIssue,
    MaterialRequest,
    StockTake,
    TransferOrder,
    User,
)
from ..security import requires
from ..services import audit
from ..stores_service import (
    cancel_request,
    count_take,
    create_grn,
    create_issue,
    create_request,
    create_transfer,
    fulfil_request,
    list_balances,
    list_movements,
    reconcile_take,
    start_take,
    summary,
    warehouses,
)

router = APIRouter(prefix="/stores", tags=["stores"])


def _error(exc: Exception) -> HTTPException:
    return HTTPException(status.HTTP_409_CONFLICT, str(exc))


class LineIn(BaseModel):
    item: str
    qty: int = Field(gt=0)


class GRNIn(BaseModel):
    supplier_code: str | None = None
    po_ref: str | None = None
    warehouse: str = "MAIN"
    note: str | None = None
    lines: list[LineIn]


class IssueIn(BaseModel):
    warehouse: str = "MAIN"
    issued_to: str | None = None
    purpose: str | None = None
    lines: list[LineIn]


class RequestIn(BaseModel):
    department_id: int | None = None
    purpose_ref: str | None = None
    priority: str = "normal"
    required_date: str | None = None
    lines: list[LineIn]


class FulfilIn(BaseModel):
    warehouse: str = "MAIN"


class TransferIn(BaseModel):
    from_wh: str
    to_wh: str
    note: str | None = None
    lines: list[LineIn]


class CountIn(BaseModel):
    item: str
    counted: int = Field(ge=0)


class TakeCountIn(BaseModel):
    counts: list[CountIn]


def _grn_out(d: GoodsReceiptNote) -> dict:
    return {"id": d.id, "grn_no": d.grn_no, "supplier_code": d.supplier_code, "po_ref": d.po_ref,
            "warehouse": d.warehouse, "note": d.note, "status": d.status, "lines": d.lines,
            "created_by": d.created_by, "created_at": d.created_at.isoformat()}


def _iss_out(d: MaterialIssue) -> dict:
    return {"id": d.id, "issue_no": d.issue_no, "warehouse": d.warehouse, "issued_to": d.issued_to,
            "purpose": d.purpose, "lines": d.lines, "created_by": d.created_by,
            "created_at": d.created_at.isoformat()}


def _mrq_out(d: MaterialRequest) -> dict:
    return {"id": d.id, "req_no": d.req_no, "requester": d.requester,
            "department_id": d.department_id, "purpose_ref": d.purpose_ref,
            "priority": d.priority, "required_date": d.required_date.isoformat() if d.required_date else None,
            "status": d.status, "lines": d.lines, "created_by": d.created_by,
            "created_at": d.created_at.isoformat()}


def _trf_out(d: TransferOrder) -> dict:
    return {"id": d.id, "transfer_no": d.transfer_no, "from_wh": d.from_wh, "to_wh": d.to_wh,
            "note": d.note, "lines": d.lines, "created_by": d.created_by,
            "created_at": d.created_at.isoformat()}


def _tak_out(d: StockTake) -> dict:
    return {"id": d.id, "take_no": d.take_no, "warehouse": d.warehouse, "status": d.status,
            "lines": d.lines, "started_by": d.started_by,
            "started_at": d.started_at.isoformat(),
            "finished_at": d.finished_at.isoformat() if d.finished_at else None}


@router.get("/warehouses")
def list_warehouses(db: Session = Depends(get_db), _: User = Depends(requires("Inventory", "view"))):
    return {"warehouses": warehouses(db)}


@router.get("/stock")
def stock(db: Session = Depends(get_db), warehouse: str | None = None, q: str | None = None,
          _: User = Depends(requires("Inventory", "view"))):
    return list_balances(db, warehouse, q)


@router.get("/transactions")
def transactions(item: str | None = None, warehouse: str | None = None, limit: int = 100,
                 db: Session = Depends(get_db), _: User = Depends(requires("Inventory", "view"))):
    return list_movements(db, item, warehouse, limit=min(limit, 500))


@router.get("/summary")
def get_summary(db: Session = Depends(get_db), _: User = Depends(requires("Inventory", "view"))):
    return summary(db)


# --- Inward / Goods Receipt (FRS 10.2) ---

@router.get("/grn")
def list_grn(db: Session = Depends(get_db), _: User = Depends(requires("Inventory", "view"))):
    rows = db.scalars(select(GoodsReceiptNote).order_by(GoodsReceiptNote.created_at.desc())).all()
    return [_grn_out(d) for d in rows]


@router.post("/grn", status_code=201)
def post_grn(body: GRNIn, db: Session = Depends(get_db),
             actor: User = Depends(requires("Inventory", "create"))):
    try:
        doc = create_grn(db, supplier_code=body.supplier_code, po_ref=body.po_ref,
                         warehouse=body.warehouse, note=body.note,
                         lines=[l.model_dump() for l in body.lines], actor=actor.username)
    except ValueError as e:
        raise _error(e)
    audit(db, actor=actor, action="create", entity_type="grn", entity_ref=doc.grn_no)
    return _grn_out(doc)


# --- Outward / Issue (FRS 10.3) ---

@router.get("/issues")
def list_issues(db: Session = Depends(get_db), _: User = Depends(requires("Inventory", "view"))):
    rows = db.scalars(select(MaterialIssue).order_by(MaterialIssue.created_at.desc())).all()
    return [_iss_out(d) for d in rows]


@router.post("/issues", status_code=201)
def post_issue(body: IssueIn, db: Session = Depends(get_db),
               actor: User = Depends(requires("Inventory", "create"))):
    try:
        doc = create_issue(db, warehouse=body.warehouse, issued_to=body.issued_to,
                           purpose=body.purpose, lines=[l.model_dump() for l in body.lines],
                           actor=actor.username)
    except ValueError as e:
        raise _error(e)
    audit(db, actor=actor, action="create", entity_type="issue", entity_ref=doc.issue_no)
    return _iss_out(doc)


# --- Material Requests (FRS 10.4) ---

@router.get("/material-requests")
def list_requests(db: Session = Depends(get_db), _: User = Depends(requires("MaterialReq", "view"))):
    rows = db.scalars(select(MaterialRequest).order_by(MaterialRequest.created_at.desc())).all()
    return [_mrq_out(d) for d in rows]


@router.post("/material-requests", status_code=201)
def create_material_request(body: RequestIn, db: Session = Depends(get_db),
                            actor: User = Depends(requires("MaterialReq", "create"))):
    doc = create_request(db, requester=actor.username, department_id=body.department_id,
                         purpose_ref=body.purpose_ref, priority=body.priority,
                         required_date=body.required_date, lines=[l.model_dump() for l in body.lines],
                         actor=actor.username)
    audit(db, actor=actor, action="create", entity_type="material_request", entity_ref=doc.req_no)
    return _mrq_out(doc)


@router.post("/material-requests/{req_id}/fulfil")
def fulfil(req_id: int, body: FulfilIn, db: Session = Depends(get_db),
           actor: User = Depends(requires("MaterialReq", "edit"))):
    req = db.get(MaterialRequest, req_id)
    if not req:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Material request not found")
    try:
        req = fulfil_request(db, req, warehouse=body.warehouse, actor=actor.username)
    except ValueError as e:
        raise _error(e)
    audit(db, actor=actor, action="fulfil", entity_type="material_request", entity_ref=req.req_no)
    return _mrq_out(req)


@router.post("/material-requests/{req_id}/cancel")
def cancel(req_id: int, db: Session = Depends(get_db),
           actor: User = Depends(requires("MaterialReq", "edit"))):
    req = db.get(MaterialRequest, req_id)
    if not req:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Material request not found")
    try:
        req = cancel_request(db, req)
    except ValueError as e:
        raise _error(e)
    audit(db, actor=actor, action="cancel", entity_type="material_request", entity_ref=req.req_no)
    return _mrq_out(req)


# --- Transfers (FRS 10.5) ---

@router.get("/transfers")
def list_transfers(db: Session = Depends(get_db), _: User = Depends(requires("Inventory", "view"))):
    rows = db.scalars(select(TransferOrder).order_by(TransferOrder.created_at.desc())).all()
    return [_trf_out(d) for d in rows]


@router.post("/transfers", status_code=201)
def post_transfer(body: TransferIn, db: Session = Depends(get_db),
                  actor: User = Depends(requires("Inventory", "create"))):
    try:
        doc = create_transfer(db, from_wh=body.from_wh, to_wh=body.to_wh,
                              note=body.note, lines=[l.model_dump() for l in body.lines],
                              actor=actor.username)
    except ValueError as e:
        raise _error(e)
    audit(db, actor=actor, action="create", entity_type="transfer", entity_ref=doc.transfer_no)
    return _trf_out(doc)


# --- Stock Take / Counting (FRS 10.6) ---

@router.get("/stock-takes")
def list_takes(db: Session = Depends(get_db), _: User = Depends(requires("Inventory", "view"))):
    rows = db.scalars(select(StockTake).order_by(StockTake.started_at.desc())).all()
    return [_tak_out(d) for d in rows]


@router.post("/stock-takes", status_code=201)
def create_take(body: dict, db: Session = Depends(get_db),
                actor: User = Depends(requires("Inventory", "create"))):
    warehouse = body.get("warehouse", "MAIN")
    try:
        take = start_take(db, warehouse=warehouse, actor=actor.username)
    except ValueError as e:
        raise _error(e)
    audit(db, actor=actor, action="create", entity_type="stock_take", entity_ref=take.take_no)
    return _tak_out(take)


@router.post("/stock-takes/{take_id}/count")
def save_counts(take_id: int, body: TakeCountIn, db: Session = Depends(get_db),
                actor: User = Depends(requires("Inventory", "edit"))):
    take = db.get(StockTake, take_id)
    if not take:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Stock take not found")
    try:
        take = count_take(db, take, counted=[c.model_dump() for c in body.counts])
    except ValueError as e:
        raise _error(e)
    audit(db, actor=actor, action="count", entity_type="stock_take", entity_ref=take.take_no)
    return _tak_out(take)


@router.post("/stock-takes/{take_id}/reconcile")
def reconcile(take_id: int, db: Session = Depends(get_db),
              actor: User = Depends(requires("Inventory", "edit"))):
    take = db.get(StockTake, take_id)
    if not take:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Stock take not found")
    try:
        take = reconcile_take(db, take, actor=actor.username)
    except ValueError as e:
        raise _error(e)
    audit(db, actor=actor, action="reconcile", entity_type="stock_take", entity_ref=take.take_no)
    return _tak_out(take)