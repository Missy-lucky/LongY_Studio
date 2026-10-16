"""Validate, render, and review user-confirmed garment structure facts."""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Mapping

from ..config import PROJECT_ROOT


FIELDS_PATH = PROJECT_ROOT / "asset-library" / "structure-fields.json"


@lru_cache(maxsize=1)
def structure_field_specs() -> list[dict[str, Any]]:
    data = json.loads(FIELDS_PATH.read_text(encoding="utf-8"))
    return list(data["fields"])


def normalize_structure_facts(raw: Mapping[str, Any] | None) -> dict[str, str]:
    if raw is None:
        return {}
    if not isinstance(raw, Mapping):
        raise ValueError("商品结构事实必须是对象")
    specs = {field["key"]: field for field in structure_field_specs()}
    unknown = sorted(set(raw) - set(specs))
    if unknown:
        raise ValueError(f"未知结构字段：{', '.join(unknown)}")
    normalized: dict[str, str] = {}
    for key, spec in specs.items():
        value = raw.get(key)
        if value is None or value == "":
            continue
        if not isinstance(value, str):
            raise ValueError(f"{spec['label']}必须是文本")
        clean = " ".join(value.split())
        if len(clean) > int(spec["maxLength"]):
            raise ValueError(f"{spec['label']}不能超过 {spec['maxLength']} 个字符")
        if clean:
            normalized[key] = clean
    return normalized


def render_structure_facts(raw: Mapping[str, Any] | None) -> str:
    facts = normalize_structure_facts(raw)
    if not facts:
        return ""
    labels = {field["key"]: field["label"] for field in structure_field_specs()}
    return "\n".join(f"- {labels[key]}: {value}" for key, value in facts.items())


def structure_review(raw: Mapping[str, Any] | None) -> dict[str, Any]:
    facts = normalize_structure_facts(raw)
    labels = {field["key"]: field["label"] for field in structure_field_specs()}
    return {
        "required": bool(facts),
        "status": "human_review_required" if facts else "not_applicable",
        "facts": [
            {"key": key, "label": labels[key], "expected": value}
            for key, value in facts.items()
        ],
        "note": (
            "自动像素指标不能可靠判断语义结构；锁定前须由用户对照原图确认。"
            if facts else "未记录结构事实。"
        ),
    }
