import os
import json
import shutil
import time
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = Path(os.environ["LONGY_DATA_DIR"])
os.environ.setdefault("LONGY_DATA_DIR", str(DATA_DIR))
os.environ.setdefault("LONGY_MAX_CONCURRENCY", "2")
os.environ.setdefault("LONGY_MOCK_FAILURE_RATE", "0")

from fastapi.testclient import TestClient  # noqa: E402

from backend.app.main import app  # noqa: E402


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def wait_for_review(client: TestClient, project_id: str, timeout: float = 20) -> list[dict]:
    deadline = time.time() + timeout
    while time.time() < deadline:
        data = client.get(f"/api/projects/{project_id}/tasks").json()
        tasks = data["tasks"]
        if tasks and all(t["status"] in {"review", "failed", "accepted", "locked", "exported"} for t in tasks):
            return tasks
        time.sleep(0.1)
    raise AssertionError("任务未在限定时间内完成")


def test_full_backend_mock_workflow(client: TestClient):
    assert client.get("/api/health").json()["status"] == "ok"
    assert len(client.get("/api/library/categories").json()["categories"]) >= 4

    project = client.post("/api/projects", json={
        "sku": "TEST-001", "name": "自动测试套装", "platform": "taobao", "style": "简约", "budget": 100
    }).json()
    pid = project["id"]

    item = client.post(f"/api/projects/{pid}/items", json={
        "name": "针织上衣", "categoryId": "top", "colorMaterial": "燕麦色 / 粗针织",
        "sellingPoints": "重磅针织", "isSellable": True,
    }).json()

    plan = client.post(f"/api/projects/{pid}/tasks/plan", json={"presetId": "fast-check"}).json()
    assert len(plan["planned"]) + len(plan["cached"]) > 0

    tasks = client.get(f"/api/projects/{pid}/tasks").json()["tasks"]
    assert all(t["provider"] == "mock" for t in tasks)
    response = client.post(f"/api/projects/{pid}/tasks/submit", json={"taskIds": [t["id"] for t in tasks]})
    assert response.json()["queued"] == len(tasks)

    tasks = wait_for_review(client, pid)
    assert tasks
    assert all(t["status"] == "review" for t in tasks)

    for task in tasks:
        assert client.post(
            f"/api/projects/{pid}/tasks/{task['id']}/review", json={"action": "accept"}
        ).json()["ok"]
        assert client.post(
            f"/api/projects/{pid}/tasks/{task['id']}/review", json={"action": "lock"}
        ).json()["ok"]
    preview = client.get(f"/api/projects/{pid}/exports/preview").json()
    assert preview["files"]
    assert preview["coverageComplete"]

    exported = client.post(f"/api/projects/{pid}/exports", json={"taskIds": [tasks[0]["id"]]}).json()
    assert exported["exported"] == 1
    assert Path(exported["mapping"][0]["written"]).is_file()
    manifest_path = Path(exported["manifestPath"])
    assert manifest_path.is_file()
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert manifest["containsAiGeneratedContent"] is True
    assert manifest["files"][0]["contentOrigin"] == "ai-generated"
    assert len(manifest["files"][0]["sha256"]) == 64



def test_queue_pause_and_cancel(client: TestClient):
    project = client.post("/api/projects", json={
        "sku": "QUEUE-CONTROL-001", "name": "队列控制测试", "platform": "taobao",
        "style": "简约", "budget": 100,
    }).json()
    pid = project["id"]
    client.post(f"/api/projects/{pid}/items", json={
        "name": "队列上衣", "categoryId": "top", "colorMaterial": "黑色 / 棉",
        "sellingPoints": "保持结构", "isSellable": True,
    })
    planned = client.post(f"/api/projects/{pid}/tasks/plan", json={"presetId": "fast-check"}).json()
    task_id = planned["planned"][0]["id"]
    try:
        assert client.post(f"/api/projects/{pid}/tasks/queue/pause").json()["paused"] is True
        submitted = client.post(f"/api/projects/{pid}/tasks/submit", json={"taskIds": [task_id]})
        assert submitted.json()["queued"] == 1

        deadline = time.time() + 1
        status = "queued"
        while time.time() < deadline:
            status = next(
                task["status"] for task in client.get(f"/api/projects/{pid}/tasks").json()["tasks"]
                if task["id"] == task_id
            )
            if status != "queued":
                break
            time.sleep(0.05)
        assert status == "queued", "暂停后的队列不应领取新任务"

        cancelled = client.post(f"/api/projects/{pid}/tasks/queue/cancel", json={"taskIds": [task_id]})
        assert cancelled.json()["cancelled"] == 1
        task = next(
            task for task in client.get(f"/api/projects/{pid}/tasks").json()["tasks"]
            if task["id"] == task_id
        )
        assert task["status"] == "failed"
    finally:
        client.post(f"/api/projects/{pid}/tasks/queue/resume")


