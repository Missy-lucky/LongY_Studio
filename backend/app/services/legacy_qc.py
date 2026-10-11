"""旧版平面图流程中已验证的确定性预处理与 QC。

来源：Model/脚本/1-批量生成平面图.py。这里只做无 API、无副作用的原件读取，
所有输出写入调用方指定的 storage 工作目录。
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import numpy as np
from PIL import Image, ImageDraw, ImageFile, ImageOps

try:  # 可选：支持 iPhone 原图 HEIC / HEIF
    from pillow_heif import register_heif_opener

    register_heif_opener()
except ImportError:
    pass

ImageFile.LOAD_TRUNCATED_IMAGES = True

Size = tuple[int, int]
OutputKind = Literal["upload", "evidence"]

FLAT_SIZE: Size = (1536, 1536)
BORDER_WHITE_MIN = 0.97
FOREGROUND_COVERAGE_MIN = 0.08
FOREGROUND_COVERAGE_MAX = 0.88
MARGIN_PX = 16


@dataclass(frozen=True)
class PreparedInputs:
    upload_path: Path
    evidence_path: Path

    def as_dict(self) -> dict[str, str]:
        return {
            "uploadPath": str(self.upload_path),
            "evidencePath": str(self.evidence_path),
        }


def load_rgb(path: Path) -> Image.Image:
    with Image.open(path) as image:
        return ImageOps.exif_transpose(image).convert("RGB")


def image_dimensions(path: Path) -> tuple[int, int]:
    with Image.open(path) as image:
        return image.size


def normalize_flat_output(path: Path, size: Size = FLAT_SIZE) -> Path:
    """把平面图结果规范为固定 PNG 尺寸；不修改原始素材。"""
    image = load_rgb(path)
    if image.size != size:
        image = image.resize(size, Image.Resampling.LANCZOS)
    path = path.with_suffix(".png")
    image.save(path, format="PNG", optimize=True)
    return path


def inspect_image(
    path: Path,
    expected_size: Size | int | None = FLAT_SIZE,
    *,
    border_white_min: float = BORDER_WHITE_MIN,
    coverage_min: float = FOREGROUND_COVERAGE_MIN,
    coverage_max: float = FOREGROUND_COVERAGE_MAX,
    margin_px: int = MARGIN_PX,
) -> dict[str, object]:
    """旧版平面图像素 QC：尺寸、白边、主体覆盖率、边界安全框。"""
    if isinstance(expected_size, int):
        expected_size = (expected_size, expected_size)
    with Image.open(path) as image:
        image.load()
        width, height = image.size
        array = np.asarray(image.convert("RGB")).astype(np.int16)

    border = np.concatenate(
        [array[0, :], array[-1, :], array[:, 0], array[:, -1]], axis=0
    )
    foreground = np.max(np.abs(array - 255), axis=2) > 25
    ys, xs = np.where(foreground)
    border_white = float(np.mean(np.min(border, axis=1) >= 242))
    coverage = float(foreground.mean())
    bbox = (
        [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]
        if len(xs) and len(ys)
        else []
    )
    size_passed = expected_size is None or (width, height) == expected_size
    bounds_passed = bool(
        bbox
        and bbox[0] >= margin_px
        and bbox[1] >= margin_px
        and bbox[2] <= width - margin_px - 1
        and bbox[3] <= height - margin_px - 1
    )
    passed = bool(
        size_passed
        and border_white >= border_white_min
        and coverage_min <= coverage <= coverage_max
        and bounds_passed
    )
    issues: list[str] = []
    if not size_passed:
        issues.append("size")
    if border_white < border_white_min:
        issues.append("border")
    if not coverage_min <= coverage <= coverage_max:
        issues.append("coverage")
    if not bounds_passed:
        issues.append("bounds")
    return {
        "width": width,
        "height": height,
        "borderWhite": round(border_white, 4),
        "foregroundCoverage": round(coverage, 4),
        "foregroundBBox": bbox,
        "sizePassed": bool(size_passed),
        "passed": passed,
        "issues": issues,
    }


def correlation(left: Path, right: Path) -> float:
    """精修图与已审底图的结构相关性，防止重绘漂移。"""
    a = np.asarray(
        Image.open(left).convert("L").resize((256, 256), Image.Resampling.LANCZOS),
        dtype=np.float32,
    )
    b = np.asarray(
        Image.open(right).convert("L").resize((256, 256), Image.Resampling.LANCZOS),
        dtype=np.float32,
    )
    return float(np.corrcoef(a.ravel(), b.ravel())[0, 1])


def prepare_upload(source: Path, output: Path, max_size: int = 2400) -> Path:
    output.parent.mkdir(parents=True, exist_ok=True)
    image = load_rgb(source)
    image.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
    image.save(output, format="JPEG", quality=96, optimize=True)
    return output


def prepare_evidence(upload: Path, output: Path) -> Path:
    """生成 4 格高清证据图：整图 + 上中下三段，供二次精修对齐细节。"""
    output.parent.mkdir(parents=True, exist_ok=True)
    image = Image.open(upload).convert("RGB")
    width, height = image.size
    cells = [image.copy()]
    thirds = [
        (0, height // 3),
        (height // 3, 2 * height // 3),
        (2 * height // 3, height),
    ]
    for top, bottom in thirds:
        crop = image.crop((0, top, width, bottom))
        crop = crop.resize(
            (1200, max(1, round(1200 * crop.height / crop.width))),
            Image.Resampling.LANCZOS,
        )
        cells.append(crop)

    cell_w, cell_h = 1120, 860
    sheet = Image.new("RGB", (cell_w * 4 + 100, cell_h * 2 + 110), "white")
    drawer = ImageDraw.Draw(sheet)
    for index, cell in enumerate(cells):
        cell.thumbnail((cell_w, cell_h), Image.Resampling.LANCZOS)
        x = 40 + (index % 4) * (cell_w + 20)
        y = 50 + (index // 4) * (cell_h + 30)
        sheet.paste(cell, (x, y))
        drawer.rectangle(
            (x, y, x + cell.width, y + cell.height), outline=(205, 205, 205), width=2
        )
        drawer.text((x, y - 25), f"DETAIL {index}", fill=(0, 0, 0))
    sheet.save(output, format="JPEG", quality=96, optimize=True)
    return output


def prepare_plan_view_inputs(source: Path, work_dir: Path) -> PreparedInputs:
    upload = prepare_upload(source, work_dir / "01-upload.jpg")
    evidence = prepare_evidence(upload, work_dir / "02-detail-evidence.jpg")
    return PreparedInputs(upload_path=upload, evidence_path=evidence)
