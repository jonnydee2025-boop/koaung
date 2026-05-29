"""Admin API authentication for FastAPI routes."""

from fastapi import Header, HTTPException, Security
from fastapi.security import APIKeyHeader, APIKeyQuery

from .config import ADMIN_API_KEY

_api_key_header = APIKeyHeader(name="X-Admin-Key", auto_error=False)
_api_key_query = APIKeyQuery(name="admin_key", auto_error=False)


async def verify_admin_api_key(
    x_admin_key: str | None = Security(_api_key_header),
    admin_key: str | None = Security(_api_key_query),
    authorization: str | None = Header(default=None),
) -> None:
    token = x_admin_key or admin_key
    if not token and authorization:
        scheme, _, value = authorization.partition(" ")
        if scheme.lower() == "bearer" and value:
            token = value

    if not token or token != ADMIN_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing admin API key.")
