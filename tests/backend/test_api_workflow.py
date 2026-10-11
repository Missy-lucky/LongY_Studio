import os
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
            f"/api/projects/{pid}/tasks/{task['id']}/review", json={"action": "lock"}
        ).json()["ok"]
    preview = client.get(f"/api/projects/{pid}/exports/preview").json()
    assert preview["files"]
    assert preview["coverageComplete"]

    exported = client.post(f"/api/projects/{pid}/exports", json={"taskIds": [tasks[0]["id"]]}).json()
    assert exported["exported"] == 1
    assert Path(exported["mapping"][0]["written"]).is_file()



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
