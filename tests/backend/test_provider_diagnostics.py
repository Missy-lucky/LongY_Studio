import json

from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.services import provider_diagnostics


class FakeResponse:
    def __init__(self, status_code: int):
        self.status_code = status_code


class FakeClient:
    status_code = 200
    last_base_url = ""
    last_path = ""

    def __init__(self, *args, **kwargs):
        type(self).last_base_url = kwargs.get("base_url", "")

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def get(self, path):
        type(self).last_path = path
        return FakeResponse(type(self).status_code)


def test_openai_diagnostic_uses_non_billable_model_lookup(monkeypatch):
    monkeypatch.setattr(provider_diagnostics, "load_api_key", lambda _: "secret")
    monkeypatch.setattr(
        provider_diagnostics,
        "provider_setting",
        lambda _provider, key, default="": {
            "model": "gpt-image-test",
            "baseUrl": "https://api.example.test/v1",
        }.get(key, default),
    )
    monkeypatch.setattr(provider_diagnostics.httpx, "Client", FakeClient)
    FakeClient.status_code = 200

    result = provider_diagnostics.diagnose_provider("openai")

    assert result["status"] == "ready"
    assert result["canGenerate"] is True
    assert result["networkChecked"] is True
    assert result["billableRequest"] is False
    assert FakeClient.last_base_url == "https://api.example.test/v1"
    assert FakeClient.last_path == "/models/gpt-image-test"


def test_cloud_diagnostic_reports_missing_key_without_network(monkeypatch):
    monkeypatch.setattr(provider_diagnostics, "load_api_key", lambda _: "")
    monkeypatch.setattr(provider_diagnostics, "provider_setting", lambda _p, _key, default="": default)

    result = provider_diagnostics.diagnose_provider("volcengine-ark")

    assert result["status"] == "error"
    assert result["canGenerate"] is False
    assert result["networkChecked"] is False
    assert next(item for item in result["checks"] if item["id"] == "api-key")["status"] == "fail"


def test_openai_diagnostic_maps_authentication_failure(monkeypatch):
    monkeypatch.setattr(provider_diagnostics, "load_api_key", lambda _: "bad-secret")
    monkeypatch.setattr(provider_diagnostics, "provider_setting", lambda _p, _key, default="": default)
    monkeypatch.setattr(provider_diagnostics.httpx, "Client", FakeClient)
    FakeClient.status_code = 401

    result = provider_diagnostics.diagnose_provider("openai")

    assert result["status"] == "error"
    assert result["canGenerate"] is False
    assert "无效" in result["checks"][-1]["message"]


def test_comfyui_diagnostic_validates_workflow_and_service(monkeypatch, tmp_path):
    workflow = tmp_path / "workflow.json"
    workflow.write_text(json.dumps({"1": {"inputs": {"text": "{{PROMPT}}"}}}), encoding="utf-8")
    monkeypatch.setattr(
        provider_diagnostics,
        "provider_setting",
        lambda _provider, key, default="": {
            "workflowPath": str(workflow),
            "baseUrl": "http://127.0.0.1:8188",
        }.get(key, default),
    )
    monkeypatch.setattr(provider_diagnostics.httpx, "Client", FakeClient)
    FakeClient.status_code = 200

    result = provider_diagnostics.diagnose_provider("comfyui")

    assert result["status"] == "ready"
    assert result["billableRequest"] is False
    assert FakeClient.last_path == "/system_stats"


def test_provider_diagnostic_endpoint_returns_contract(monkeypatch):
    expected = {
        "providerId": "openrouter-icu",
        "status": "warning",
        "canGenerate": True,
        "networkChecked": False,
        "billableRequest": False,
        "message": "本地预检完成",
        "checks": [],
    }
    monkeypatch.setattr("backend.app.routers.provider_settings.diagnose_provider", lambda _: expected)
    with TestClient(app) as client:
        response = client.post("/api/provider-settings/openrouter-icu/diagnose")
    assert response.status_code == 200
    assert response.json() == {"diagnostic": expected}
