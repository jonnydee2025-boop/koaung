from pathlib import Path

from PIL import Image

from .config import logger
from .drive import download_row_thumbnail_image
from .row_rules import get_rule_for_row, load_row_rules


def prepare_drive_thumbnail(
    output_path: Path,
    *,
    row_number: int,
    file_id: str,
    file_name: str = "",
) -> str | None:
    """Download and resize a Drive thumbnail from explicit file id (repeat jobs)."""
    thumb_id = (file_id or "").strip()
    if not thumb_id:
        return None

    source_path = output_path.with_name(f"drive_thumb_src{output_path.suffix}")
    label = download_row_thumbnail_image(
        source_path,
        row_number,
        file_id=thumb_id,
        file_name=file_name,
    )
    prepare_thumbnail_image(source_path, output_path)
    source_path.unlink(missing_ok=True)
    logger.info("Row %s: prepared thumbnail (%s)", row_number, label)
    return label


def prepare_row_thumbnail(row_number: int, output_path: Path) -> str | None:
    """
    Download and resize a Drive thumbnail when the row has a mapping.
    Returns a log label, or None if no thumbnail is configured for this row.
    """
    rule = get_rule_for_row(row_number)
    if not rule or not rule.thumbnail_file_id:
        matched = sum(1 for item in load_row_rules() if item.matches(row_number))
        logger.info(
            "Row %s: skipping thumbnail (%s matching rule(s), thumbnail_file_id empty)",
            row_number,
            matched,
        )
        return None

    source_path = output_path.with_name(f"drive_thumb_src{output_path.suffix}")
    label = download_row_thumbnail_image(
        source_path,
        row_number,
        file_id=rule.thumbnail_file_id,
        file_name=rule.thumbnail_name,
    )
    prepare_thumbnail_image(source_path, output_path)
    source_path.unlink(missing_ok=True)
    logger.info("Row %s: prepared thumbnail (%s)", row_number, label)
    return label


def prepare_thumbnail_image(input_path: Path, output_path: Path) -> None:
    image = Image.open(input_path).convert("RGB")
    image.thumbnail((1280, 720), Image.Resampling.LANCZOS)

    canvas = Image.new("RGB", (1280, 720), (0, 0, 0))
    left = (1280 - image.width) // 2
    top = (720 - image.height) // 2
    canvas.paste(image, (left, top))
    canvas.save(output_path, "JPEG", quality=92)
