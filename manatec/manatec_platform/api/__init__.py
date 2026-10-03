"""API v1 router aggregation."""

from __future__ import annotations

from fastapi import APIRouter

from . import atp, auth, bom, catalog, dashboard, imports, inventory, ops, procurement

api_router = APIRouter(prefix="/api/v1")

for mod in (auth, catalog, inventory, bom, atp, procurement, ops, dashboard, imports):
    api_router.include_router(mod.router)