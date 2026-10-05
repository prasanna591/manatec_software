"""Shared CSV/XLSX upload parsing.

Both the master-data imports (`imports.py`) and employee onboarding
(`admin.py`) accept a spreadsheet upload, so the parsing lives here rather than
being duplicated per router. Excel is optional: without pandas we still handle
CSV, which is what HR actually exports from the roster.
"""
from __future__ import annotations

import csv
import hashlib
import re
from io import BytesIO, StringIO

from fastapi import HTTPException, UploadFile

MAX_UPLOAD_BYTES = 8 * 1024 * 1024


def _cell(row: dict, *names: str) -> str:
    """First non-empty value among `names`, matched case- and space-insensitively.

    Spreadsheets are inconsistent about `Employee Code` vs `employee_code` vs
    `EmployeeCode`, so callers list the spellings they accept rather than
    forcing one canonical header.
    """
    for name in names:
        if name in row and str(row[name] or "").strip():
            return str(row[name]).strip()
    wanted = {n.lower().replace(" ", "").replace("_", "") for n in names}
    for key, value in row.items():
        if key is None:
            continue
        if key.lower().replace(" ", "").replace("_", "") in wanted and str(value or "").strip():
            return str(value).strip()
    return ""


def rows_from(upload: UploadFile) -> list[dict]:
    """Parse an uploaded CSV/XLSX into a list of dicts keyed by header text."""
    raw = upload.file.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "File too large")
    name = (upload.filename or "").lower()
    if name.endswith((".xlsx", ".xls")):
        try:
            import pandas as pd  # type: ignore[import-untyped]
        except ImportError as exc:  # pragma: no cover - optional dependency
            raise HTTPException(500, "pandas is not installed; upload a CSV instead") from exc
        df = pd.read_excel(BytesIO(raw), dtype=str).fillna("")
        return df.to_dict(orient="records")
    text = raw.decode("utf-8-sig", errors="replace")
    return [
        {(k or "").strip(): v for k, v in row.items() if k}
        for row in csv.DictReader(StringIO(text))
    ]


def guess_password(username: str) -> str:
    """Readable one-time password for an onboarded account.

    HR hands these out on paper, so a password a person can read aloud beats one
    they retype from a spreadsheet -- hence the username prefix rather than
    random characters. The numeric tail is derived per user (not a constant
    like a year) so two onboarded accounts never share one, and the account is
    expected to change it (FRS 20.1 account lifecycle).
    """
    base = re.sub(r"[^A-Za-z0-9]", "", username)[:8] or "user"
    tail = int(hashlib.sha256(username.encode()).hexdigest()[:6], 16) % 10000
    return f"{base}@{tail:04d}"
