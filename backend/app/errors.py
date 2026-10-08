"""Standard API error contract (AGENT.md section 6).

Every error response has the shape::

    {
      "success": False,
      "detail": "<human message>",          # legacy field, kept for old clients
      "error": {
        "code": "DENIED",                   # stable machine code
        "message": "<human message>",
        "required_permission": "Purchase:approve",  # only on DENIED
        "current": {...},                   # only on CONFLICT (server truth)
        "retryable": False,
      },
      "meta": {"request_id": "<uuid>", "version": "v1"},
    }

Status -> code mapping (AGENT.md §6): 400/422 VALIDATION, 401 UNAUTH,
403 DENIED, 404 NOT_FOUND, 409 CONFLICT, 429 RATE_LIMITED, 500 SERVER,
503 UNAVAILABLE. Plain ``HTTPException`` raised anywhere is converted by
the handlers in ``main.py`` using the same table, so routers migrate
incrementally: switch to ``ApiError`` where extras are needed.
"""
from __future__ import annotations

import logging
import uuid
from typing import Any

from fastapi import HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

log = logging.getLogger("manatec")

# starlette renamed 422 UNPROCESSABLE_ENTITY -> UNPROCESSABLE_CONTENT; support both.
_422 = getattr(status, "HTTP_422_UNPROCESSABLE_CONTENT", None) or status.HTTP_422_UNPROCESSABLE_ENTITY

STATUS_TO_CODE: dict[int, str] = {
    status.HTTP_400_BAD_REQUEST: "VALIDATION",
    status.HTTP_401_UNAUTHORIZED: "UNAUTH",
    status.HTTP_403_FORBIDDEN: "DENIED",
    status.HTTP_404_NOT_FOUND: "NOT_FOUND",
    status.HTTP_409_CONFLICT: "CONFLICT",
    _422: "VALIDATION",
    status.HTTP_429_TOO_MANY_REQUESTS: "RATE_LIMITED",
    status.HTTP_500_INTERNAL_SERVER_ERROR: "SERVER",
    status.HTTP_503_SERVICE_UNAVAILABLE: "UNAVAILABLE",
}

API_VERSION = "v1"


class ApiError(HTTPException):
    """HTTPException with a stable machine code and optional extras."""

    def __init__(
        self,
        status_code: int,
        message: str,
        *,
        code: str | None = None,
        required_permission: str | None = None,
        current: dict[str, Any] | None = None,
        retryable: bool = False,
    ) -> None:
        super().__init__(status_code, message)
        self.code = code or STATUS_TO_CODE.get(status_code, "SERVER")
        self.required_permission = required_permission
        self.current = current
        self.retryable = retryable


def _request_id(request: Request) -> str:
    rid = getattr(request.state, "request_id", None)
    if rid:
        return str(rid)
    rid = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12]
    request.state.request_id = rid
    return str(rid)


def envelope(
    request: Request,
    status_code: int,
    message: str,
    *,
    code: str | None = None,
    required_permission: str | None = None,
    current: dict[str, Any] | None = None,
    retryable: bool = False,
) -> JSONResponse:
    err: dict[str, Any] = {
        "code": code or STATUS_TO_CODE.get(status_code, "SERVER"),
        "message": message,
        "retryable": retryable,
    }
    if required_permission:
        err["required_permission"] = required_permission
    if current is not None:
        err["current"] = current
    return JSONResponse(
        status_code=status_code,
        content={
            "success": False,
            "detail": message,  # legacy clients read this
            "error": err,
            "meta": {"request_id": _request_id(request), "version": API_VERSION},
        },
    )


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    if isinstance(exc, ApiError):
        return envelope(
            request,
            exc.status_code,
            str(exc.detail),
            code=exc.code,
            required_permission=exc.required_permission,
            current=exc.current,
            retryable=exc.retryable,
        )
    message = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
    return envelope(request, exc.status_code, message)


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    return envelope(
        request,
        _422,
        "Request failed validation",
        code="VALIDATION",
        current={"errors": exc.errors()},
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    log.exception("Unhandled error on %s %s", request.method, request.url.path, exc_info=exc)
    return envelope(request, status.HTTP_500_INTERNAL_SERVER_ERROR, "Internal server error")
