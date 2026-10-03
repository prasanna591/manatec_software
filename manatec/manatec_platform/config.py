"""Manatec platform — configuration."""

from __future__ import annotations

import os
import secrets
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"

# Switch DATABASE_URL to "postgresql+psycopg://user:pass@host/db" for production.
DATABASE_URL = os.environ.get(
    "MANATEC_DB_URL",
    f"sqlite:///{DATA_DIR / 'manatec_platform.db'}",
)

JWT_SECRET = os.environ.get(
    "MANATEC_JWT_SECRET",
    (DATA_DIR / "jwt_secret.txt").read_text().strip()
    if (DATA_DIR / "jwt_secret.txt").exists()
    else None,
)
if not JWT_SECRET:
    DATA_DIR.mkdir(exist_ok=True)
    JWT_SECRET = secrets.token_urlsafe(48)
    (DATA_DIR / "jwt_secret.txt").write_text(JWT_SECRET, encoding="utf-8")

JWT_ALGO = "HS256"
JWT_TTL_HOURS = int(os.environ.get("MANATEC_JWT_TTL_HOURS", "24"))

CATALOG_JSON = DATA_DIR / "catalog_manatec.json"
PARTS_INTEL_CSV = DATA_DIR / "parts_intelligence.csv"

SAMPLE_INVENTORY = BASE_DIR / "sample_manatec_inventory.csv"
SAMPLE_BOM = BASE_DIR / "sample_manatec_master_bom.csv"

# Default admin created at first seed.
ADMIN_USERNAME = os.environ.get("MANATEC_ADMIN_USER", "admin")
ADMIN_PASSWORD = os.environ.get("MANATEC_ADMIN_PASSWORD", "admin123")

ROLES = ["admin", "stores", "purchase", "production", "sales", "viewer"]

# Lead-time fallback (days) when nothing else is known for an item.
DEFAULT_LEAD_DAYS = 20
LEAD_TIME_CLASS_BY_SOURCE = {
    "short": 7,
    "medium": 20,
    "long": 45,
}