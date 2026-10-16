import uuid
from io import BytesIO

from fastapi.testclient import TestClient
from PIL import Image

from backend.app.main import app


def create_project(client: TestClient, prefix: str = "CARE") -> dict:
    return client.post("/api/projects", json={
        "sku": f"{prefix}-{uuid.uuid4().hex[:6]}",
        "name": "洗护说明测试",
        "platform": "taobao",
        "style": "简约",
        "budget": 10,
    }).json()


def valid_payload() -> dict:
    return {
        "brand": "LONGY",
        "productName": "棉质衬衫",
        "composition": [
            {"name": "棉", "percent": 50},
            {"name": "聚酯纤维", "percent": 50},
        ],
        "instructions": ["max_30", "do_not_bleach", "do_not_iron", "line_dry"],
        "warnings": ["深浅色衣物请分开洗涤"],
    }


def test_create_update_and_fetch_care_card():
    with TestClient(app) as client:
        project_id = create_project(client)["id"]
        created = client.post(f"/api/projects/{project_id}/care-cards", json=valid_payload())
        assert created.status_code == 200, created.text
        card = created.json()["careCard"]
        assert card["data"]["productName"] == "棉质衬衫"
        assert card["data"]["composition"][0] == {"name": "棉", "percent": 50.0}

        image_response = client.get(f"/api/projects/{project_id}/care-cards/{card['id']}/file")
        assert image_response.status_code == 200
        rendered = Image.open(BytesIO(image_response.content)).convert("RGB")
        assert rendered.size == (1200, 1600)
        assert rendered.getpixel((0, 0)) == (255, 255, 255)
        assert rendered.getbbox() is not None
        assert len(rendered.getcolors(maxcolors=1200 * 1600) or []) > 2

        listed = client.get(f"/api/projects/{project_id}/care-cards").json()
        assert [item["id"] for item in listed["careCards"]] == [card["id"]]
        assert listed["instructionLabels"]["do_not_iron"] == "不可熨烫"

        payload = valid_payload()
        payload["productName"] = "修订后的棉质衬衫"
        payload["warnings"] = ["反面洗涤", "请勿长时间浸泡"]
        updated = client.put(
            f"/api/projects/{project_id}/care-cards/{card['id']}", json=payload,
        )
        assert updated.status_code == 200, updated.text
        assert updated.json()["careCard"]["data"]["productName"] == "修订后的棉质衬衫"


def test_care_card_rejects_invalid_composition_and_conflicting_instructions():
    with TestClient(app) as client:
        project_id = create_project(client, "CARE-INVALID")["id"]
        bad_total = valid_payload()
        bad_total["composition"] = [{"name": "棉", "percent": 80}]
        response = client.post(f"/api/projects/{project_id}/care-cards", json=bad_total)
        assert response.status_code == 422
        assert "合计必须为 100%" in response.text

        conflict = valid_payload()
        conflict["instructions"] = ["do_not_iron", "low_iron"]
        response = client.post(f"/api/projects/{project_id}/care-cards", json=conflict)
        assert response.status_code == 422
        assert "冲突" in response.text


def test_care_card_source_asset_must_belong_to_project():
    with TestClient(app) as client:
        owner_id = create_project(client, "CARE-OWNER")["id"]
        other_id = create_project(client, "CARE-OTHER")["id"]
        image = BytesIO()
        Image.new("RGB", (400, 400), "white").save(image, format="PNG")
        imported = client.post(
            f"/api/projects/{owner_id}/assets/import",
            files={"files": ("wash-label.png", image.getvalue(), "image/png")},
        )
        assert imported.status_code == 200
        asset_id = client.get(f"/api/projects/{owner_id}/assets").json()["assets"][-1]["id"]

        payload = valid_payload()
        payload["sourceAssetId"] = asset_id
        denied = client.post(f"/api/projects/{other_id}/care-cards", json=payload)
        assert denied.status_code == 400
        assert "不属于当前项目" in denied.json()["detail"]

        denied_extract = client.post(f"/api/projects/{other_id}/care-cards/extract", json={
            "sourceAssetId": asset_id,
            "provider": "openai",
        })
        assert denied_extract.status_code == 400


def test_care_label_extraction_returns_reviewable_draft(monkeypatch):
    with TestClient(app) as client:
        project_id = create_project(client, "CARE-OCR")["id"]
        image = BytesIO()
        Image.new("RGB", (400, 400), "white").save(image, format="PNG")
        client.post(
            f"/api/projects/{project_id}/assets/import",
            files={"files": ("wash-label.png", image.getvalue(), "image/png")},
        )
        asset_id = client.get(f"/api/projects/{project_id}/assets").json()["assets"][-1]["id"]
        monkeypatch.setattr("backend.app.routers.care.extract_care_label", lambda _path, provider: {
            "provider": provider,
            "model": "vision-test",
            "draft": {
                "labelDetected": True,
                "brand": "LONGY",
                "productName": "测试衬衫",
                "composition": [{"name": "棉", "percent": 100, "confidence": 0.99}],
                "instructions": [{"code": "max_30", "confidence": 0.95}],
                "warnings": [],
                "rawText": ["棉 100%"],
                "uncertainFields": [],
            },
        })
        response = client.post(f"/api/projects/{project_id}/care-cards/extract", json={
            "sourceAssetId": asset_id,
            "provider": "openai",
        })
        assert response.status_code == 200, response.text
        assert response.json()["requiresConfirmation"] is True
        assert response.json()["draft"]["composition"][0]["percent"] == 100
