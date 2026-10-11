"""legacy-v2 确定性提示词组装：基础不变性规则 + 品类规则 + 镜头规则。"""
from __future__ import annotations

import json
from pathlib import Path
from functools import lru_cache
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


def _rule_block(title: str, value: str) -> str:
    return f"{title}: {value}" if value else ""


def build_prompt(
    task_type: TaskType,
    item_name: str,
    category_name: str,
    focus: str,
    color_material: str = "",
    selling_points: str = "",
    model_name: str | None = None,
    model_hint: str = "",
    shot_hint: str = "",
) -> str:
    template = _templates()
    facts = _product_facts(item_name, category_name, focus, color_material, selling_points)
    category_rule = _rule_block("Category display rules", model_hint)
    shot_rule = _rule_block("Shot rules", shot_hint)

    if task_type == "flat":
        parts = [
            template["flatBase"],
            f"Product record (authoritative, never contradict):\n{facts}",
            category_rule,
            shot_rule,
        ]
        return "\n\n".join(part for part in parts if part)

    if task_type == "model":
        identity = f"Model identity: {model_name or 'use the locked v2 reference image'}"
        parts = [
            template["modelBase"],
            f"Product record (authoritative, never contradict):\n{facts}\n{identity}",
            category_rule,
            shot_rule,
        ]
        return "\n\n".join(part for part in parts if part)

    base = {
        "detail": "电商服饰细节图，微距展示重点部位，材质纹理清晰，浅灰渐变背景",
        "partial": "电商服饰局部大面积展示图，保留搭配关系，自然过渡，突出商品区域",
    }[task_type]
    parts = [
        "。".join((
            base,
            f"单品：{item_name}",
            f"品类：{category_name}",
            f"展示重点：{focus}",
            "严格保留参考商品的结构、比例、颜色、纹理和标识，不添加不存在的细节",
        )),
        category_rule,
        shot_rule,
    ]
    if color_material:
        parts.insert(1, f"颜色/材质：{color_material}")
    if selling_points:
        parts.insert(2, f"卖点：{selling_points}")
    return "\n\n".join(part for part in parts if part)
