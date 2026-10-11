"""OpenRouter ICU Provider：复用旧版脚本已验证的多参考图编辑链路。"""
from __future__ import annotations

import os
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Any

from ..config import PROJECT_ROOT, settings
from ..services.image_qc import inspect_image, normalize_flat_output
from .base import (
    Cancellable,
    GenerateError,
    GenerateRequest,
    GenerateResult,
    ImageProvider,
)


def _cli_candidates() -> list[Path]:
    configured = os.getenv("LONGY_OPENROUTER_ICU_CLI") or os.getenv("OPENROUTER_ICU_CLI")
    return [
        Path(configured) if configured else None,
        PROJECT_ROOT / "tools" / "openrouter_icu_image.py",
    ]  # type: ignore[list-item]


def find_cli() -> Path | None:
    return next((path for path in _cli_candidates() if path and path.is_file()), None)


def api_key() -> str:
    return os.getenv("OPENROUTER_ICU_API_KEY", "").strip()


def resolve_reference(value: str) -> Path:
    path = Path(value)
    if path.is_absolute():
        return path
    if path.parts and path.parts[0] == "asset-library":
        return PROJECT_ROOT / path
    return settings.data_dir / path


class OpenRouterICUProvider(ImageProvider):
    id = "openrouter-icu"
    name = "OpenRouter ICU 图像编辑"
    supported_tiers = ("draft", "hd")
    price_per_image = {"draft": 1.0, "hd": 4.0}
    rate_limit_per_min = 8
    max_retries = 2

    @property
    def available(self) -> bool:
        return bool(api_key() and find_cli())

    def _output_size(self, req: GenerateRequest) -> tuple[int, int]:
        # 平面图沿用旧版 1536 方图；模特图沿用 3:4 商品图。
        if req.task_type == "model":
            return (1024, 1280) if req.tier == "draft" else (1152, 1536)
        return (1536, 1536)

    def generate(self, req, on_stage, on_complete, on_error, idempotency_key):
        cancelled = threading.Event()
        active: dict[str, subprocess.Popen[str] | None] = {"process": None}

        def cancel() -> None:
            cancelled.set()
            process = active.get("process")
            if process and process.poll() is None:
                process.terminate()

        def fail(code: str, message: str, suggestion: str, retryable: bool) -> None:
            on_error(GenerateError(code, message, suggestion, retryable))

        def run() -> None:
            cli = find_cli()
            key = api_key()
            if not cli:
                fail("PROVIDER_NOT_CONFIGURED", "未找到 openrouter_icu_image.py",
                     "设置 LONGY_OPENROUTER_ICU_CLI 或把脚本复制到 tools/", False)
                return
            if not key:
                fail("API_KEY_MISSING", "缺少 OPENROUTER_ICU_API_KEY",
                     "在系统环境变量中配置后重启 LongY Studio", False)
                return

            started = time.time()
            output_dir = settings.data_dir / "projects" / req.task_id / "generated"
            output_dir.mkdir(parents=True, exist_ok=True)
            output = output_dir / f"v-{idempotency_key[:12] or req.task_id}.png"
            references = [resolve_reference(item) for item in req.reference_paths if item]
            missing = [str(path) for path in references if not path.is_file()]
            if missing:
                fail("REFERENCE_MISSING", "参考图不存在：" + ", ".join(missing),
                     "重新导入素材或检查 asset-library 引用路径", False)
                return

            width, height = self._output_size(req)
            command = [
                sys.executable, str(cli), "edit" if references else "generate",
                "--prompt", req.prompt,
                "--size", f"{width}x{height}",
                "--quality", "medium" if req.tier == "draft" else "high",
                "--output-format", "png",
                "--no-stream",
                "--output", str(output),
            ]
            for reference in references:
                command.extend(["--image", str(reference)])

            env = os.environ.copy()
            env["OPENROUTER_ICU_API_KEY"] = key
            last_error = ""
            for attempt in range(1, self.max_retries + 2):
                if cancelled.is_set():
                    return
                on_stage("submit", f"OpenRouter 图像编辑提交中（第 {attempt} 次）")
                try:
                    process = subprocess.Popen(
                        command,
                        cwd=str(PROJECT_ROOT),
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        text=True,
                        encoding="utf-8",
                        errors="replace",
                        env=env,
                    )
                    active["process"] = process
                    stdout, stderr = process.communicate(timeout=420)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.communicate()
                    last_error = "OpenRouter 请求超过 420 秒"
                except OSError as exc:
                    fail("PROVIDER_PROCESS_ERROR", f"无法启动图像 CLI：{exc}",
                         "检查 Python 与 CLI 路径", False)
                    return
                else:
                    active["process"] = None
                    if process.returncode == 0 and output.is_file():
                        break
                    last_error = (stderr or stdout or "unknown error").strip()[-1600:]
                output.unlink(missing_ok=True)
                if attempt <= self.max_retries and not cancelled.is_set():
                    on_stage("retry", f"生成失败，准备重试：{last_error[:120]}")
                    if cancelled.wait(timeout=min(30, 5 * attempt)):
                        return
            else:
                fail("IMAGE_EDIT_FAILED", last_error or "图像编辑失败",
                     "查看 Provider 调用记录后重试；不要盲目提高并发", True)
                return

            if cancelled.is_set() or not output.is_file():
                return
            on_stage("write", "写入本地并执行旧版像素 QC")
            try:
                if req.task_type == "flat":
                    output = normalize_flat_output(output)
                    metrics: dict[str, Any] = inspect_image(output)
                    if not metrics["passed"]:
                        output.unlink(missing_ok=True)
                        fail("LEGACY_QC_FAILED", f"平面图 QC 未通过：{metrics}",
                             "重试，或在审核后进入局部精修", True)
                        return
            except Exception as exc:
                output.unlink(missing_ok=True)
                fail("RESULT_VALIDATION_FAILED", f"结果文件校验失败：{exc}",
                     "重试；若持续失败请检查磁盘与输出目录", True)
                return

            on_complete(GenerateResult(
                file_path=str(output),
                cost=self.price_per_image.get(req.tier, 1.0),
                duration_ms=int((time.time() - started) * 1000),
            ))

        threading.Thread(target=run, name=f"{self.id}-{req.task_id}", daemon=True).start()
        return Cancellable(req.task_id, cancel)
