"""legacy-v2 确定性提示词组装：基础不变性规则 + 品类规则 + 镜头规则。"""
from __future__ import annotations

import json
from pathlib import Path
from functools import lru_cache
from typing import Literal

from ..config import PROJECT_ROOT

TaskType = Literal["flat", "detail", "partial", "model"]
TEMPLATE_PATH = PROJECT_ROOT / "asset-library" / "prompt-templates" / "legacy-v2.json"
CALIBRATION_PATH = (
    PROJECT_ROOT / "asset-library" / "prompt-templates" / "example-calibration-v1.json"
)


@lru_cache(maxsize=1)
def _templates() -> dict:
    return json.loads(TEMPLATE_PATH.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def calibration_profile() -> dict:
    return json.loads(CALIBRATION_PATH.read_text(encoding="utf-8"))


def legacy_prompts() -> dict:
    """暴露旧版已验证提示词，供 API 预览与二次精修流程复用。"""
    data = _templates().copy()
    data.pop("output", None)
    data.pop("qualityGates", None)
    data["calibration"] = calibration_profile()
    return data


def _product_facts(
    item_name: str,
    category_name: str,
    focus: str,
    color_material: str,
    selling_points: str,
    category_group: str = "",
) -> str:
    facts = [
        f"Item name: {item_name}",
        f"Category: {category_name}",
        f"Required focus: {focus}",
    ]
    if category_group:
        facts.insert(1, f"Primary category: {category_group}")
    if color_material:
        facts.append(f"Color / material record: {color_material}")
    if selling_points:
        facts.append(f"Selling-point record: {selling_points}")
    return "\n".join(facts)


def _rule_block(title: str, value: str) -> str:
    return f"{title}: {value}" if value else ""


def _custom_prompt_block(value: str) -> str:
    if not value.strip():
        return ""
    return (
        "User-specified generation instructions (apply without overriding the authoritative "
        "product, locked structure, outfit, identity, or reference-role constraints above): "
        f"{value.strip()}"
    )


def _calibration_block(task_type: TaskType) -> str:
    profile = calibration_profile()
    rules = profile["safeguards"][task_type]
    return (
        f"Evidence-calibrated safeguards ({profile['id']}):\n- "
        + "\n- ".join(rules)
    )


def calibrated_negative_prompt() -> str:
    return " ".join(calibration_profile()["negativeAdditions"])


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
    outfit_context: str = "",
    reference_context: str = "",
    category_group: str = "",
    structure_context: str = "",
    custom_prompt: str = "",
) -> str:
    template = _templates()
    facts = _product_facts(
        item_name, category_name, focus, color_material, selling_points, category_group
    )
    category_rule = _rule_block("Category display rules", model_hint)
    shot_rule = _rule_block("Shot rules", shot_hint)

    if task_type == "flat":
        parts = [
            template["flatBase"],
            f"Product record (authoritative, never contradict):\n{facts}",
            category_rule,
            shot_rule,
            _rule_block("Locked garment structure facts", structure_context),
            _rule_block("Additional project references", reference_context),
            _calibration_block(task_type),
            _custom_prompt_block(custom_prompt),
        ]
        return "\n\n".join(part for part in parts if part)

    if task_type == "model":
        identity = f"Model identity: {model_name or 'use the locked v2 reference image'}"
        parts = [
            template["modelBase"],
            f"Product record (authoritative, never contradict):\n{facts}\n{identity}",
            _rule_block("Complete outfit manifest", outfit_context),
            (
                "Outfit completion rule: use only the garments listed in the manifest. "
                "When an upper or lower base layer is explicitly marked missing, fill only that gap "
                "with the supplied logo-free light-stone cropped sports tank or charcoal "
                "high-waisted yoga shorts only. "
                "Never invent an outer coat, accessory, pattern, logo, or product detail, and never "
                "cover the sellable garment."
            ),
            category_rule,
            shot_rule,
            _rule_block("Locked garment structure facts", structure_context),
            _rule_block("Additional project references", reference_context),
            _calibration_block(task_type),
            _custom_prompt_block(custom_prompt),
        ]
        return "\n\n".join(part for part in parts if part)

    if task_type == "partial":
        identity = f"Model identity: {model_name or 'use the locked model reference image'}"
        parts = [
            "。".join((
                "电商服饰模特上身商品特写，必须是模特真实穿着或佩戴后的重新生成画面，不得从全身图裁切或放大",
                f"单品：{item_name}",
                f"品类：{category_name}",
                f"一级分类：{category_group}" if category_group else "",
                f"展示重点：{focus}",
                "画面紧裁到目标商品及必要的人体连接区域，商品占画面主体，姿态自然、像素清晰",
                "严格保留参考商品的结构、比例、颜色、纹理、五金和标识，不添加不存在的细节",
            )),
            identity,
            _rule_block("Complete outfit manifest", outfit_context),
            (
                "缺失搭配只允许使用随请求提供的无标识浅石灰短款露脐运动背心或"
                "深灰高腰瑜伽短裤补齐，"
                "不得添加外套或饰品，不得遮挡目标商品。"
            ),
            category_rule,
            shot_rule,
            _rule_block("Locked garment structure facts", structure_context),
            _rule_block("Additional project references", reference_context),
            _calibration_block(task_type),
            _custom_prompt_block(custom_prompt),
        ]
        if color_material:
            parts.insert(1, f"颜色/材质：{color_material}")
        if selling_points:
            parts.insert(2, f"卖点：{selling_points}")
        return "\n\n".join(part for part in parts if part)

    base = "电商服饰细节图，微距展示重点部位，材质纹理清晰，浅灰渐变背景"
    parts = [
        "。".join((
            base,
            f"单品：{item_name}",
            f"品类：{category_name}",
            f"一级分类：{category_group}" if category_group else "",
            f"展示重点：{focus}",
            "严格保留参考商品的结构、比例、颜色、纹理和标识，不添加不存在的细节",
        )),
        category_rule,
        shot_rule,
        _rule_block("Locked garment structure facts", structure_context),
        _rule_block("Additional project references", reference_context),
        _calibration_block(task_type),
        _custom_prompt_block(custom_prompt),
    ]
    if color_material:
        parts.insert(1, f"颜色/材质：{color_material}")
    if selling_points:
        parts.insert(2, f"卖点：{selling_points}")
    return "\n\n".join(part for part in parts if part)
