from __future__ import annotations

import logging
import os
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import get_settings
from .errors import (
    http_exception_handler,
    unhandled_exception_handler,
    validation_exception_handler,
)
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
    machines,
    notifications,
    procurement,
    production,
    quality,
    quotes,
    search,
    stores,
    tasks,
    visits,
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


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    # Accept a client-supplied id (mobile sends X-Request-ID) or mint one, echo
    # it back on the response, and let error handlers read it from request.state.
    rid = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12]
    request.state.request_id = rid
    response = await call_next(request)
    response.headers["X-Request-ID"] = rid
    return response


# Standard error envelope (AGENT.md §6) for every failure path. Registered on
# the starlette base class so both fastapi.HTTPException and starlette's 404
# routing exceptions are wrapped.
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)

# Dev: explicit origins so browsers accept credentialed requests (cookies /
# Authorization header). `allow_origins=["*"]` combined with
# `allow_credentials=True` is rejected by the Same Origin Policy, so a
# wildcard must never be used here. Lock down in prod (FRS 20.1).
# Extra origins can be added via CORS_ALLOW_ORIGINS="https://a.example,https://b.example".
_DEV_ORIGINS = [
    "http://localhost:8099",
    "http://127.0.0.1:8099",
    # Expo web / Metro
    "http://localhost:8081",
    "http://127.0.0.1:8081",
    "http://localhost:19000",
    "http://127.0.0.1:19000",
    "http://localhost:19006",
    "http://127.0.0.1:19006",
    # Vite (web/)
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
_EXTRA_ORIGINS = [
    o.strip() for o in os.getenv("CORS_ALLOW_ORIGINS", "").split(",") if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_DEV_ORIGINS + _EXTRA_ORIGINS,
    # LAN dev (physical device via Expo Go, e.g. http://192.168.1.20:8081).
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?",
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
    visits,
    quality,
    machines,
):
    app.include_router(r.router, prefix=API)


@app.get("/health", tags=["monitoring"])
def health():
    return {"status": "ok", "app": settings.app_name, "version": app.version}


@app.get("/", tags=["monitoring"])
def root():
    return {"app": settings.app_name, "docs": "/docs", "health": "/health"}