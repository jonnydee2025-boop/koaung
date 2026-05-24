"""Build sheet log lines after YouTube upload."""


def build_upload_log_message(
    video_id: str,
    *,
    privacy: str,
    private_reason: str | None = None,
    thumbnail_warning: str = "",
) -> str:
    if privacy == "public":
        return (
            f"Uploaded publicly to YouTube. video_id={video_id}\n"
            "Thumbnail uploaded."
        )

    reason = private_reason or "kept private"
    log_message = f"Uploaded privately to YouTube ({reason}). video_id={video_id}"
    if thumbnail_warning and private_reason != f"thumbnail failed: {thumbnail_warning}":
        return f"{log_message}\n{thumbnail_warning}"
    return log_message
