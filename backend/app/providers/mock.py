"""Mock provider: writes a real raster placeholder so QC and preview paths stay testable."""
from __future__ import annotations

import random
import threading
import time
import uuid

from PIL import Image, ImageDraw

from ..config import settings
from .base import Cancellable, GenerateError, GenerateRequest, GenerateResult, ImageProvider


class MockProvider(ImageProvider):
    id = "mock"
    name = "Mock 生图引擎"
    supported_tiers = ("draft", "hd")
    price_per_image = {"draft": 1.0, "hd": 5.0}

    def generate(self, req, on_stage, on_complete, on_error, idempotency_key):
        cancelled = threading.Event()
        started = time.time()

        def run():
            stages = [
                ("upload", "正在上传参考图"),
                ("submit", "正在组装提示词"),
                ("server", "服务端生成中"),
            ]
            if req.tier == "hd":
                stages.append(("hd-repair", "执行高清细节修复模拟"))
            stages.extend([("download", "正在下载结果"), ("write", "写入本地")])
            for stage, message in stages:
                if cancelled.is_set():
                    return
                on_stage(stage, message)
                time.sleep(0.02)
            if cancelled.is_set():
                return
            if random.random() < settings.mock_failure_rate:
                on_error(GenerateError("MOCK_RANDOM_FAILURE", "模拟失败：服务端长时间未返回", "重试或更换 Provider", True))
                return

            if req.output_width and req.output_height:
                size = (req.output_width, req.output_height)
            elif req.task_type == "model":
                size = (896, 1280) if req.tier == "draft" else (1152, 1536)
            else:
                size = (1024, 1024) if req.tier == "draft" else (1536, 1536)
            image = Image.new("RGB", size, "#f7f8fb")
            draw = ImageDraw.Draw(image)
            draw.rectangle((36, 36, size[0] - 37, size[1] - 37), outline="#6366f1", width=4)
            draw.rectangle((84, 96, size[0] - 85, size[1] - 130), fill="#e7ebff", outline="#b9c3ff", width=2)
            draw.text((72, 66), "LongY Mock", fill="#312e81")
            detail = "HD DETAIL REPAIR" if req.tier == "hd" else "DRAFT"
            draw.text((72, size[1] - 108), detail, fill="#4338ca")

            if req.tier == "hd":
                step = 16
                for x in range(64, size[0] - 65, step):
                    draw.line((x, 110, x + 10, size[1] - 150), fill=(210, 216, 245), width=1)
                for y in range(110, size[1] - 150, step):
                    draw.line((64, y, size[0] - 65, y + 6), fill=(216, 222, 247), width=1)

            out_dir = settings.data_dir / "projects" / req.task_id / "generated"
            out_dir.mkdir(parents=True, exist_ok=True)
            out = out_dir / f"v-{idempotency_key[:10] or uuid.uuid4().hex[:10]}.png"
            image.save(out, format="PNG", optimize=False)
            on_complete(GenerateResult(str(out), self.price_per_image[req.tier], int((time.time() - started) * 1000)))

        threading.Thread(target=run, daemon=True, name=f"mock-{req.task_id}").start()
        return Cancellable(req.task_id, cancelled.set)
