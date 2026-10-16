import base64
import json
import threading
import uuid
from io import BytesIO

from fastapi.testclient import TestClient
from PIL import Image

from backend.app.config import settings
from backend.app.main import app
from backend.app.providers.base import GenerateRequest
from backend.app.providers.comfyui import _replace
from backend.app.providers.openai_images import OpenAIImagesProvider
from backend.app.providers.volcengine_ark import VolcengineArkProvider
from backend.app.services.care_label_extractor import extract_care_label


def png_bytes() -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (16, 16), "white").save(buffer, format="PNG")
    return buffer.getvalue()


class FakeResponse:
    is_success = True
    status_code = 200
    text = ""
    content = png_bytes()

    def json(self):
        return {"data": [{"b64_json": base64.b64encode(self.content).decode("ascii")}]}


class FakeClient:
    last_json = None
    last_data = None

    def __init__(self, *args, **kwargs):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def close(self):
        pass

    def post(self, path, json=None, data=None, files=None):
        type(self).last_json = json
        type(self).last_data = data
        return FakeResponse()


def run_provider(provider, task_id: str):
    done = threading.Event()
    result = {}
    errors = []
    provider.generate(
        GenerateRequest(task_id=task_id, tier="draft", prompt="生成白底商品图", negative_prompt="文字"),
        lambda *_: None,
        lambda value: (result.update(file_path=value.file_path), done.set()),
        lambda value: (errors.append(value), done.set()),
        "test-key",
    )
    assert done.wait(2)
    assert not errors
    assert result["file_path"]
    return result


def test_openai_and_ark_adapters_write_base64_results(monkeypatch):
    monkeypatch.setattr("backend.app.providers.openai_images.load_api_key", lambda _: "secret")
    monkeypatch.setattr("backend.app.providers.openai_images.provider_setting", lambda _p, key, default="": default)
    monkeypatch.setattr("backend.app.providers.openai_images.httpx.Client", FakeClient)
    openai = run_provider(OpenAIImagesProvider(), "openai-test")
    assert (settings.data_dir / "projects" / "openai-test" / "generated").is_dir()
    assert "Avoid: 文字" in FakeClient.last_json["prompt"]

    monkeypatch.setattr("backend.app.providers.volcengine_ark.load_api_key", lambda _: "secret")
    monkeypatch.setattr("backend.app.providers.volcengine_ark.provider_setting", lambda _p, key, default="": default)
    monkeypatch.setattr("backend.app.providers.volcengine_ark.httpx.Client", FakeClient)
    ark = run_provider(VolcengineArkProvider(), "ark-test")
    assert openai["file_path"].endswith(".png") and ark["file_path"].endswith(".png")
    assert FakeClient.last_json["response_format"] == "b64_json"
    assert FakeClient.last_json["sequential_image_generation"] == "disabled"


def test_comfyui_template_replacement_keeps_numeric_types():
    workflow = {"1": {"inputs": {"text": "{{PROMPT}}", "seed": "{{SEED}}", "name": "ref={{REFERENCE_1}}"}}}
    replaced = _replace(workflow, {
        "{{PROMPT}}": "商品图", "{{SEED}}": 42, "{{REFERENCE_1}}": "input/top.png",
    })
    assert replaced["1"]["inputs"] == {
        "text": "商品图", "seed": 42, "name": "ref=input/top.png",
    }


