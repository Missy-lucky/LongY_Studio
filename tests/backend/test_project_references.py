import io
import os
import uuid
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
os.environ.setdefault("LONGY_DATA_DIR", str(ROOT / "temp" / "tests" / "backend-data"))

from backend.app.main import app  # noqa: E402
from backend.app.database import get_db  # noqa: E402
from backend.app.queue.worker import _model_reference_paths, _project_reference_paths  # noqa: E402


def png_bytes(color: tuple[int, int, int]) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (640, 960), color).save(buffer, format="PNG")
    return buffer.getvalue()


def create_project(client: TestClient, prefix: str) -> dict:
    return client.post("/api/projects", json={
        "sku": f"{prefix}-{uuid.uuid4().hex[:6]}",
        "name": "项目参考图测试",
        "platform": "taobao",
        "style": "简约",
        "budget": 10,
    }).json()


def test_custom_model_and_role_references_persist_and_reach_planning():
    with TestClient(app) as client:
        project = create_project(client, "REF")
        project_id = project["id"]
        custom = client.post(
            f"/api/projects/{project_id}/models/import",
            data={"name": "自定义全身模特", "rightsConfirmed": "true", "rightsBasis": "consent", "rightsNote": "授权单 REF-001"},
            files={"file": ("model.png", png_bytes((220, 180, 160)), "image/png")},
        )
        assert custom.status_code == 200
        model_id = custom.json()["model"]["id"]
        angle = client.post(
            f"/api/projects/{project_id}/models/{model_id}/references/import",
            data={"angle": "back", "name": "背面身份参考"},
            files={"file": ("model-back.png", png_bytes((180, 160, 140)), "image/png")},
        )
        assert angle.status_code == 200

        models = client.get(f"/api/projects/{project_id}/models").json()
        assert models["selectedModelId"] == model_id
        assert any(model["id"] == model_id and model["source"] == "custom" for model in models["models"])
        selected_model = next(model for model in models["models"] if model["id"] == model_id)
        assert selected_model["rightsBasis"] == "consent"
        assert [reference["angle"] for reference in selected_model["references"]] == ["front", "back"]
        assert client.get(
            f"/api/projects/{project_id}/models/{model_id}/reference"
        ).status_code == 200

        uploaded = {}
        for role, color in (
            ("pose", (10, 20, 30)),
            ("style", (40, 50, 60)),
            ("detail", (70, 80, 90)),
        ):
            response = client.post(
                f"/api/projects/{project_id}/references/import",
                data={"role": role, "name": f"{role}参考"},
                files={"file": (f"{role}.png", png_bytes(color), "image/png")},
            )
            assert response.status_code == 200
            uploaded[role] = response.json()["reference"]

        references = client.get(f"/api/projects/{project_id}/references").json()["references"]
        assert {reference["role"] for reference in references} == {"pose", "style", "detail"}
        assert client.get(
            f"/api/projects/{project_id}/references/{uploaded['pose']['id']}/file"
        ).status_code == 200

        client.post(f"/api/projects/{project_id}/items", json={
            "name": "测试卫衣",
            "categoryId": "hoodie",
            "attributes": {"hasHood": True, "hasZip": False},
        })
        planned = client.post(f"/api/projects/{project_id}/tasks/plan", json={
            "presetId": "fast-check",
            "provider": "mock",
            "replaceExisting": True,
            "modelIds": [model_id],
        })
        assert planned.status_code == 200
        tasks = client.get(f"/api/projects/{project_id}/tasks").json()["tasks"]
        partial = next(task for task in tasks if task["type"] == "partial")
        model = next(task for task in tasks if task["type"] == "model")
        detail = next(task for task in tasks if task["type"] == "detail")
        assert partial["modelId"] == model_id
        assert model["modelId"] == model_id
        assert "pose: pose参考" in partial["prompt"]
        assert "style: style参考" in model["prompt"]
        assert "detail: detail参考" in detail["prompt"]
        assert "pose: pose参考" not in detail["prompt"]
        original_cache_key = model["cacheKey"]

        assert client.delete(
            f"/api/projects/{project_id}/references/{uploaded['style']['id']}"
        ).status_code == 200
        replacement = client.post(
            f"/api/projects/{project_id}/references/import",
            data={"role": "style", "name": "style参考"},
            files={"file": ("style-new.png", png_bytes((100, 110, 120)), "image/png")},
        )
        assert replacement.status_code == 200
        client.post(f"/api/projects/{project_id}/tasks/plan", json={
            "presetId": "fast-check",
            "provider": "mock",
            "replaceExisting": True,
            "modelIds": [model_id],
        })
        replanned = client.get(f"/api/projects/{project_id}/tasks").json()["tasks"]
        assert next(task for task in replanned if task["type"] == "model")["cacheKey"] != original_cache_key

        db = get_db()
        try:
            assert len(_project_reference_paths(db, project_id, "model")) == 2
            assert len(_project_reference_paths(db, project_id, "detail")) == 2
            assert len(_model_reference_paths(db, model_id, None)) == 2
        finally:
            db.close()


def test_custom_model_import_requires_explicit_rights_confirmation():
    with TestClient(app) as client:
        project = create_project(client, "NOAUTH")
        response = client.post(
            f"/api/projects/{project['id']}/models/import",
            data={"name": "未授权模特"},
            files={"file": ("model.png", png_bytes((30, 40, 50)), "image/png")},
        )
        assert response.status_code == 422
        assert "确认人物图片使用权" in response.json()["detail"]


def test_reference_limits_and_cross_project_model_selection():
    with TestClient(app) as client:
        owner = create_project(client, "OWNER")
        other = create_project(client, "OTHER")
        custom = client.post(
            f"/api/projects/{owner['id']}/models/import",
            data={"name": "仅本项目模特", "rightsConfirmed": "true", "rightsBasis": "licensed", "rightsNote": "测试许可"},
            files={"file": ("model.png", png_bytes((1, 2, 3)), "image/png")},
        ).json()["model"]
        denied = client.post(
            f"/api/projects/{other['id']}/models/{custom['id']}/select"
        )
        assert denied.status_code == 404
        denied_plan = client.post(f"/api/projects/{other['id']}/tasks/plan", json={
            "presetId": "fast-check",
            "provider": "mock",
            "replaceExisting": True,
            "modelIds": [custom["id"]],
        })
        assert denied_plan.status_code == 400
        assert "不属于当前项目" in denied_plan.json()["detail"]

        first = client.post(
            f"/api/projects/{owner['id']}/references/import",
            data={"role": "pose", "name": "姿势一"},
            files={"file": ("pose-1.png", png_bytes((4, 5, 6)), "image/png")},
        )
        assert first.status_code == 200
        second = client.post(
            f"/api/projects/{owner['id']}/references/import",
            data={"role": "pose", "name": "姿势二"},
            files={"file": ("pose-2.png", png_bytes((7, 8, 9)), "image/png")},
        )
        assert second.status_code == 409
        assert "最多 1 张" in second.json()["detail"]


def test_known_bad_reference_digest_cannot_be_uploaded(monkeypatch):
    monkeypatch.setattr(
        "backend.app.routers.references.is_known_bad_reference",
        lambda _digest: True,
    )
    with TestClient(app) as client:
        project = create_project(client, "BADREF")
        response = client.post(
            f"/api/projects/{project['id']}/references/import",
            data={"role": "style", "name": "已知问题平面图"},
            files={"file": ("known-bad.png", png_bytes((10, 20, 30)), "image/png")},
        )

    assert response.status_code == 422
    assert "已确认的问题样例" in response.json()["detail"]
