import os
import uuid
from pathlib import Path

from fastapi.testclient import TestClient


ROOT = Path(__file__).resolve().parents[2]
os.environ.setdefault("LONGY_DATA_DIR", str(ROOT / "temp" / "tests" / "garment-structure-data"))

from backend.app.main import app  # noqa: E402
from backend.app.services.consistency_qc import run_consistency_qc  # noqa: E402
from backend.app.services.garment_structure import (  # noqa: E402
    normalize_structure_facts,
    render_structure_facts,
)


def create_project(client: TestClient) -> dict:
    suffix = uuid.uuid4().hex[:6]
    return client.post("/api/projects", json={
        "sku": f"STRUCT-{suffix}",
        "name": "结构事实测试",
        "platform": "taobao",
        "style": "简约",
        "budget": 20,
    }).json()


def test_structure_module_normalizes_and_renders_only_declared_fields():
    facts = normalize_structure_facts({
        "neckline": "  翻领   领尖有双线  ",
        "closure": "单排五粒扣",
        "pattern": "",
    })

    assert facts == {"neckline": "翻领 领尖有双线", "closure": "单排五粒扣"}
    assert render_structure_facts(facts) == "- 领型 / 领口: 翻领 领尖有双线\n- 门襟 / 扣件: 单排五粒扣"

    try:
        normalize_structure_facts({"imaginedField": "不可接受"})
    except ValueError as exc:
        assert "未知结构字段" in str(exc)
    else:
        raise AssertionError("unknown structure fields must be rejected")


def test_item_structure_facts_persist_update_and_reach_prompts():
    with TestClient(app) as client:
        project = create_project(client)
        project_id = project["id"]
        item_response = client.post(f"/api/projects/{project_id}/items", json={
            "name": "结构锁定衬衫",
            "categoryId": "shirt",
            "attributes": {"hasPrint": False, "hasChestPocket": True},
            "structureFacts": {
                "neckline": "小方领，领尖双线",
                "sleeve": "长袖，单扣袖口",
                "closure": "单排七粒白色纽扣",
                "pockets": "左胸一个方形贴袋",
            },
            "colorMaterial": "米白色棉质",
            "sellingPoints": "领型和纽扣数量必须保持",
            "isSellable": True,
        })
        assert item_response.status_code == 200
        item = item_response.json()
        assert item["structureFacts"]["closure"] == "单排七粒白色纽扣"

        updated = client.patch(
            f"/api/projects/{project_id}/items/{item['id']}",
            json={
                "attributes": {"hasPrint": False, "hasChestPocket": True},
                "structureFacts": {
                    **item["structureFacts"],
                    "pattern": "正反面均无印花或标识",
                },
            },
        )
        assert updated.status_code == 200
        assert updated.json()["structureFacts"]["pattern"] == "正反面均无印花或标识"

        listed = client.get(f"/api/projects/{project_id}/items").json()["items"]
        assert listed[0]["structureFacts"] == updated.json()["structureFacts"]

        planned = client.post(f"/api/projects/{project_id}/tasks/plan", json={
            "presetId": "fast-check",
            "provider": "mock",
            "replaceExisting": True,
        })
        assert planned.status_code == 200
        tasks = client.get(f"/api/projects/{project_id}/tasks").json()["tasks"]
        assert tasks
        assert all("Locked garment structure facts" in task["prompt"] for task in tasks)
        assert all("单排七粒白色纽扣" in task["prompt"] for task in tasks)
        assert all("不得改变已记录" in task["negativePrompt"] for task in tasks)

        invalid = client.patch(
            f"/api/projects/{project_id}/items/{item['id']}",
            json={"structureFacts": {"unknown": "value"}},
        )
        assert invalid.status_code == 400
        assert "未知结构字段" in invalid.json()["detail"]


def test_consistency_report_exposes_honest_human_structure_checklist():
    reference = ROOT / "asset-library" / "reference-templates" / "plan-view.png"
    report = run_consistency_qc(
        reference,
        "flat",
        garment_reference=reference,
        enforce=False,
        deep_model_qc=False,
        structure_facts={"waist": "六个裤袢", "pockets": "两个斜插袋"},
    )

    assert report["structure"]["required"] is True
    assert report["structure"]["status"] == "human_review_required"
    assert report["structure"]["facts"] == [
        {"key": "pockets", "label": "口袋", "expected": "两个斜插袋"},
        {"key": "waist", "label": "腰头 / 腰部", "expected": "六个裤袢"},
    ]
