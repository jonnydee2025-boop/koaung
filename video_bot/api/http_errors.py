"""Map domain exceptions to FastAPI HTTP responses."""

from fastapi import HTTPException


def http_error_from_value(exc: ValueError) -> HTTPException:
    msg = str(exc)
    if "not found" in msg.lower():
        return HTTPException(status_code=404, detail=msg)
    if "already used" in msg.lower() or "processing" in msg.lower():
        return HTTPException(status_code=409, detail=msg)
    return HTTPException(status_code=400, detail=msg)