def test_regenerate_accepts_prompt_revision(client: TestClient):
    project = client.post("/api/projects", json={
        "sku": "REGEN-PROMPT-001", "name": "提示词修正测试", "platform": "taobao",
        "style": "简约", "budget": 100,
    }).json()
    pid = project["id"]
    client.post(f"/api/projects/{pid}/items", json={
        "name": "修正上衣", "categoryId": "top", "colorMaterial": "黑色 / 棉",
        "sellingPoints": "保持比例", "isSellable": True,
    })
    planned = client.post(f"/api/projects/{pid}/tasks/plan", json={"presetId": "fast-check"}).json()
    assert planned["planned"]

    task = client.get(f"/api/projects/{pid}/tasks").json()["tasks"][0]
    all_task_ids = [item["id"] for item in client.get(f"/api/projects/{pid}/tasks").json()["tasks"]]
    assert client.post(f"/api/projects/{pid}/tasks/submit", json={"taskIds": all_task_ids}).status_code == 200
    task = next(t for t in wait_for_review(client, pid) if t["id"] == task["id"])
    base_version_id = task["currentVersionId"]

    revised = client.post(f"/api/projects/{pid}/tasks/{task['id']}/regenerate", json={
        "prompt": task["prompt"] + "。用户修正：USER_REVISION_MARKER",
        "negativePrompt": "颜色偏移，手部畸形",
        "reason": "color,hands",
        "note": "袖口改为米白色",
        "referenceMode": "generated",
        "baseVersionId": base_version_id,
        "maskDataUrl": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYGBgYgBQCAIAAAA5BwOKAAAAAElFTkSuQmCC",
    })
    assert revised.status_code == 200
    assert revised.json()["version"] >= 2

    updated = next(t for t in wait_for_review(client, pid) if t["id"] == task["id"])
    assert "USER_REVISION_MARKER" in updated["prompt"]
    assert "颜色偏移" in updated["negativePrompt"]
    revised_version = next(v for v in updated["versions"] if v["id"] == updated["currentVersionId"])
    assert revised_version["referenceMode"] == "generated"
    assert revised_version["baseVersionId"] == base_version_id
    assert revised_version["maskPath"]
    assert Path(revised_version["maskPath"]).is_file()
    assert any("USER_REVISION_MARKER" in version.get("prompt", "") for version in updated["versions"])


def test_legacy_v2_template_flow(client: TestClient):
    """Verify v2 models, legacy prompts, preprocessing, and QC integration."""
    from io import BytesIO

    from PIL import Image, ImageDraw

    project = client.post("/api/projects", json={
        "sku": "LEGACY-002", "name": "Legacy Template Pilot", "platform": "taobao",
        "style": "v2 final", "budget": 100,
    }).json()
    pid = project["id"]
    item = client.post(f"/api/projects/{pid}/items", json={
        "name": "Template Top", "categoryId": "top", "colorMaterial": "Black / wool",
        "sellingPoints": "Preserve buttons and seams", "isSellable": True,
    }).json()

    image = Image.new("RGB", (1200, 1500), "white")
    draw = ImageDraw.Draw(image)
    draw.rectangle((220, 260, 980, 1240), fill=(24, 28, 36))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    uploaded = client.post(
        f"/api/projects/{pid}/assets/import",
        files={"files": ("template-top.png", buffer.getvalue(), "image/png")},
    ).json()
    assert uploaded["imported"] == 1
    asset_id = client.get(f"/api/projects/{pid}/assets").json()["assets"][0]["id"]
    confirmed = client.post(f"/api/projects/{pid}/assets/{asset_id}/confirm", json={
        "categoryId": "top", "viewSlot": "front", "itemId": item["id"],
    }).json()
    assert confirmed["ok"]

    templates = client.get("/api/library/prompt-templates").json()["templates"]
    assert "Image 1 is the authoritative original clothing" in templates["flatBase"]
    assert "Retouch Image 1 only" in templates["flatRetouch"]
    assert templates["qualityGates"]["borderWhiteMin"] == 0.97
    assert templates["calibration"]["id"] == "example-calibration-v1"
    assert templates["calibration"]["evidenceSummary"]["rejectedOutput"] == 48

    planned = client.post(f"/api/projects/{pid}/tasks/plan", json={
        "presetId": "fast-check", "provider": "mock", "replaceExisting": True,
    }).json()
    assert planned["provider"] == "mock"
    tasks = client.get(f"/api/projects/{pid}/tasks").json()["tasks"]
    flat = next(t for t in tasks if t["type"] == "flat")
    model_tasks = [t for t in tasks if t["type"] == "model"]
    assert "authoritative original clothing" in flat["prompt"]
    assert len(model_tasks) == 3
    assert {t["modelId"] for t in model_tasks} == {
        "chinese-grand", "korean-sweetcool", "western-chic"
    }
    assert all(t["provider"] == "mock" for t in tasks)

    single_model = client.post(f"/api/projects/{pid}/tasks/plan", json={
        "presetId": "fast-check", "provider": "mock", "replaceExisting": True,
        "modelIds": ["chinese-grand"],
    }).json()
    single_tasks = client.get(f"/api/projects/{pid}/tasks").json()["tasks"]
    assert len(single_model["planned"]) > 0
    assert {t["modelId"] for t in single_tasks if t["type"] == "model"} == {"chinese-grand"}

    quality = client.get(f"/api/projects/{pid}/assets/{asset_id}/quality").json()["metrics"]
    assert quality["width"] == 1200 and quality["height"] == 1500
    assert quality["foregroundBBox"] == [220, 260, 980, 1240]

    prepared = client.post(
        f"/api/projects/{pid}/assets/{asset_id}/legacy-plan-view/prepare"
    ).json()
    assert (DATA_DIR / prepared["uploadPath"]).is_file()
    assert (DATA_DIR / prepared["evidencePath"]).is_file()
    assert "detail evidence grid" in prepared["retouchPrompt"]

    providers = client.get("/api/providers").json()["providers"]
    assert {p["id"] for p in providers} >= {"mock", "openrouter-icu"}