def test_provider_settings_never_return_secret(monkeypatch, tmp_path):
    monkeypatch.setattr("backend.app.routers.provider_settings.load_api_key", lambda provider_id: "stored-secret" if provider_id == "openai" else "")
    monkeypatch.setattr("backend.app.routers.provider_settings.api_key_source", lambda provider_id: "environment" if provider_id == "openai" else "none")
    with TestClient(app) as client:
        response = client.get("/api/provider-settings")
        assert response.status_code == 200
        raw = response.text
        assert "stored-secret" not in raw
        openai = next(item for item in response.json()["providers"] if item["id"] == "openai")
        assert openai["apiKeyConfigured"] is True
        assert openai["apiKeySource"] == "environment"
        assert openai["capabilities"]["maxReferenceImages"] == 16

        openrouter = client.put("/api/provider-settings/openrouter-icu", json={
            "model": "custom-image-model",
            "baseUrl": "https://images.example.test/v1",
            "cliPath": "tools/openrouter_icu_image.py",
            "maxBatchImages": 2,
            "maxEstimatedCostPerBatch": 3.5,
            "pricePerImageDraft": 1.25,
        })
        assert openrouter.status_code == 200, openrouter.text
        configured = openrouter.json()["provider"]
        assert configured["model"] == "custom-image-model"
        assert configured["baseUrl"] == "https://images.example.test/v1"
        assert configured["maxBatchImages"] == 2

        workflow = tmp_path / "workflow.json"
        workflow.write_text(json.dumps({"1": {"inputs": {"text": "{{PROMPT}}"}}}), encoding="utf-8")
        updated = client.put("/api/provider-settings/comfyui", json={
            "baseUrl": "http://127.0.0.1:8188",
            "workflowPath": str(workflow),
        })
        assert updated.status_code == 200, updated.text
        assert updated.json()["provider"]["workflowPath"] == str(workflow)


def test_real_provider_batch_limit_blocks_before_queue(monkeypatch):
    monkeypatch.setattr(
        "backend.app.routers.tasks.provider_setting",
        lambda _provider, key, default="": "1" if key == "maxBatchImages" else default,
    )
    with TestClient(app) as client:
        project = client.post("/api/projects", json={
            "sku": f"CAP-{uuid.uuid4().hex[:6]}", "name": "单批限额", "platform": "local", "budget": 100,
        }).json()
        client.post(f"/api/projects/{project['id']}/items", json={
            "name": "测试上衣", "categoryId": "top", "isSellable": True,
        })
        client.post(f"/api/projects/{project['id']}/tasks/plan", json={
            "presetId": "fast-check", "provider": "openai", "replaceExisting": True,
            "shotIds": ["flat-front", "flat-back"],
        })
        tasks = client.get(f"/api/projects/{project['id']}/tasks").json()["tasks"]
        response = client.post(
            f"/api/projects/{project['id']}/tasks/submit",
            json={"taskIds": [task["id"] for task in tasks]},
        )
        assert response.status_code == 409
        assert response.json()["detail"].startswith("openai ")
        remaining = client.get(f"/api/projects/{project['id']}/tasks").json()["tasks"]
        assert all(task["status"] == "planned" for task in remaining)


def test_care_label_extractor_marks_low_confidence_and_bad_total(monkeypatch, tmp_path):
    label = tmp_path / "label.png"
    label.write_bytes(png_bytes())
    extracted = {
        "labelDetected": True,
        "brand": "LONGY",
        "productName": "衬衫",
        "composition": [
            {"name": "棉", "percent": 60, "confidence": 0.98},
            {"name": "聚酯纤维", "percent": 30, "confidence": 0.65},
        ],
        "instructions": [{"code": "max_30", "confidence": 0.9}],
        "warnings": [{"text": "深浅色分开洗涤", "confidence": 0.75}],
        "rawText": ["棉60%", "聚酯纤维30%"],
        "uncertainFields": [],
    }

    class ExtractionResponse(FakeResponse):
        def json(self):
            return {"output": [{"type": "message", "content": [{
                "type": "output_text", "text": json.dumps(extracted, ensure_ascii=False),
            }]}]}

    monkeypatch.setattr("backend.app.services.care_label_extractor.load_api_key", lambda _: "secret")
    monkeypatch.setattr("backend.app.services.care_label_extractor.provider_setting", lambda _p, key, default="": default)
    monkeypatch.setattr("backend.app.services.care_label_extractor.httpx.post", lambda *args, **kwargs: ExtractionResponse())
    result = extract_care_label(label, "openai")
    assert result["draft"]["brand"] == "LONGY"
    assert result["draft"]["instructions"][0]["code"] == "max_30"
    assert result["draft"]["uncertainFields"] == ["composition", "compositionTotal", "warnings"]
