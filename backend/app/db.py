from __future__ import annotations

import logging

import sqlalchemy as sa
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings

log = logging.getLogger("manatec")


class Base(DeclarativeBase):
    pass


def _engine():
    url = get_settings().database_url
    kwargs = {"connect_args": {"check_same_thread": False}} if url.startswith("sqlite") else {}
    return create_engine(url, **kwargs)


engine = _engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def _add_missing_columns() -> None:
    """Bring an older SQLite DB up to date with model columns (dev-only).

    ``create_all()`` creates missing *tables* but never alters existing ones,
    so a model column added in a later commit silently 500s every SELECT
    against the old file. Only columns SQLite can add via ``ALTER TABLE`` are
    handled — nullable columns and NOT NULL columns that carry a default;
    anything else is logged and left for a real migration.
    """
    if not get_settings().database_url.startswith("sqlite"):
        return
    from . import models  # noqa: F401 register tables on Base.metadata

    Base.metadata.create_all(bind=engine)
    dialect = sa.dialects.sqlite.dialect()
    insp = sa.inspect(engine)
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            existing = {c["name"] for c in insp.get_columns(table.name)}
            for col in table.columns:
                if col.name in existing:
                    continue
                if not col.nullable and col.server_default is None and col.default is None:
                    log.warning(
                        "Cannot auto-migrate NOT NULL column %s.%s — re-seed the dev DB",
                        table.name,
                        col.name,
                    )
                    continue
                ddl = f'ALTER TABLE "{table.name}" ADD COLUMN {col.name} {col.type.compile(dialect)}'
                if col.server_default is not None:
                    dflt = col.server_default.arg
                    ddl += f" DEFAULT {dflt if isinstance(dflt, str) else dflt.compile(dialect)}"
                conn.execute(sa.text(ddl))
                log.info("Added missing column %s.%s", table.name, col.name)


def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()