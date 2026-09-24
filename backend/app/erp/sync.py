"""ERP synchronization (FRS 18.3–18.5).

Pulls ERP masters into ERPObjCache with hash-based change detection and records
every run in SyncJob. The platform reads the cache, never the ERP directly.
"""
from __future__ import annotations

from typing import Callable

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import ERPObjCache, SyncJob
from .mock_erp import ERPAdapter, get_adapter, snapshot_hash

# entity -> (adapter method, key extractor)
ENTITIES: dict[str, tuple[str, Callable[[dict], str]]] = {
    "item": ("items", lambda r: r["code"]),
    "product": ("products", lambda r: r["code"]),
    "customer": ("customers", lambda r: r["code"]),
    "supplier": ("suppliers", lambda r: r["code"]),
    "bom": ("bom", lambda r: f"{r['product']}:{r['component']}"),
    "stock": ("stock", lambda r: f"{r['item']}@{r['warehouse']}"),
    "sales_order": ("sales_orders", lambda r: r["order_no"]),
    "production_order": ("production_orders", lambda r: r["order_no"]),
}


def sync_entity(db: Session, entity: str, adapter: ERPAdapter | None = None) -> SyncJob:
    adapter = adapter or get_adapter()
    method_name, key_of = ENTITIES[entity]
    rows = getattr(adapter, method_name)()
    changed = 0
    for row in rows:
        key = key_of(row)
        digest = snapshot_hash(row)
        cached = db.scalar(
            select(ERPObjCache).where(ERPObjCache.entity == entity, ERPObjCache.erp_key == key)
        )
        if cached is None:
            db.add(ERPObjCache(entity=entity, erp_key=key, snapshot=row, hash=digest))
            changed += 1
        elif cached.hash != digest:
            cached.snapshot = row
            cached.hash = digest
            changed += 1
    job = SyncJob(entity=entity, direction="inbound", status="ok", rows=changed)
    db.add(job)
    db.commit()
    return job


def sync_all(db: Session, entities: list[str] | None = None, adapter: ERPAdapter | None = None) -> list[SyncJob]:
    entity_names = entities or list(ENTITIES)
    try:
        return [sync_entity(db, e, adapter) for e in entity_names]
    except Exception as exc:  # FRS 18.4: failures recorded + surfaced
        job = SyncJob(entity=",".join(entity_names), direction="inbound", status="error", error=str(exc))
        db.add(job)
        db.commit()
        return [job]


def get_cached(db: Session, entity: str) -> list[dict]:
    rows = db.scalars(select(ERPObjCache).where(ERPObjCache.entity == entity)).all()
    return [r.snapshot for r in rows]


def health(db: Session) -> dict:
    out: dict[str, dict] = {}
    for entity in ENTITIES:
        last = db.scalar(
            select(SyncJob)
            .where(SyncJob.entity == entity, SyncJob.status == "ok")
            .order_by(SyncJob.ran_at.desc())
        )
        out[entity] = {
            "last_run": last.ran_at.isoformat() if last else None,
            "rows": last.rows if last else 0,
        }
    return out