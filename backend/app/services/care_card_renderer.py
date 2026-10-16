"""Deterministic white-background care/composition card renderer."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

WIDTH = 1200
HEIGHT = 1600
INK = "#171717"
MUTED = "#666666"
LINE = "#D9D9D9"

CARE_LABELS = {
    "hand_wash": "建议手洗",
    "machine_wash_gentle": "轻柔机洗",
    "do_not_wash": "不可水洗",
    "max_30": "最高水温 30℃",
    "dry_clean": "可干洗",
    "do_not_dry_clean": "不可干洗",
    "do_not_bleach": "不可漂白",
    "do_not_iron": "不可熨烫",
    "low_iron": "低温熨烫",
    "line_dry": "悬挂晾干",
    "do_not_tumble": "不可滚筒烘干",
}


def _font(size: int, bold: bool = False):
    candidates = [
        Path("C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc"),
        Path("C:/Windows/Fonts/simhei.ttf"),
        Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
    ]
    for path in candidates:
        if path.is_file():
            return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default(size=size)


def _centered(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], text: str, font, fill=INK):
    left, top, right, bottom = box
    bounds = draw.textbbox((0, 0), text, font=font)
    width = bounds[2] - bounds[0]
    height = bounds[3] - bounds[1]
    draw.text(((left + right - width) / 2, (top + bottom - height) / 2), text, font=font, fill=fill)


def _cross(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int]):
    left, top, right, bottom = box
    draw.line((left, top, right, bottom), fill=INK, width=7)
    draw.line((right, top, left, bottom), fill=INK, width=7)


def _care_icon(draw: ImageDraw.ImageDraw, code: str, box: tuple[int, int, int, int]):
    left, top, right, bottom = box
    cx = (left + right) // 2
    if code in {"hand_wash", "machine_wash_gentle", "do_not_wash", "max_30"}:
        basin = (left + 14, top + 35, right - 14, bottom - 18)
        draw.arc((basin[0], basin[1] - 28, basin[2], basin[1] + 18), 0, 180, fill=INK, width=6)
        draw.line((basin[0], basin[1], basin[0] + 8, basin[3], basin[2] - 8, basin[3], basin[2], basin[1]), fill=INK, width=6)
        if code == "max_30":
            _centered(draw, basin, "30", _font(30, True))
        elif code == "hand_wash":
            draw.line((cx - 8, top + 18, cx + 8, top + 62), fill=INK, width=8)
        elif code == "machine_wash_gentle":
            draw.line((left + 25, bottom - 8, right - 25, bottom - 8), fill=INK, width=5)
        else:
            _cross(draw, (left + 12, top + 10, right - 12, bottom - 8))
    elif code in {"dry_clean", "do_not_dry_clean"}:
        draw.ellipse((left + 18, top + 12, right - 18, bottom - 12), outline=INK, width=6)
        _centered(draw, box, "P", _font(38, True))
        if code == "do_not_dry_clean":
            _cross(draw, (left + 8, top + 8, right - 8, bottom - 8))
    elif code == "do_not_bleach":
        draw.polygon(((cx, top + 10), (right - 10, bottom - 12), (left + 10, bottom - 12)), outline=INK)
        draw.line((cx, top + 10, right - 10, bottom - 12, left + 10, bottom - 12, cx, top + 10), fill=INK, width=6)
        _cross(draw, (left + 8, top + 8, right - 8, bottom - 8))
    elif code in {"do_not_iron", "low_iron"}:
        draw.polygon(((left + 12, bottom - 20), (right - 10, bottom - 20), (right - 28, top + 28), (left + 38, top + 28)), outline=INK)
        draw.line((left + 12, bottom - 20, right - 10, bottom - 20, right - 28, top + 28, left + 38, top + 28, left + 12, bottom - 20), fill=INK, width=6)
        if code == "low_iron":
            draw.ellipse((cx - 4, bottom - 42, cx + 4, bottom - 34), fill=INK)
        else:
            _cross(draw, (left + 8, top + 8, right - 8, bottom - 8))
    elif code == "line_dry":
        draw.rectangle((left + 15, top + 12, right - 15, bottom - 12), outline=INK, width=6)
        draw.line((cx, top + 18, cx, bottom - 18), fill=INK, width=6)
    else:
        draw.rectangle((left + 15, top + 12, right - 15, bottom - 12), outline=INK, width=6)
        draw.ellipse((left + 38, top + 32, right - 38, bottom - 32), outline=INK, width=5)
        _cross(draw, (left + 8, top + 8, right - 8, bottom - 8))


def _wrapped_lines(draw: ImageDraw.ImageDraw, text: str, font, max_width: int) -> list[str]:
    lines: list[str] = []
    current = ""
    for char in text:
        candidate = current + char
        if current and draw.textlength(candidate, font=font) > max_width:
            lines.append(current)
            current = char
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines


def render_care_card(data: dict, output_path: Path) -> Path:
    image = Image.new("RGB", (WIDTH, HEIGHT), "white")
    draw = ImageDraw.Draw(image)
    title_font = _font(54, True)
    heading_font = _font(34, True)
    body_font = _font(30)
    small_font = _font(24)

    margin = 100
    y = 80
    brand = data.get("brand", "").strip()
    if brand:
        _centered(draw, (margin, y, WIDTH - margin, y + 48), brand, small_font, MUTED)
        y += 65
    _centered(draw, (margin, y, WIDTH - margin, y + 76), "商品成分与洗护说明", title_font)
    y += 105
    product_name = data.get("productName", "").strip()
    if product_name:
        _centered(draw, (margin, y, WIDTH - margin, y + 48), product_name, body_font, MUTED)
        y += 75
    draw.line((margin, y, WIDTH - margin, y), fill=INK, width=3)
    y += 45

    draw.text((margin, y), "面料成分", font=heading_font, fill=INK)
    y += 64
    composition = data["composition"]
    composition_columns = 2 if len(composition) > 4 else 1
    composition_rows = (len(composition) + composition_columns - 1) // composition_columns
    composition_width = (WIDTH - margin * 2) // composition_columns
    for index, part in enumerate(composition):
        column = index // composition_rows
        row = index % composition_rows
        left = margin + column * composition_width
        row_y = y + row * 48
        draw.text((left + 18, row_y), part["name"], font=body_font, fill=INK)
        value = f"{part['percent']:g}%"
        value_width = draw.textlength(value, font=body_font)
        draw.text((left + composition_width - 18 - value_width, row_y), value, font=body_font, fill=INK)
    y += composition_rows * 48
    y += 18
    draw.line((margin, y, WIDTH - margin, y), fill=LINE, width=2)
    y += 42

    draw.text((margin, y), "洗护方式", font=heading_font, fill=INK)
    y += 72
    cell_width = (WIDTH - margin * 2) // 3
    for index, code in enumerate(data["instructions"]):
        row, column = divmod(index, 3)
        cell_left = margin + column * cell_width
        cell_top = y + row * 155
        _care_icon(draw, code, (cell_left + 78, cell_top, cell_left + cell_width - 78, cell_top + 82))
        _centered(
            draw,
            (cell_left, cell_top + 88, cell_left + cell_width, cell_top + 132),
            CARE_LABELS[code],
            small_font,
        )
    instruction_rows = (len(data["instructions"]) + 2) // 3
    y += max(1, instruction_rows) * 155 + 5

    warnings = [item.strip() for item in data.get("warnings", []) if item.strip()]
    if warnings:
        draw.line((margin, y, WIDTH - margin, y), fill=LINE, width=2)
        y += 38
        draw.text((margin, y), "注意事项", font=heading_font, fill=INK)
        y += 62
        for warning in warnings:
            for line_index, line in enumerate(_wrapped_lines(draw, warning, small_font, WIDTH - margin * 2 - 40)):
                prefix = "• " if line_index == 0 else "  "
                draw.text((margin + 10, y), prefix + line, font=small_font, fill=MUTED)
                y += 40
            y += 8

    footer = "请以商品实物洗标为准"
    _centered(draw, (margin, HEIGHT - 105, WIDTH - margin, HEIGHT - 55), footer, small_font, MUTED)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(output_path, format="PNG", optimize=True)
    return output_path
