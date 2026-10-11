"""Prompt and reference composition for the dedicated HD repair stage."""
from __future__ import annotations

import json
from pathlib import Path

from ..config import PROJECT_ROOT

TEMPLATE_PATH = PROJECT_ROOT / "asset-library" / "prompt-templates" / "legacy-v2.json"


def detail_repair_prompt(task_type: str) -> str:
    templates = json.loads(TEMPLATE_PATH.read_text(encoding="utf-8"))
    if task_type == "flat":
        return templates["flatRetouch"]

    return (
        "Image 1 is the approved base image and must define the exact composition, garment placement, "
        "body pose, camera angle, framing, background, and margins. Image 2 is the authoritative garment "
        "reference. Image 3 is the locked model identity reference when present. Do not rearrange, redraw, "
        "reframe, or replace the subject. Perform a high-detail production repair pass: restore fabric weave, "
        "knit texture, stitching, seams, buttons, zippers, pockets, logo placement, thread direction, and material "
        "thickness. For model images, repair hands and fingers anatomically, preserve the exact face identity, "
        "hairline, body proportions, skin texture, and natural pores. Enhance only microscopic detail and realistic "
        "surface continuity. Keep the original lighting, color balance, exposure, white background, and composition "
        "unchanged. No invented details, accessories, text, logos, collage panels, or new garments."
    )
