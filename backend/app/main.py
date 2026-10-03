from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routers import (
    admin,
    analyzer,
    announcements,
    atp,
    attendance,
    audit,
    auth,
    bom,
    catalog,
    dashboard,
    guests,
    imports,
    integration,
    inventory,
    leave,
    notifications,
    procurement,
    production,
    quotes,
    search,
    stores,
    tasks,
)

log = logging.getLogger("manatec")


@asynccontextmanager
async def lifespan(app: FastAPI):
    from .seed import init_db

    init_db()
    log.info("Manatec platform ready")
    yield


settings = get_settings()
app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)

# Dev: open CORS so Vite (5173) and Expo can call the API. Lock down in prod (FRS 20.1).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API = "/api/v1"
for r in (
    auth,
    admin,
    integration,
    notifications,
    tasks,
    dashboard,
    audit,
    search,
    stores,
    catalog,
    inventory,
    bom,
    atp,
    procurement,
    production,
    quotes,
    analyzer,
    imports,
    attendance,
    leave,
    guests,
    announcements,
):
    app.include_router(r.router, prefix=API)


@app.get("/health", tags=["monitoring"])
def health():
    return {"status": "ok", "app": settings.app_name, "version": app.version}


@app.get("/", tags=["monitoring"])
def root():
    return {"app": settings.app_name, "docs": "/docs", "health": "/health"}