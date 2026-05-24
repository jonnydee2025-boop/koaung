import os
import signal
import threading
import time

from fastapi import APIRouter, HTTPException
from telegram import Update

from ...config import in_memory_log_handler, logger
from ...render_cleanup import cleanup_active_render
from ...sheets import get_status_statistics
import video_bot.state as state

router = APIRouter(tags=["system"])


@router.get("/stats")
def get_stats():
    try:
        counts = get_status_statistics()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    total = counts.get("total_rows", 0)
    done = counts.get("uploaded_to_yt", 0) + counts.get("done", 0)
    pending = counts.get("pending", 0) + counts.get("do", 0)
    scheduled = counts.get("scheduled", 0)
    processing = counts.get("processing", 0)
    failed = counts.get("failed", 0)
    success_rate = round(done / total * 100, 1) if total else 0.0

    return {
        "total": total,
        "done": done,
        "pending": pending,
        "scheduled": scheduled,
        "processing": processing,
        "failed": failed,
        "success_rate": success_rate,
    }


@router.get("/logs")
def get_logs(n: int = 120):
    lines = list(in_memory_log_handler.buffer)[-n:]
    return [{"time": line["time"], "level": line["level"], "msg": line["msg"]} for line in lines]


@router.post("/server/shutdown")
def shutdown_server():
    logger.warning("Admin panel requested FULL SERVER SHUTDOWN.")
    cleanup_active_render("Server shut down — render interrupted")

    def kill_soon() -> None:
        time.sleep(1)
        if os.name == "nt":
            if hasattr(signal, "CTRL_C_EVENT"):
                os.kill(os.getpid(), signal.CTRL_C_EVENT)
            else:
                os.kill(os.getpid(), signal.SIGTERM)
        else:
            os.kill(os.getpid(), signal.SIGTERM)

    threading.Thread(target=kill_soon, daemon=True).start()
    return {"shutting_down": True}


@router.get("/bot/status")
def get_bot_status():
    app_ref = state.telegram_app
    if app_ref is None:
        return {"online": False, "reason": "Not initialized"}
    updater = getattr(app_ref, "updater", None)
    running = getattr(updater, "running", False) if updater else False
    return {"online": running}


@router.post("/bot/stop")
async def stop_bot():
    app_ref = state.telegram_app
    if app_ref is None:
        raise HTTPException(status_code=503, detail="Bot not initialized.")
    updater = getattr(app_ref, "updater", None)
    if updater is None:
        raise HTTPException(status_code=503, detail="No updater found.")
    if not updater.running:
        return {"stopped": False, "reason": "Already stopped"}
    render_stopped = cleanup_active_render("Bot stopped — render interrupted")
    await updater.stop()
    logger.info("Admin panel: Telegram polling stopped.")
    return {"stopped": True, "render_interrupted": render_stopped}


@router.post("/bot/start")
async def start_bot():
    app_ref = state.telegram_app
    if app_ref is None:
        raise HTTPException(status_code=503, detail="Bot not initialized.")
    updater = getattr(app_ref, "updater", None)
    if updater is None:
        raise HTTPException(status_code=503, detail="No updater found.")
    if updater.running:
        return {"started": False, "reason": "Already running"}
    await updater.start_polling(allowed_updates=Update.ALL_TYPES)
    logger.info("Admin panel: Telegram polling started.")
    return {"started": True}
