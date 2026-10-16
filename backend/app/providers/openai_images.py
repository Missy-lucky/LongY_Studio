"""Official OpenAI Images API provider (text generation and multi-image edits)."""
from __future__ import annotations

import base64
import mimetypes
import threading
import time
from contextlib import ExitStack
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


def _error(response: httpx.Response | None, message: str) -> GenerateError:
    status = response.status_code if response is not None else 0
    normalized = message.lower()
    if status == 401:
        return GenerateError("AUTHENTICATION_FAILED", "OpenAI API Key 无效或已失效", "重新配置 API Key", False)
    if status == 429 and any(token in normalized for token in ("quota", "billing", "insufficient")):
        return GenerateError("QUOTA_EXCEEDED", "OpenAI 账户额度不足", "充值或切换 Provider", False)
    if status == 429:
        return GenerateError("RATE_LIMITED", "OpenAI 请求频率受限", "稍后重试或降低并发", True)
    if status in {400, 403} and any(token in normalized for token in ("safety", "moderation", "policy")):
        return GenerateError("CONTENT_REJECTED", "OpenAI 内容审核拒绝了请求", "调整素材或提示词", False)
    if status >= 500 or not response:
        return GenerateError("PROVIDER_UNAVAILABLE", "OpenAI 服务暂时不可用", "稍后重试或切换 Provider", True)
    return GenerateError("IMAGE_EDIT_FAILED", f"OpenAI 请求失败（HTTP {status}）", "检查参数与调用日志", False)


class OpenAIImagesProvider(ImageProvider):
    id = "openai"
    name = "OpenAI Images API"
    supported_tiers = ("draft", "hd")
    price_per_image = {"draft": 0.0, "hd": 0.0}
    rate_limit_per_min = 8
    max_retries = 1
    capabilities = {
        "textToImage": True, "imageEdit": True, "maskEdit": True,
        "maxReferenceImages": 16, "customBaseUrl": True, "local": False,
    }

    @property
    def available(self) -> bool:
        return bool(load_api_key(self.id))

    @staticmethod
    def _size(req: GenerateRequest) -> str:
        width, height = req.output_width or 1024, req.output_height or 1024
        if height > width * 1.1:
            return "1024x1536"
        if width > height * 1.1:
            return "1536x1024"
        return "1024x1024"

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
                on_error(GenerateError("API_KEY_MISSING", "缺少 OpenAI API Key", "在 Provider 设置中配置", False))
                return
            references = [_reference_path(value) for value in req.reference_paths[:16] if value]
            if any(not path.is_file() for path in references):
                on_error(GenerateError("REFERENCE_MISSING", "存在无法读取的参考图", "重新导入素材", False))
                return
            mask = Path(req.mask_path) if req.mask_path else None
            if mask and not mask.is_file():
                on_error(GenerateError("MASK_MISSING", "蒙版文件不存在", "重新框选局部重绘区域", False))
                return

            started = time.time()
            output_dir = settings.data_dir / "projects" / req.task_id / "generated"
            output_dir.mkdir(parents=True, exist_ok=True)
            output = output_dir / f"openai-{idempotency_key[:12] or req.task_id}.png"
            prompt = req.prompt
            if req.negative_prompt.strip():
                prompt += f"\nAvoid: {req.negative_prompt.strip()}"
            model = provider_setting(self.id, "model", "gpt-image-2.5-sunburst")
            base_url = provider_setting(self.id, "baseUrl", "https://api.openai.com/v1").rstrip("/")
            response: httpx.Response | None = None
            try:
                on_stage("submit", f"OpenAI {model} 提交中")
                with httpx.Client(timeout=httpx.Timeout(420.0), headers={"Authorization": f"Bearer {key}"}) as client:
                    active["client"] = client
                    if references:
                        with ExitStack() as stack:
                            files = [
                                (
                                    "image[]",
                                    (path.name, stack.enter_context(path.open("rb")), mimetypes.guess_type(path.name)[0] or "image/png"),
                                )
                                for path in references
                            ]
                            if mask:
                                files.append(("mask", (mask.name, stack.enter_context(mask.open("rb")), "image/png")))
                            response = client.post(
                                f"{base_url}/images/edits",
                                data={
                                    "model": model,
                                    "prompt": prompt,
                                    "quality": "medium" if req.tier == "draft" else "high",
                                    "size": self._size(req),
                                    "output_format": "png",
                                },
                                files=files,
                            )
                    else:
                        response = client.post(f"{base_url}/images/generations", json={
                            "model": model,
                            "prompt": prompt,
                            "quality": "medium" if req.tier == "draft" else "high",
                            "size": self._size(req),
                            "output_format": "png",
                        })
                active["client"] = None
                if cancelled.is_set():
                    return
                if not response.is_success:
                    on_error(_error(response, response.text[-1600:]))
                    return
                data = response.json()
                encoded = (data.get("data") or [{}])[0].get("b64_json")
                if not encoded:
                    on_error(GenerateError("OUTPUT_MISSING", "OpenAI 未返回图片数据", "重试或切换模型", True))
                    return
                output.write_bytes(base64.b64decode(encoded, validate=True))
            except (httpx.HTTPError, OSError, ValueError) as exc:
                if not cancelled.is_set():
                    on_error(_error(response, str(exc)))
                return
            finally:
                active["client"] = None

            on_stage("write", "OpenAI 结果已写入本地")
            on_complete(GenerateResult(str(output), 0.0, int((time.time() - started) * 1000)))

        threading.Thread(target=run, name=f"openai-{req.task_id}", daemon=True).start()
        return Cancellable(req.task_id, cancel)
