import logging
import os
import shutil
from collections import deque
from pathlib import Path

from dotenv import load_dotenv


load_dotenv()


class _InMemoryLogHandler(logging.Handler):
    """Keeps the last `maxlen` log records in memory for the /api/logs endpoint."""

    _formatter = logging.Formatter(datefmt="%H:%M:%S")

    def __init__(self, maxlen: int = 500) -> None:
        super().__init__()
        self.buffer: deque[dict] = deque(maxlen=maxlen)

    def emit(self, record: logging.LogRecord) -> None:
        level_map = {
            logging.DEBUG: "DEBUG",
            logging.INFO: "INFO",
            logging.WARNING: "WARNING",
            logging.ERROR: "ERROR",
            logging.CRITICAL: "ERROR",
        }
        level_name = level_map.get(record.levelno, "INFO")
        msg = record.getMessage()
        if any(kw in msg for kw in ("uploaded", "complete", "Done", "Upload complete")):
            level_name = "SUCCESS"
        self.buffer.append({
            "time": self._formatter.formatTime(record, datefmt="%H:%M:%S"),
            "level": level_name,
            "msg": msg,
        })


in_memory_log_handler = _InMemoryLogHandler(maxlen=500)

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s | %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("video_automation_bot")
logger.addHandler(in_memory_log_handler)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("telegram").setLevel(logging.WARNING)
logging.getLogger("googleapiclient.discovery_cache").setLevel(logging.ERROR)

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.force-ssl",
    "https://www.googleapis.com/auth/drive.readonly",
]


def env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default

    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "y", "on"}:
        return True
    if normalized in {"0", "false", "no", "n", "off"}:
        return False

    raise ValueError(f"{name} must be true or false. Current value: {value!r}")


BOT_TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
ADMIN_CHAT_ID = int(os.environ["TELEGRAM_ADMIN_CHAT_ID"])
SPREADSHEET_ID = os.environ["GOOGLE_SHEET_ID"]
SHEET_NAME = os.getenv("GOOGLE_SHEET_NAME", "Sheet1")
BACKGROUND_VIDEO_DRIVE_FOLDER = os.getenv("BACKGROUND_VIDEO_DRIVE_FOLDER", "")
GOOGLE_CLIENT_SECRET_FILE = Path(
    os.getenv("GOOGLE_CLIENT_SECRET_FILE", "client_secret.json")
).resolve()
GOOGLE_TOKEN_FILE = Path(os.getenv("GOOGLE_TOKEN_FILE", "token.json")).resolve()
TMP_ROOT = Path(os.getenv("TMP_ROOT", "tmp_video_jobs")).resolve()
ROW_RULES_PATH = Path(os.getenv("ROW_RULES_PATH", "row_range_rules.json")).resolve()
FFMPEG_BIN = os.getenv("FFMPEG_BIN", "ffmpeg")
FFPROBE_BIN = os.getenv("FFPROBE_BIN", "ffprobe")
ENABLE_AUDIO_ENHANCE = env_bool("ENABLE_AUDIO_ENHANCE", True)
BACKGROUND_VIDEO_EXTENSIONS = {".mp4", ".mov", ".mkv", ".webm"}
API_PORT = int(os.getenv("API_PORT", "8000"))
API_HOST = os.getenv("API_HOST", "0.0.0.0")
SCHEDULE_CHECK_INTERVAL_SECONDS = max(
    10,
    int(os.getenv("SCHEDULE_CHECK_INTERVAL_SECONDS", "30")),
)
ADMIN_API_KEY = os.environ["ADMIN_API_KEY"]
ADMIN_API_CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "ADMIN_API_CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash").strip()

MENU_RENDER_NEXT = "menu:render_next"
MENU_VIEW_STATS = "menu:view_stats"
MENU_SETTINGS = "menu:settings"
MENU_STOP = "menu:stop"


def validate_startup() -> None:
    if not ADMIN_API_KEY.strip():
        raise ValueError("ADMIN_API_KEY must be set to a non-empty secret.")
    if not GOOGLE_CLIENT_SECRET_FILE.exists() and not GOOGLE_TOKEN_FILE.exists():
        raise FileNotFoundError(
            "Google OAuth file missing. Add client_secret.json or an existing token.json."
        )
    for binary in missing_media_binaries():
        logger.warning(
            "Cannot find required media binary: %s. The admin API can start, "
            "but rendering is disabled until this path is fixed.",
            binary,
        )


def binary_exists(binary: str) -> bool:
    return shutil.which(binary) is not None or Path(binary).exists()


def missing_media_binaries() -> list[str]:
    return [binary for binary in (FFMPEG_BIN, FFPROBE_BIN) if not binary_exists(binary)]


def validate_media_binaries() -> None:
    missing = missing_media_binaries()
    if missing:
        raise FileNotFoundError(
            "Cannot find required media binary/binaries: " + ", ".join(missing)
        )
