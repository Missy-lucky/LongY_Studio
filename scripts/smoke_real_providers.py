"""Run one explicitly confirmed, billable image smoke per configured real Provider."""
from __future__ import annotations

import argparse
import json
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

from backend.app.config import PROJECT_ROOT
from backend.app.providers import resolve_provider
from backend.app.providers.base import GenerateRequest
from backend.app.services.provider_diagnostics import diagnose_provider

SUPPORTED = ("openai", "volcengine-ark", "comfyui")
REPORT = PROJECT_ROOT / "temp" / "provider-smoke-latest.json"


def run_one(provider_id: str) -> dict:
    diagnostic = diagnose_provider(provider_id)
    record = {
        "provider": provider_id,
        "startedAt": datetime.now(timezone.utc).isoformat(),
        "diagnosticStatus": diagnostic["status"],
        "status": "blocked",
        "billableRequestSent": False,
    }
    if not diagnostic["canGenerate"]:
        record["reason"] = diagnostic["message"]
        record["failedChecks"] = [
            {"id": check["id"], "message": check["message"]}
            for check in diagnostic["checks"] if check["status"] == "fail"
        ]
        return record

    completed = threading.Event()
    result_holder: dict = {}
    error_holder: dict = {}
    provider = resolve_provider(provider_id)
    task_id = f"provider-smoke-{provider_id}-{int(time.time())}"
    request = GenerateRequest(
        task_id=task_id,
        tier="draft",
        task_type="detail",
        prompt=(
            "E-commerce clothing API smoke test: one plain black cotton T-shirt centered on a pure white background, "
            "no person, no logo, no text, no watermark, 1024x1024."
        ),
        negative_prompt="person, model, logo, text, watermark, duplicate garment",
        output_width=1024,
        output_height=1024,
    )
    record["billableRequestSent"] = True
    provider.generate(
        request,
        lambda stage, message: record.update(lastStage=stage, lastStageMessage=message),
        lambda result: (result_holder.update(
            filePath=result.file_path, cost=result.cost, durationMs=result.duration_ms,
        ), completed.set()),
        lambda error: (error_holder.update(
            code=error.code, message=error.message, suggestion=error.suggestion,
        ), completed.set()),
        f"smoke-{provider_id}-{int(time.time())}",
    )
    if not completed.wait(480):
        record.update(status="failed", errorCode="SMOKE_TIMEOUT", reason="480 秒内未收到结果")
    elif error_holder:
        record.update(status="failed", error=error_holder)
    else:
        record.update(status="passed", result=result_holder)
    record["finishedAt"] = datetime.now(timezone.utc).isoformat()
    return record


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--provider", action="append", choices=SUPPORTED)
    parser.add_argument("--confirm-billable", action="store_true")
    args = parser.parse_args()
    providers = args.provider or list(SUPPORTED)
    diagnostics = {provider_id: diagnose_provider(provider_id) for provider_id in providers}
    if not args.confirm_billable:
        print(json.dumps({
            "billableRequestSent": False,
            "message": "仅完成无计费预检；加入 --confirm-billable 才会每个 Provider 生成 1 张图。",
            "diagnostics": diagnostics,
        }, ensure_ascii=False, indent=2))
        return 2 if any(not item["canGenerate"] for item in diagnostics.values()) else 0

    results = [run_one(provider_id) for provider_id in providers]
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps({
        "schema": "longy.provider-smoke.v1",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "results": results,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Smoke report: {REPORT}")
    for result in results:
        print(f"{result['provider']}: {result['status']}")
    return 0 if all(result["status"] == "passed" for result in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
