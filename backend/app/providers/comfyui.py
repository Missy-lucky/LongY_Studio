"""Local ComfyUI HTTP provider driven by a versioned API-workflow JSON template."""
from __future__ import annotations

import json
import threading
import time
import uuid
from pathlib import Path
from urllib.parse import urlencode

import httpx

from ..config import PROJECT_ROOT, settings
from ..services.provider_config import provider_setting
from .base import Cancellable, GenerateError, GenerateRequest, GenerateResult, ImageProvider


def _reference_path(value: str) -> Path:
    path = Path(value)
    if path.is_absolute():
        return path
    if path.parts and path.parts[0] == "asset-library":
        return PROJECT_ROOT / path
    return settings.data_dir / path


def _replace(value, variables: dict[str, object]):
    if isinstance(value, dict):
        return {key: _replace(item, variables) for key, item in value.items()}
    if isinstance(value, list):
        return [_replace(item, variables) for item in value]
    if not isinstance(value, str):
        return value
    if value in variables:
        return variables[value]
    result = value
    for token, replacement in variables.items():
        result = result.replace(token, str(replacement))
    return result


class ComfyUIProvider(ImageProvider):
    id = "comfyui"
    name = "本地 ComfyUI"
    supported_tiers = ("draft", "hd")
    price_per_image = {"draft": 0.0, "hd": 0.0}
    rate_limit_per_min = 60
    max_retries = 0
    capabilities = {
        "textToImage": True, "imageEdit": "workflow", "maskEdit": "workflow",
        "maxReferenceImages": "workflow", "customBaseUrl": True, "local": True,
    }

    @property
    def available(self) -> bool:
        workflow = provider_setting(self.id, "workflowPath")
        return bool(workflow and Path(workflow).is_file())

    def generate(self, req, on_stage, on_complete, on_error, idempotency_key):
        cancelled = threading.Event()
        active: dict[str, httpx.Client | None] = {"client": None}
        prompt_id: dict[str, str] = {}

        def cancel() -> None:
            cancelled.set()
            client = active.get("client")
            if client:
                try:
                    if prompt_id.get("value"):
                        client.post("/queue", json={"delete": [prompt_id["value"]]})
                    client.post("/interrupt")
                except httpx.HTTPError:
                    pass

        def fail(code: str, message: str, suggestion: str, retryable: bool = False) -> None:
            on_error(GenerateError(code, message, suggestion, retryable))

        def run() -> None:
            workflow_path = Path(provider_setting(self.id, "workflowPath"))
            if not workflow_path.is_file():
                fail("PROVIDER_NOT_CONFIGURED", "未配置 ComfyUI API 工作流 JSON", "在 Provider 设置中选择工作流文件")
                return
            try:
                workflow = json.loads(workflow_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as exc:
                fail("WORKFLOW_INVALID", f"ComfyUI 工作流无法读取：{exc}", "从 ComfyUI 导出 API 格式工作流")
                return
            if not isinstance(workflow, dict):
                fail("WORKFLOW_INVALID", "ComfyUI 工作流根节点必须是对象", "重新导出 API 格式工作流")
                return

            references = [_reference_path(value) for value in req.reference_paths if value]
            if any(not path.is_file() for path in references):
                fail("REFERENCE_MISSING", "存在无法读取的参考图", "重新导入素材")
                return
            mask = Path(req.mask_path) if req.mask_path else None
            if mask and not mask.is_file():
                fail("MASK_MISSING", "蒙版文件不存在", "重新框选局部重绘区域")
                return

            started = time.time()
            base_url = provider_setting(self.id, "baseUrl", "http://127.0.0.1:8188").rstrip("/")
            output_dir = settings.data_dir / "projects" / req.task_id / "generated"
            output_dir.mkdir(parents=True, exist_ok=True)
            output = output_dir / f"comfyui-{idempotency_key[:12] or req.task_id}.png"
            client_id = uuid.uuid4().hex
            try:
                with httpx.Client(base_url=base_url, timeout=httpx.Timeout(420.0)) as client:
                    active["client"] = client
                    variables: dict[str, object] = {
                        "{{PROMPT}}": req.prompt,
                        "{{NEGATIVE_PROMPT}}": req.negative_prompt,
                        "{{SEED}}": int(req.seed),
                        "{{WIDTH}}": int(req.output_width or 1024),
                        "{{HEIGHT}}": int(req.output_height or 1024),
                    }
                    for index, path in enumerate(references, start=1):
                        on_stage("upload", f"上传本地参考图 {index}/{len(references)}")
                        with path.open("rb") as handle:
                            response = client.post("/upload/image", data={"type": "input", "overwrite": "true"}, files={
                                "image": (path.name, handle, "application/octet-stream"),
                            })
                        response.raise_for_status()
                        uploaded = response.json()
                        name = "/".join(filter(None, (uploaded.get("subfolder"), uploaded.get("name"))))
                        variables[f"{{{{REFERENCE_{index}}}}}"] = name
                    if mask:
                        on_stage("upload", "上传本地蒙版")
                        with mask.open("rb") as handle:
                            response = client.post("/upload/image", data={"type": "input", "overwrite": "true"}, files={
                                "image": (mask.name, handle, "application/octet-stream"),
                            })
                        response.raise_for_status()
                        uploaded = response.json()
                        variables["{{MASK}}"] = "/".join(filter(None, (uploaded.get("subfolder"), uploaded.get("name"))))

                    on_stage("submit", "ComfyUI 工作流已提交")
                    response = client.post("/prompt", json={
                        "prompt": _replace(workflow, variables), "client_id": client_id,
                    })
                    response.raise_for_status()
                    prompt_id["value"] = response.json()["prompt_id"]
                    deadline = time.monotonic() + 420
                    image_info = None
                    while time.monotonic() < deadline and not cancelled.wait(1.0):
                        history_response = client.get(f"/history/{prompt_id['value']}")
                        history_response.raise_for_status()
                        history = history_response.json().get(prompt_id["value"])
                        if not history:
                            continue
                        status = history.get("status", {})
                        if status.get("status_str") == "error":
                            fail("LOCAL_WORKFLOW_FAILED", "ComfyUI 工作流执行失败", "检查 ComfyUI 控制台与工作流节点")
                            return
                        for node_output in history.get("outputs", {}).values():
                            images = node_output.get("images", [])
                            if images:
                                image_info = images[0]
                                break
                        if image_info:
                            break
                    if cancelled.is_set():
                        return
                    if not image_info:
                        fail("PROVIDER_TIMEOUT", "ComfyUI 在 420 秒内未返回图片", "检查显存、模型与工作流", True)
                        return
                    on_stage("download", "读取 ComfyUI 输出")
                    query = urlencode({
                        "filename": image_info["filename"],
                        "subfolder": image_info.get("subfolder", ""),
                        "type": image_info.get("type", "output"),
                    })
                    result = client.get(f"/view?{query}")
                    result.raise_for_status()
                    output.write_bytes(result.content)
            except (httpx.HTTPError, OSError, KeyError, TypeError) as exc:
                if not cancelled.is_set():
                    fail("LOCAL_PROVIDER_UNAVAILABLE", f"ComfyUI 调用失败：{exc}", "确认本地服务地址、工作流和模型已就绪", True)
                return
            finally:
                active["client"] = None

            on_stage("write", "ComfyUI 结果已写入本地")
            on_complete(GenerateResult(str(output), 0.0, int((time.time() - started) * 1000)))

        threading.Thread(target=run, name=f"comfyui-{req.task_id}", daemon=True).start()
        return Cancellable(req.task_id, cancel)
