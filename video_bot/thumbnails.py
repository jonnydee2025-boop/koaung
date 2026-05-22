from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from .config import FONT_PATH, THUMBNAIL_TEMPLATE
from .drive import download_row_thumbnail_image
from .row_rules import get_rule_for_row


def wrap_text(
    draw: ImageDraw.ImageDraw,
    text: str,
    font: ImageFont.ImageFont,
    max_width: int,
) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""

    for word in words:
        candidate = f"{current} {word}".strip()
        bbox = draw.textbbox((0, 0), candidate, font=font)
        if bbox[2] - bbox[0] <= max_width or not current:
            current = candidate
        else:
            lines.append(current)
            current = word

    if current:
        lines.append(current)

    return lines


def load_font(size: int) -> ImageFont.ImageFont:
    if FONT_PATH:
        return ImageFont.truetype(FONT_PATH, size)

    for candidate in (
        "C:/Windows/Fonts/arialbd.ttf",
        "C:/Windows/Fonts/arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ):
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)

    return ImageFont.load_default()


def generate_thumbnail(title: str, output_path: Path) -> None:
    image = Image.open(THUMBNAIL_TEMPLATE).convert("RGB")
    draw = ImageDraw.Draw(image)
    width, height = image.size
    box_width = int(width * 0.82)
    box_left = (width - box_width) // 2
    box_top = int(height * 0.58)
    max_box_height = int(height * 0.28)

    font_size = max(36, int(height * 0.075))
    font = load_font(font_size)
    lines = wrap_text(draw, title, font, box_width)

    while lines and font_size > 24:
        line_height = int(font_size * 1.2)
        total_height = line_height * len(lines)
        widest = max(
            draw.textbbox((0, 0), line, font=font)[2]
            - draw.textbbox((0, 0), line, font=font)[0]
            for line in lines
        )
        if total_height <= max_box_height and widest <= box_width:
            break
        font_size -= 4
        font = load_font(font_size)
        lines = wrap_text(draw, title, font, box_width)

    line_height = int(font_size * 1.2)
    total_height = line_height * len(lines)
    y = box_top + (max_box_height - total_height) // 2

    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font)
        line_width = bbox[2] - bbox[0]
        x = box_left + (box_width - line_width) // 2
        stroke = max(2, font_size // 16)
        draw.text(
            (x, y),
            line,
            font=font,
            fill=(255, 255, 255),
            stroke_width=stroke,
            stroke_fill=(0, 0, 0),
        )
        y += line_height

    image.save(output_path, "JPEG", quality=92)


def generate_thumbnail_for_row(row_number: int, title: str, output_path: Path) -> str:
    """
    Use mapped Drive thumbnail when configured; otherwise render from template + title.
    Returns a short source label for logs.
    """
    rule = get_rule_for_row(row_number)
    if rule and rule.thumbnail_file_id:
        source_path = output_path.with_name(f"drive_thumb_src{output_path.suffix}")
        label = download_row_thumbnail_image(source_path, row_number)
        prepare_thumbnail_image(source_path, output_path)
        source_path.unlink(missing_ok=True)
        return label
    generate_thumbnail(title, output_path)
    return "Generated from template"


def prepare_thumbnail_image(input_path: Path, output_path: Path) -> None:
    image = Image.open(input_path).convert("RGB")
    image.thumbnail((1280, 720), Image.Resampling.LANCZOS)

    canvas = Image.new("RGB", (1280, 720), (0, 0, 0))
    left = (1280 - image.width) // 2
    top = (720 - image.height) // 2
    canvas.paste(image, (left, top))
    canvas.save(output_path, "JPEG", quality=92)

