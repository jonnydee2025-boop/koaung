"""FastAPI application factory for the VideoBot admin panel."""

from fastapi import APIRouter, Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from ..api_auth import verify_admin_api_key
from ..config import ADMIN_API_CORS_ORIGINS
from .routes import jobs, render, settings, system

API_PREFIX = "/api"


def create_app() -> FastAPI:
    application = FastAPI(title="VideoBot Admin API", version="1.0.0")
    application.add_middleware(
        CORSMiddleware,
        allow_origins=ADMIN_API_CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @application.get(f"{API_PREFIX}/health")
    def health_check():
        return {"ok": True}

    protected = APIRouter(
        prefix=API_PREFIX,
        dependencies=[Depends(verify_admin_api_key)],
    )
    protected.include_router(jobs.router)
    protected.include_router(render.router)
    protected.include_router(settings.router)
    protected.include_router(system.router)
    application.include_router(protected)
    return application


app = create_app()
