from __future__ import annotations

import os
from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Manatec Digital Operations Platform"
    # FRS 20.1; default dev DB is SQLite, prod uses Postgres via DATABASE_URL
    database_url: str = "sqlite:///./manatec.db"
    jwt_secret: str = os.getenv("JWT_SECRET", "dev-secret-change-me")
    jwt_algorithm: str = "HS256"
    token_expire_hours: int = 8          # FRS 5.3 access token
    refresh_expire_days: int = 14        # FRS 5.3 refresh token
    mock_erp_items: int = 54             # size of mock ERP catalogue (real captured components)
    sync_interval_minutes: int = 15      # FRS 18.5 stock default
    seed_demo: bool = True               # demo users/tasks for the UI-first phase


@lru_cache
def get_settings() -> Settings:
    return Settings()