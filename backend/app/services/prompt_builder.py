"""确定性提示词组装：旧版 v2 定稿提示词进入正式规则库。"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Literal

from ..config import PROJECT_ROOT

TaskType = Literal["flat", "detail", "partial", "model"]
TEMPLATE_PATH = PROJECT_ROOT / "asset-library" / "prompt-templates" / "legacy-v2.json"


@lru_cache(maxsize=1)
def _templates() -> dict:
    return json.loads(TEMPLATE_PATH.read_text(encoding="utf-8"))


def legacy_prompts() -> dict:
    """暴露旧版已验证提示词，供 API 预览与二次精修流程复用。"""
    data = _templates().copy()
    data.pop("output", None)
    data.pop("qualityGates", None)
    return data


def _product_facts(
    item_name: str,
    category_name: str,
    focus: str,
    color_material: str,
    selling_points: str,
) -> str:
    facts = [
        f"Item name: {item_name}",
        f"Category: {category_name}",
        f"Required focus: {focus}",
    ]
    if color_material:
        facts.append(f"Color / material record: {color_material}")
    if selling_points:
        facts.append(f"Selling-point record: {selling_points}")
    return "\n".join(facts)


def build_prompt(
    task_type: TaskType,
    item_name: str,
    category_name: str,
    focus: str,
    color_material: str = "",
    selling_points: str = "",
    model_name: str | None = None,
    model_hint: str = "",
) -> str:
    template = _templates()
    facts = _product_facts(
        item_name, category_name, focus, color_material, selling_points
    )

    if task_type == "flat":
        return f"{template['flatBase']}\n\nProduct record (authoritative, never contradict):\n{facts}"
    if task_type == "model":
        identity = f"Model identity: {model_name or 'use the locked v2 reference image'}"
        hints = f"\nCategory display rules: {model_hint}" if model_hint else ""
        return (
            f"{template['modelBase']}\n\nProduct record (authoritative, never contradict):\n"
            f"{facts}\n{identity}{hints}"
        )

    base = {
        "detail": "电商服饰细节图，微距展示重点部位，材质纹理清晰，浅灰渐变背景",
        "partial": "电商服饰局部大面积展示图，保留搭配关系，自然过渡，突出商品区域",
    }[task_type]
    parts = [base, f"单品：{item_name}", f"品类：{category_name}", f"展示重点：{focus}"]
    if color_material:
        parts.append(f"颜色/材质：{color_material}")
    if selling_points:
        parts.append(f"卖点：{selling_points}")
    parts.append("严格保留参考商品的结构、比例、颜色、纹理和标识，不添加不存在的细节")
    return "。".join(parts)
