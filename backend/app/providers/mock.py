"""假 Provider：真实写入 SVG 占位结果，用于后端闭环测试，不消耗 API。"""
import random
import threading
import time
import uuid
from ..config import settings
from .base import Cancellable, GenerateError, GenerateRequest, GenerateResult, ImageProvider


class MockProvider(ImageProvider):
    id = "mock"
    name = "Mock 生图引擎"
    supported_tiers = ("draft", "hd")
    price_per_image = {"draft": 1.0, "hd": 4.0}

    def generate(self, req, on_stage, on_complete, on_error, idempotency_key):
        cancelled = threading.Event()
        started = time.time()

        def run():
            stages = [("upload", "正在上传参考图"), ("submit", "正在组装提示词"),
                      ("server", "服务端生成中"), ("download", "正在下载结果"), ("write", "写入本地")]
            for stage, message in stages:
                if cancelled.is_set():
                    return
                on_stage(stage, message)
                time.sleep(0.08)
            if cancelled.is_set():
                return
            if random.random() < settings.mock_failure_rate:
                on_error(GenerateError("MOCK_RANDOM_FAILURE", "模拟失败：服务端长时间未返回", "重试或更换 Provider", True))
                return
            out_dir = settings.data_dir / "projects" / req.task_id / "generated"
            out_dir.mkdir(parents=True, exist_ok=True)
            out = out_dir / f"v-{idempotency_key[:10] or uuid.uuid4().hex[:10]}.svg"
            size = "768" if req.tier == "draft" else "1536"
            safe_prompt = "".join(ch if ch.isalnum() or ch in "，。 " else " " for ch in req.prompt[:160])
            out.write_text(
                f'''<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">
<rect width="100%" height="100%" fill="#f8fafc"/><rect x="24" y="24" width="{int(size)-48}" height="{int(size)-48}" rx="28" fill="#eef2ff" stroke="#6366f1" stroke-width="4"/>
<text x="50%" y="44%" text-anchor="middle" font-family="Microsoft YaHei,sans-serif" font-size="34" fill="#312e81">LongY Mock</text>
<foreignObject x="60" y="{int(size)*0.52}" width="{int(size)-120}" height="260"><div xmlns="http://www.w3.org/1999/xhtml" style="font-family:sans-serif;color:#475569;font-size:20px;line-height:1.5">{safe_prompt}</div></foreignObject>
</svg>''', encoding="utf-8")
            on_complete(GenerateResult(str(out), self.price_per_image[req.tier], int((time.time() - started) * 1000)))

        threading.Thread(target=run, daemon=True, name=f"mock-{req.task_id}").start()
        return Cancellable(req.task_id, cancelled.set)
