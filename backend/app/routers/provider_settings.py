"""Local Provider configuration. Secrets are kept in Windows Credential Manager."""
from __future__ import annotations

from pathlib import Path
from typing import Literal
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator

from ..providers import list_providers
from ..services.provider_config import (
    api_key_source,
    delete_api_key,
    load_api_key,
    read_provider_settings,
    save_api_key,
    write_provider_settings,
)
from ..services.provider_diagnostics import diagnose_provider

router = APIRouter()
ProviderId = Literal["openai", "volcengine-ark", "openrouter-icu", "comfyui"]

DEFAULTS = {
    "openai": {
        "model": "gpt-image-2.5-sunburst", "visionModel": "gpt-4o-mini",
        "baseUrl": "https://api.openai.com/v1",
        "maxBatchImages": 4, "maxEstimatedCostPerBatch": 0,
        "pricePerImageDraft": 0, "pricePerImageHd": 0,
    },
    "volcengine-ark": {
        "model": "doubao-seedream-5-0-lite-260128",
        "visionModel": "doubao-seed-2-1-pro-260915",
        "baseUrl": "https://ark.cn-beijing.volces.com/api/v3",
        "maxBatchImages": 4, "maxEstimatedCostPerBatch": 0,
        "pricePerImageDraft": 0, "pricePerImageHd": 0,
    },
    "openrouter-icu": {
        "model": "gpt-image-2.5", "baseUrl": "https://tokenadvent.com",
        "cliPath": "tools/openrouter_icu_image.py", "maxBatchImages": 4,
        "maxEstimatedCostPerBatch": 0, "pricePerImageDraft": 0, "pricePerImageHd": 0,
    },
    "comfyui": {
        "baseUrl": "http://127.0.0.1:8188", "workflowPath": "", "maxBatchImages": 20,
        "maxEstimatedCostPerBatch": 0, "pricePerImageDraft": 0, "pricePerImageHd": 0,
    },
}


class ProviderSettingsIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    api_key: str | None = Field(default=None, max_length=1280, alias="apiKey")
    clear_api_key: bool = Field(default=False, alias="clearApiKey")
    model: str | None = Field(default=None, max_length=160)
    vision_model: str | None = Field(default=None, max_length=160, alias="visionModel")
    base_url: str | None = Field(default=None, max_length=500, alias="baseUrl")
    workflow_path: str | None = Field(default=None, max_length=1000, alias="workflowPath")
    cli_path: str | None = Field(default=None, max_length=1000, alias="cliPath")
    max_batch_images: int | None = Field(default=None, ge=1, le=100, alias="maxBatchImages")
    max_estimated_cost_per_batch: float | None = Field(default=None, ge=0, le=100000, alias="maxEstimatedCostPerBatch")
    price_per_image_draft: float | None = Field(default=None, ge=0, le=100000, alias="pricePerImageDraft")
    price_per_image_hd: float | None = Field(default=None, ge=0, le=100000, alias="pricePerImageHd")

    @model_validator(mode="after")
    def validate_url(self):
        if self.base_url:
            parsed = urlparse(self.base_url)
            if parsed.scheme not in {"http", "https"} or not parsed.netloc:
                raise ValueError("Provider 地址必须是有效的 HTTP(S) URL")
        if self.max_estimated_cost_per_batch and not (
            (self.price_per_image_draft or 0) > 0 or (self.price_per_image_hd or 0) > 0
        ):
            raise ValueError("启用费用上限前，请至少填写一个非零单张估价")
        return self


def _view(provider_id: str, stored: dict, provider_rows: dict[str, dict]) -> dict:
    values = {**DEFAULTS[provider_id], **stored.get(provider_id, {})}
    row = provider_rows.get(provider_id, {})
    source = api_key_source(provider_id) if provider_id != "comfyui" else "none"
    values.update({
        "id": provider_id,
        "apiKeyConfigured": bool(load_api_key(provider_id)) if provider_id != "comfyui" else False,
        "apiKeySource": source,
        "available": bool(row.get("available")),
        "capabilities": row.get("capabilities", {}),
    })
    return values


@router.get("")
def get_provider_settings() -> dict:
    stored = read_provider_settings()
    rows = {item["id"]: item for item in list_providers()}
    return {"providers": [_view(provider_id, stored, rows) for provider_id in DEFAULTS]}


@router.put("/{provider_id}")
def update_provider_settings(provider_id: ProviderId, body: ProviderSettingsIn) -> dict:
    if body.clear_api_key:
        delete_api_key(provider_id)
    if body.api_key is not None and body.api_key.strip():
        try:
            save_api_key(provider_id, body.api_key)
        except (OSError, RuntimeError, ValueError) as exc:
            raise HTTPException(500, f"API Key 安全存储失败：{exc}") from exc

    values = body.model_dump(
        by_alias=True,
        exclude={"api_key", "clear_api_key"},
        exclude_none=True,
    )
    if provider_id == "comfyui" and values.get("workflowPath"):
        path = Path(values["workflowPath"])
        if not path.is_absolute():
            raise HTTPException(400, "ComfyUI 工作流必须使用绝对路径")
    allowed = {
        "openai": {"model", "visionModel", "baseUrl", "maxBatchImages", "maxEstimatedCostPerBatch", "pricePerImageDraft", "pricePerImageHd"},
        "volcengine-ark": {"model", "visionModel", "baseUrl", "maxBatchImages", "maxEstimatedCostPerBatch", "pricePerImageDraft", "pricePerImageHd"},
        "openrouter-icu": {"model", "baseUrl", "cliPath", "maxBatchImages", "maxEstimatedCostPerBatch", "pricePerImageDraft", "pricePerImageHd"},
        "comfyui": {"baseUrl", "workflowPath", "maxBatchImages", "maxEstimatedCostPerBatch", "pricePerImageDraft", "pricePerImageHd"},
    }[provider_id]
    stored = write_provider_settings(provider_id, {
        key: value for key, value in values.items() if key in allowed
    })
    rows = {item["id"]: item for item in list_providers()}
    return {"provider": _view(provider_id, {provider_id: stored}, rows)}


@router.post("/{provider_id}/diagnose")
def diagnose_provider_settings(provider_id: ProviderId) -> dict:
    return {"diagnostic": diagnose_provider(provider_id)}
