"""Extract a reviewable care-label draft from an image; never auto-publish facts."""
from __future__ import annotations

import base64
import json
import mimetypes
from pathlib import Path

import httpx

from .provider_config import load_api_key, provider_setting

INSTRUCTION_CODES = [
    "hand_wash", "machine_wash_gentle", "do_not_wash", "max_30",
    "dry_clean", "do_not_dry_clean", "do_not_bleach", "do_not_iron",
    "low_iron", "line_dry", "do_not_tumble",
]

EXTRACTION_SCHEMA = {
    "type": "object",
    "properties": {
        "labelDetected": {"type": "boolean"},
        "brand": {"type": "string"},
        "productName": {"type": "string"},
        "composition": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "percent": {"type": "number", "minimum": 0, "maximum": 100},
                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                },
                "required": ["name", "percent", "confidence"],
                "additionalProperties": False,
            },
        },
        "instructions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "code": {"type": "string", "enum": INSTRUCTION_CODES},
                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                },
                "required": ["code", "confidence"],
                "additionalProperties": False,
            },
        },
        "warnings": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                },
                "required": ["text", "confidence"],
                "additionalProperties": False,
            },
        },
        "rawText": {"type": "array", "items": {"type": "string"}},
        "uncertainFields": {"type": "array", "items": {"type": "string"}},
    },
    "required": [
        "labelDetected", "brand", "productName", "composition", "instructions",
        "warnings", "rawText", "uncertainFields",
    ],
    "additionalProperties": False,
}

PROMPT = """读取这张商品商标或水洗标，只提取图片中明确可见的信息并输出 JSON。
禁止根据服装外观、常识或品牌猜测任何成分、比例、洗护方式或商品名。
看不清的字段返回空字符串或空数组，并把字段名加入 uncertainFields。
先逐行转录可见文字到 rawText，再提取品牌、商品名、面料成分百分比、注意事项。
洗护图标只允许映射到给定 code；不确定的图标不要输出。confidence 范围 0 到 1。
如果图片不是商标或水洗标，labelDetected=false，其他提取字段返回空值。"""


class CareLabelExtractionError(RuntimeError):
    def __init__(self, code: str, message: str, suggestion: str):
        super().__init__(message)
        self.code = code
        self.message = message
        self.suggestion = suggestion


def _image_data_url(path: Path) -> str:
    mime = mimetypes.guess_type(path.name)[0] or "image/png"
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"


def _output_text(response: dict) -> str:
    for item in response.get("output", []):
        if item.get("type") != "message":
            continue
        for content in item.get("content", []):
            if content.get("type") == "refusal":
                raise CareLabelExtractionError("CONTENT_REJECTED", "识别请求被内容策略拒绝", "更换清晰、完整的标签图片")
            if content.get("type") == "output_text" and content.get("text"):
                return content["text"]
    raise CareLabelExtractionError("OUTPUT_MISSING", "识别服务未返回结构化结果", "重试或切换识别 Provider")