def test_item_asset_replace_recategory_and_delete_are_persistent(client: TestClient):
    from io import BytesIO

    from PIL import Image

    project = client.post("/api/projects", json={
        "sku": f"LIFECYCLE-{os.getpid()}", "name": "素材生命周期",
        "platform": "taobao", "style": "简约", "budget": 10,
    }).json()
    project_id = project["id"]
    item = client.post(f"/api/projects/{project_id}/items", json={
        "name": "待替换上衣", "categoryId": "top", "isSellable": True,
    }).json()

    def png_bytes(color: tuple[int, int, int]) -> bytes:
        buffer = BytesIO()
        Image.new("RGB", (320, 400), color).save(buffer, format="PNG")
        return buffer.getvalue()

    imported = client.post(
        f"/api/projects/{project_id}/assets/import",
        files={"files": ("front-red.png", png_bytes((180, 20, 30)), "image/png")},
    ).json()
    assert imported["imported"] == 1
    original = client.get(f"/api/projects/{project_id}/assets").json()["assets"][0]
    client.post(f"/api/projects/{project_id}/assets/{original['id']}/confirm", json={
        "categoryId": "top", "viewSlot": "front", "itemId": item["id"],
    })
    original_path = DATA_DIR / original["filePath"]
    assert original_path.is_file()

    replaced = client.post(
        f"/api/projects/{project_id}/assets/{original['id']}/replace",
        files={"file": ("front-blue.png", png_bytes((20, 40, 180)), "image/png")},
    )
    assert replaced.status_code == 200
    replacement = replaced.json()["asset"]
    assert replacement["id"] == original["id"]
    assert replacement["itemId"] == item["id"]
    assert replacement["hash"] != original["hash"]
    replacement_path = DATA_DIR / replacement["filePath"]
    assert replacement_path.is_file()
    assert not original_path.exists()
    assert len(client.get(f"/api/projects/{project_id}/items").json()["items"]) == 1
    assert len(client.get(f"/api/projects/{project_id}/assets").json()["assets"]) == 1

    client.post(f"/api/projects/{project_id}/tasks/plan", json={
        "presetId": "fast-check", "provider": "mock", "replaceExisting": True,
        "shotIds": ["flat-front"],
    })
    assert client.get(f"/api/projects/{project_id}/tasks").json()["tasks"]

    recategorized = client.patch(f"/api/projects/{project_id}/items/{item['id']}", json={
        "categoryId": "pants", "attributes": {}, "structureFacts": {},
    })
    assert recategorized.status_code == 200
    assert recategorized.json()["categoryId"] == "pants"
    asset_after_category = client.get(f"/api/projects/{project_id}/assets").json()["assets"][0]
    assert asset_after_category["categoryId"] == "pants"
    assert client.get(f"/api/projects/{project_id}/tasks").json()["tasks"] == []

    client.post(f"/api/projects/{project_id}/tasks/plan", json={
        "presetId": "fast-check", "provider": "mock", "replaceExisting": True,
        "shotIds": ["flat-front"],
    })
    tasks = client.get(f"/api/projects/{project_id}/tasks").json()["tasks"]
    assert tasks and {task["itemId"] for task in tasks} == {item["id"]}
    assert all("裤装" in task["prompt"] or "裤子" in task["prompt"] for task in tasks)

    deleted = client.delete(f"/api/projects/{project_id}/items/{item['id']}")
    assert deleted.status_code == 200 and deleted.json()["deleted"] is True
    assert client.get(f"/api/projects/{project_id}/items").json()["items"] == []
    assert client.get(f"/api/projects/{project_id}/assets").json()["assets"] == []
    assert client.get(f"/api/projects/{project_id}/tasks").json()["tasks"] == []
    assert not replacement_path.exists()
