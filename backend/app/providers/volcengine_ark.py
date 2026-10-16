"""Volcengine Ark / Doubao Seedream image provider using the official HTTP API."""
from __future__ import annotations

import base64
import mimetypes
import threading
import time
from pathlib import Path

import httpx

from ..config import PROJECT_ROOT, settings
from ..services.provider_config import load_api_key, provider_setting
from .base import Cancellable, GenerateError, GenerateRequest, GenerateResult, ImageProvider


def _reference_path(value: str) -> Path:
    path = Path(value)
    if path.is_absolute():
        return path
    if path.parts and path.parts[0] == "asset-library":
        return PROJECT_ROOT / path
    return settings.data_dir / path


def _data_url(path: Path) -> str:
    mime = mimetypes.guess_type(path.name)[0] or "image/png"
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"


def _error(response: httpx.Response | None, message: str) -> GenerateError:
    status = response.status_code if response is not None else 0
    normalized = message.lower()
    if status == 401 or "authentication" in normalized:
        return GenerateError("AUTHENTICATION_FAILED", "火山方舟 API Key 无效或已失效", "重新配置 API Key", False)
    if status == 429 and any(token in normalized for token in ("quota", "balance", "insufficient")):
        return GenerateError("QUOTA_EXCEEDED", "火山方舟账户额度不足", "充值或切换 Provider", False)
    if status == 429:
        return GenerateError("RATE_LIMITED", "火山方舟请求频率受限", "稍后重试或降低并发", True)
    if any(token in normalized for token in ("safety", "risk", "content policy")):
        return GenerateError("CONTENT_REJECTED", "火山方舟内容审核拒绝了请求", "调整素材或提示词", False)
    if status >= 500 or not response:
        return GenerateError("PROVIDER_UNAVAILABLE", "火山方舟服务暂时不可用", "稍后重试或切换 Provider", True)
    return GenerateError("IMAGE_EDIT_FAILED", f"火山方舟请求失败（HTTP {status}）", "检查模型 ID、参数和调用日志", False)


class VolcengineArkProvider(ImageProvider):
    id = "volcengine-ark"
    name = "豆包 Seedream（火山方舟）"
    supported_tiers = ("draft", "hd")
    price_per_image = {"draft": 0.0, "hd": 0.0}
    rate_limit_per_min = 8
    max_retries = 1
    capabilities = {
        "textToImage": True, "imageEdit": True, "maskEdit": False,
        "maxReferenceImages": 10, "customBaseUrl": True, "local": False,
    }

    @property
    def available(self) -> bool:
        return bool(load_api_key(self.id))

    def generate(self, req, on_stage, on_complete, on_error, idempotency_key):
        cancelled = threading.Event()
        active: dict[str, httpx.Client | None] = {"client": None}

        def cancel() -> None:
            cancelled.set()
            client = active.get("client")
            if client:
                client.close()

        def run() -> None:
            key = load_api_key(self.id)
            if not key:
                on_error(GenerateError("API_KEY_MISSING", "缺少火山方舟 API Key", "在 Provider 设置中配置", False))
                return
            if req.mask_path:
                on_error(GenerateError(
                    "CAPABILITY_UNSUPPORTED", "当前 Seedream 适配器不支持蒙版重绘",
                    "切换 OpenAI/OpenRouter，或改用提示词重生成", False,
                ))
                return
            references = [_reference_path(value) for value in req.reference_paths[:10] if value]
            if any(not path.is_file() for path in references):
                on_error(GenerateError("REFERENCE_MISSING", "存在无法读取的参考图", "重新导入素材", False))
                return

            started = time.time()
            output_dir = settings.data_dir / "projects" / req.task_id / "generated"
            output_dir.mkdir(parents=True, exist_ok=True)
            output = output_dir / f"ark-{idempotency_key[:12] or req.task_id}.png"
            model = provider_setting(self.id, "model", "doubao-seedream-5-0-lite-260128")
            base_url = provider_setting(
                self.id, "baseUrl", "https://ark.cn-beijing.volces.com/api/v3",
            ).rstrip("/")
            prompt = req.prompt
            if req.negative_prompt.strip():
                prompt += f"\n避免出现：{req.negative_prompt.strip()}"
            payload = {
                "model": model,
                "prompt": prompt,
                "size": "1K" if req.tier == "draft" else "2K",
                "sequential_image_generation": "disabled",
                "response_format": "b64_json",
                "output_format": "png",
                "watermark": False,
            }
            if references:
                payload["image"] = [_data_url(path) for path in references]
            response: httpx.Response | None = None
            try:
                on_stage("submit", f"火山方舟 {model} 提交中")
                with httpx.Client(timeout=httpx.Timeout(420.0), headers={
                    "Authorization": f"Bearer {key}", "Content-Type": "application/json",
                }) as client:
                    active["client"] = client
                    response = client.post(f"{base_url}/images/generations", json=payload)
                active["client"] = None
                if cancelled.is_set():
                    return
                if not response.is_success:
                    on_error(_error(response, response.text[-1600:]))
                    return
                data = response.json()
                item = (data.get("data") or [{}])[0]
                encoded = item.get("b64_json")
                if encoded:
                    output.write_bytes(base64.b64decode(encoded, validate=True))
                elif item.get("url"):
                    on_stage("download", "下载火山方舟生成结果")
                    with httpx.Client(timeout=120.0) as client:
                        downloaded = client.get(item["url"])
                        downloaded.raise_for_status()
                        output.write_bytes(downloaded.content)
                else:
                    on_error(GenerateError("OUTPUT_MISSING", "火山方舟未返回图片数据", "重试或切换模型", True))
                    return
            except (httpx.HTTPError, OSError, ValueError) as exc:
                if not cancelled.is_set():
                    on_error(_error(response, str(exc)))
                return
            finally:
                active["client"] = None

            on_stage("write", "火山方舟结果已写入本地")
            on_complete(GenerateResult(str(output), 0.0, int((time.time() - started) * 1000)))

        threading.Thread(target=run, name=f"ark-{req.task_id}", daemon=True).start()
        return Cancellable(req.task_id, cancel)
