from fastapi import APIRouter, BackgroundTasks, HTTPException

from ..render_runner import queue_admin_render
from ...render_cleanup import cleanup_active_render
from ...state import current_render, is_render_busy

router = APIRouter(tags=["render"])


@router.get("/render-status")
def get_render_status():
    return dict(current_render)


@router.post("/render-next")
async def trigger_render_next(background_tasks: BackgroundTasks):
    return await queue_admin_render(background_tasks)


@router.post("/render-cancel")
def cancel_render():
    if not is_render_busy():
        return {"cancelled": False, "reason": "No render is running"}

    try:
        cleaned = cleanup_active_render("Cancelled by user")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"cancelled": cleaned}