def _normalize(value: dict) -> dict:
    detected = bool(value.get("labelDetected"))
    if not detected:
        return {
            "labelDetected": False, "brand": "", "productName": "", "composition": [],
            "instructions": [], "warnings": [], "rawText": value.get("rawText", []),
            "uncertainFields": sorted(set([*value.get("uncertainFields", []), "label"])),
        }
    composition = []
    for item in value.get("composition", [])[:8]:
        name = str(item.get("name", "")).strip()
        percent = float(item.get("percent", 0))
        if name and 0 < percent <= 100:
            composition.append({
                "name": name, "percent": percent,
                "confidence": max(0.0, min(1.0, float(item.get("confidence", 0)))),
            })
    instructions = []
    seen_codes: set[str] = set()
    for item in value.get("instructions", []):
        code = item.get("code")
        if code in INSTRUCTION_CODES and code not in seen_codes:
            seen_codes.add(code)
            instructions.append({
                "code": code,
                "confidence": max(0.0, min(1.0, float(item.get("confidence", 0)))),
            })
    warnings = [
        {"text": str(item.get("text", "")).strip()[:40],
         "confidence": max(0.0, min(1.0, float(item.get("confidence", 0))))}
        for item in value.get("warnings", [])[:3]
        if str(item.get("text", "")).strip()
    ]
    uncertain = {str(item) for item in value.get("uncertainFields", []) if str(item).strip()}
    total = sum(item["percent"] for item in composition)
    if composition and abs(total - 100) > 0.1:
        uncertain.add("compositionTotal")
    for item in composition:
        if item["confidence"] < 0.8:
            uncertain.add("composition")
    for item in instructions:
        if item["confidence"] < 0.8:
            uncertain.add("instructions")
    for item in warnings:
        if item["confidence"] < 0.8:
            uncertain.add("warnings")
    return {
        "labelDetected": True,
        "brand": str(value.get("brand", "")).strip()[:80],
        "productName": str(value.get("productName", "")).strip()[:80],
        "composition": composition,
        "instructions": instructions,
        "warnings": warnings,
        "rawText": [str(item).strip() for item in value.get("rawText", []) if str(item).strip()][:30],
        "uncertainFields": sorted(uncertain),
    }


def extract_care_label(image_path: Path, provider_id: str) -> dict:
    if provider_id not in {"openai", "volcengine-ark"}:
        raise CareLabelExtractionError("PROVIDER_UNSUPPORTED", "该 Provider 不支持水洗标识别", "选择 OpenAI 或火山方舟")
    key = load_api_key(provider_id)
    if not key:
        raise CareLabelExtractionError("API_KEY_MISSING", "识别 Provider 尚未配置 API Key", "先在 Provider 设置中配置")
    if provider_id == "openai":
        base_url = provider_setting(provider_id, "baseUrl", "https://api.openai.com/v1").rstrip("/")
        model = provider_setting(provider_id, "visionModel", "gpt-4o-mini")
    else:
        base_url = provider_setting(provider_id, "baseUrl", "https://ark.cn-beijing.volces.com/api/v3").rstrip("/")
        model = provider_setting(provider_id, "visionModel", "doubao-seed-2-1-pro-260915")
    payload = {
        "model": model,
        "store": False,
        "input": [{
            "role": "user",
            "content": [
                {"type": "input_text", "text": PROMPT},
                {"type": "input_image", "image_url": _image_data_url(image_path), "detail": "high"},
            ],
        }],
        "text": {"format": {
            "type": "json_schema", "name": "care_label_extraction",
            "description": "Visible facts extracted from a garment care label",
            "strict": True, "schema": EXTRACTION_SCHEMA,
        }},
    }
    if provider_id == "volcengine-ark":
        payload["thinking"] = {"type": "disabled"}
    try:
        response = httpx.post(
            f"{base_url}/responses", json=payload,
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            timeout=120.0,
        )
    except httpx.HTTPError as exc:
        raise CareLabelExtractionError("PROVIDER_UNAVAILABLE", f"识别服务不可用：{exc}", "稍后重试或切换 Provider") from exc
    if response.status_code == 401:
        raise CareLabelExtractionError("AUTHENTICATION_FAILED", "识别 Provider 的 API Key 无效", "重新配置 API Key")
    if response.status_code == 429:
        raise CareLabelExtractionError("RATE_LIMITED", "识别请求受限或额度不足", "稍后重试、充值或切换 Provider")
    if not response.is_success:
        raise CareLabelExtractionError("EXTRACTION_FAILED", f"识别请求失败（HTTP {response.status_code}）", "检查模型 ID 或切换 Provider")
    try:
        decoded = json.loads(_output_text(response.json()))
        if not isinstance(decoded, dict):
            raise TypeError("structured output root is not an object")
        return {"provider": provider_id, "model": model, "draft": _normalize(decoded)}
    except (json.JSONDecodeError, AttributeError, TypeError, ValueError) as exc:
        raise CareLabelExtractionError("OUTPUT_INVALID", "识别结果不是有效的结构化数据", "重试或切换识别模型") from exc
