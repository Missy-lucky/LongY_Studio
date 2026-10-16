import os
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
os.environ.setdefault("LONGY_DATA_DIR", str(ROOT / "temp" / "tests" / "backend-data"))

from backend.app.services.library_loader import load_shot_templates, validate_shot_template  # noqa: E402


def test_all_shot_templates_are_indexed_by_category():
    templates = load_shot_templates()
    assert len(templates) == 42
    assert templates["hoodie"]["categoryName"] == "卫衣"
    assert {
        "beanie", "baseballCap", "leatherJacket", "jacket", "paddedCoat",
        "casualPants", "suitPants", "tie", "silkScarf",
    } <= set(templates)


def test_partial_shots_are_on_model_product_closeups():
    for template in load_shot_templates().values():
        assert template["shots"]["partial"]
        for shot in template["shots"]["partial"]:
            assert shot["references"] == ["garment", "model-identity"]
            assert "模特" in shot["name"]
            assert "不从全身成图裁切放大" in shot["promptHints"]


def test_template_schema_requires_complete_fields():
    template = {"schema": "longy.shot-template.v1", "category": "test", "attributes": []}
    with pytest.raises(ValueError, match="缺少字段"):
        validate_shot_template(template, "test.json")


from pathlib import Path

from backend.app.database import get_db, init_db


def test_shot_template_migration_adds_item_and_task_fields():
    init_db()
    db = get_db()
    try:
        item_columns = {row["name"] for row in db.execute("PRAGMA table_info(items)")}
        task_columns = {row["name"] for row in db.execute("PRAGMA table_info(tasks)")}
        assert "attributes_json" in item_columns
        assert {"shot_id", "shot_name", "priority"} <= task_columns
        category_columns = {row["name"] for row in db.execute("PRAGMA table_info(categories)")}
        assert {"group_name", "parent_category_id"} <= category_columns
        selection_columns = {
            row["name"] for row in db.execute("PRAGMA table_info(project_shot_selections)")
        }
        assert {"prompt_mode", "custom_prompt"} <= selection_columns
    finally:
        db.close()


from fastapi.testclient import TestClient

from backend.app.main import app


def test_item_attributes_are_validated_and_persisted():
    import uuid

    with TestClient(app) as client:
        project = client.post("/api/projects", json={
            "sku": f"ATTR-{uuid.uuid4().hex[:6]}", "name": "属性录入测试", "platform": "taobao",
            "style": "简约", "budget": 10,
        }).json()
        item = client.post(f"/api/projects/{project['id']}/items", json={
            "name": "连帽卫衣", "categoryId": "hoodie",
            "attributes": {"hasHood": True, "hasZip": False},
            "colorMaterial": "深灰 / 毛圈布", "sellingPoints": "重磅",
        })
        assert item.status_code == 200
        assert item.json()["attributes"] == {"hasHood": True, "hasZip": False}

        invalid = client.post(f"/api/projects/{project['id']}/items", json={
            "name": "非法属性", "categoryId": "hoodie", "attributes": {"hasZipper": True},
        })
        assert invalid.status_code == 400
        assert "非法商品属性" in invalid.json()["detail"]

        template = client.get("/api/library/shot-templates/hoodie")
        assert template.status_code == 200
        assert template.json()["template"]["attributes"][0]["key"] == "hasHood"


def test_shot_preview_exposes_only_missing_default_garments():
    import uuid

    with TestClient(app) as client:
        project = client.post("/api/projects", json={
            "sku": f"FALLBACK-{uuid.uuid4().hex[:6]}", "name": "补位预览测试",
            "platform": "taobao", "style": "简约", "budget": 10,
        }).json()
        project_id = project["id"]
        client.post(f"/api/projects/{project_id}/items", json={
            "name": "短款上衣", "categoryId": "top", "isSellable": True,
        })

        preview = client.post(f"/api/projects/{project_id}/tasks/plan/preview", json={
            "presetId": "fast-check", "provider": "mock",
        }).json()
        assert [item["id"] for item in preview["outfitFallbacks"]] == [
            "neutral-yoga-shorts",
        ]
        fallback = preview["outfitFallbacks"][0]
        assert fallback["reason"] == "未上传下装"
        image = client.get(fallback["previewUrl"])
        assert image.status_code == 200
        assert image.headers["content-type"] == "image/png"
        assert client.get("/api/library/default-garments/not-found/file").status_code == 404

        client.post(f"/api/projects/{project_id}/items", json={
            "name": "搭配长裤", "categoryId": "pants", "isSellable": False,
        })
        complete = client.post(f"/api/projects/{project_id}/tasks/plan/preview", json={
            "presetId": "fast-check", "provider": "mock",
        }).json()
        assert complete["outfitFallbacks"] == []

def test_hoodie_shot_template_expands_conditional_tasks_and_presets():
    import uuid

    with TestClient(app) as client:
        project = client.post("/api/projects", json={
            "sku": f"SHOT-{uuid.uuid4().hex[:6]}", "name": "套图规划测试", "platform": "taobao",
            "style": "简约", "budget": 10,
        }).json()
        client.post(f"/api/projects/{project['id']}/items", json={
            "name": "卫衣", "categoryId": "hoodie",
            "attributes": {"hasHood": True, "hasZip": False},
        })
        planned = client.post(f"/api/projects/{project['id']}/tasks/plan", json={
            "presetId": "draft-first", "provider": "mock", "replaceExisting": True,
            "modelIds": ["chinese-grand"],
        }).json()
        assert len(planned["planned"]) == 16  # P0+P1：模板 P2 被预设裁剪
        tasks = client.get(f"/api/projects/{project['id']}/tasks").json()["tasks"]
        shot_ids = {task["shotId"] for task in tasks}
        assert {"detail-hood", "detail-drawstring"} <= shot_ids
        assert "detail-zipper" not in shot_ids
        assert all(task["priority"] in {"P0", "P1"} for task in tasks)
        assert all(task["provider"] == "mock" for task in tasks)
        hood = next(task for task in tasks if task["shotId"] == "detail-hood")
        assert hood["shotName"] == "帽型特写"
        assert "Shot rules: 帽体立起" in hood["prompt"]
        partials = [task for task in tasks if task["type"] == "partial"]
        assert partials and all(task["modelId"] == "chinese-grand" for task in partials)
        assert all("不得从全身图裁切或放大" in task["prompt"] for task in partials)
        assert all("默认补位素材：深灰高腰瑜伽短裤" in task["prompt"] for task in partials)
        model_task = next(task for task in tasks if task["type"] == "model")
        assert "Complete outfit manifest" in model_task["prompt"]
        assert "卫衣（卫衣，售卖商品）" in model_task["prompt"]

        fast = client.post(f"/api/projects/{project['id']}/tasks/plan", json={
            "presetId": "fast-check", "provider": "mock", "replaceExisting": True,
            "modelIds": ["chinese-grand"],
        }).json()
        assert len(fast["planned"]) == 10
        tasks = client.get(f"/api/projects/{project['id']}/tasks").json()["tasks"]
        assert tasks
        assert all(task["priority"] == "P0" for task in tasks)
        assert "detail-drawstring" not in {task["shotId"] for task in tasks}


def test_prompt_builder_combines_legacy_category_and_shot_rules():
    from backend.app.services.prompt_builder import build_prompt

    prompt = build_prompt(
        "flat", "测试卫衣", "卫衣", "正面平铺图",
        color_material="黑色 / 毛圈布", selling_points="重磅面料",
        model_hint="保留袋鼠口袋", shot_hint="双袖对称展开",
        category_group="上装",
    )
    assert "Image 1 is the authoritative original clothing" in prompt
    assert "Category display rules: 保留袋鼠口袋" in prompt
    assert "Shot rules: 双袖对称展开" in prompt
    assert "Color / material record: 黑色 / 毛圈布" in prompt
    assert "Primary category: 上装" in prompt
    assert "Evidence-calibrated safeguards (example-calibration-v1)" in prompt

    closeup = build_prompt(
        "partial", "测试卫衣", "卫衣", "胸前商品区域",
        model_name="中国风模特", outfit_context="- 测试卫衣（卫衣，售卖商品）",
    )
    assert "模特上身商品特写" in closeup
    assert "不得从全身图裁切或放大" in closeup
    assert "Model identity: 中国风模特" in closeup

    outfit = build_prompt(
        "model", "测试卫衣", "卫衣", "正面全身",
        model_name="中国风模特",
        outfit_context="- 测试卫衣（卫衣，售卖商品）\n- 默认补位素材：深灰高腰瑜伽短裤",
    )
    assert "Complete outfit manifest" in outfit
    assert "logo-free light-stone cropped sports tank" in outfit


def test_prompt_calibration_evidence_matches_workbook_registry():
    import json

    from backend.app.services.prompt_builder import calibration_profile

    profile = calibration_profile()
    registry = json.loads(
        (ROOT / "asset-library" / "qc-rules" / "reference-workbook.json").read_text(
            encoding="utf-8"
        )
    )
    counts = registry["summary"]["byClassification"]
    assert profile["evidenceSummary"] == {
        "approvedReference": counts["approved_reference"],
        "rejectedOutput": counts["rejected_output"],
        "defectEvidence": counts["defect_evidence"],
        "sourceContext": counts["source_context"],
        "unfinishedSource": counts["unfinished_source"],
    }
    assert set(profile["safeguards"]) == {"flat", "detail", "partial", "model"}
    assert all(profile["safeguards"].values())


def test_custom_prompt_is_saved_restored_and_applied_before_first_generation():
    import uuid

    marker = "CUSTOM_BEFORE_FIRST_GENERATION"
    with TestClient(app) as client:
        project = client.post("/api/projects", json={
            "sku": f"PROMPT-{uuid.uuid4().hex[:6]}",
            "name": "首次生成自定义提示词测试", "platform": "taobao",
            "style": "简约", "budget": 10,
        }).json()
        pid = project["id"]
        item = client.post(f"/api/projects/{pid}/items", json={
            "name": "卫衣", "categoryId": "hoodie",
            "attributes": {"hasHood": True, "hasZip": False},
        }).json()
        preview = client.post(f"/api/projects/{pid}/tasks/plan/preview", json={
            "provider": "mock", "modelIds": ["chinese-grand"],
        }).json()
        shot = next(
            candidate for candidate in preview["items"][0]["shots"]
            if candidate["shotId"] == "flat-front"
        )
        payload = {
            "itemId": item["id"], "shotId": shot["shotId"],
            "shotName": shot["shotName"], "type": shot["type"],
            "priority": shot["priority"], "required": shot["required"],
            "isCustom": False, "status": "selected", "source": "ai",
            "reason": "", "promptHints": shot["promptHints"],
            "promptMode": "custom", "customPrompt": marker,
        }
        saved = client.put(
            f"/api/projects/{pid}/tasks/shot-selections",
            json={"selections": [payload]},
        )
        assert saved.status_code == 200

        restored = client.post(f"/api/projects/{pid}/tasks/plan/preview", json={
            "provider": "mock", "modelIds": ["chinese-grand"],
        }).json()
        restored_shot = next(
            candidate for candidate in restored["items"][0]["shots"]
            if candidate["shotId"] == "flat-front"
        )
        assert restored_shot["promptMode"] == "custom"
        assert restored_shot["customPrompt"] == marker

        planned = client.post(f"/api/projects/{pid}/tasks/plan", json={
            "presetId": "fast-check", "provider": "mock", "replaceExisting": True,
            "modelIds": ["chinese-grand"], "shotIds": ["flat-front"],
        }).json()
        assert len(planned["planned"]) == 1
        task = client.get(f"/api/projects/{pid}/tasks").json()["tasks"][0]
        assert marker in task["prompt"]
        assert "authoritative original clothing" in task["prompt"]
        assert "without overriding" in task["prompt"]

        payload["promptMode"] = "default"
        assert client.put(
            f"/api/projects/{pid}/tasks/shot-selections",
            json={"selections": [payload]},
        ).status_code == 200
        replanned = client.post(f"/api/projects/{pid}/tasks/plan", json={
            "presetId": "fast-check", "provider": "mock", "replaceExisting": True,
            "modelIds": ["chinese-grand"], "shotIds": ["flat-front"],
        }).json()
        assert len(replanned["planned"]) == 1
        default_task = client.get(f"/api/projects/{pid}/tasks").json()["tasks"][0]
        assert marker not in default_task["prompt"]
        assert "authoritative original clothing" in default_task["prompt"]

def test_export_coverage_blocks_missing_required_shot():
    import uuid

    from backend.app.database import get_db

    with TestClient(app) as client:
        suffix = uuid.uuid4().hex[:6]
        project = client.post("/api/projects", json={
            "sku": f"COV-{suffix}", "name": "导出覆盖测试", "platform": "taobao",
            "style": "简约", "budget": 10,
        }).json()
        pid = project["id"]
        client.post(f"/api/projects/{pid}/items", json={
            "name": "卫衣", "categoryId": "hoodie", "attributes": {"hasHood": True, "hasZip": False},
        })
        client.post(f"/api/projects/{pid}/tasks/plan", json={
            "presetId": "fast-check", "provider": "mock", "replaceExisting": True,
            "modelIds": ["chinese-grand"],
        })
        preview = client.get(f"/api/projects/{pid}/exports/preview").json()
        assert not preview["coverageComplete"]
        assert "帽型特写" in preview["missingShotNames"]

        db = get_db()
        try:
            db.execute(
                "UPDATE tasks SET status='accepted' WHERE project_id=?", (pid,)
            )
            hood = db.execute(
                "SELECT id FROM tasks WHERE project_id=? AND shot_id='detail-hood'", (pid,)
            ).fetchone()
            db.execute("DELETE FROM tasks WHERE id=?", (hood["id"],))
            db.commit()
        finally:
            db.close()

        preview = client.get(f"/api/projects/{pid}/exports/preview").json()
        assert preview["missingShotNames"] == ["帽型特写"]
        blocked = client.post(f"/api/projects/{pid}/exports", json={"taskIds": []})
        assert blocked.status_code == 409
        assert "帽型特写" in blocked.json()["detail"]

def test_editable_shot_plan_controls_cost_and_coverage():
    import uuid

    with TestClient(app) as client:
        suffix = uuid.uuid4().hex[:6]
        project = client.post("/api/projects", json={
            "sku": f"PLAN-{suffix}", "name": "镜头方案确认测试", "platform": "taobao",
            "style": "简约", "budget": 10,
        }).json()
        pid = project["id"]
        client.post(f"/api/projects/{pid}/items", json={
            "name": "卫衣", "categoryId": "hoodie",
            "attributes": {"hasHood": True, "hasZip": False},
        })
        preview = client.post(f"/api/projects/{pid}/tasks/plan/preview", json={
            "presetId": "draft-first", "provider": "mock", "modelIds": ["chinese-grand"],
        }).json()
        shots = preview["items"][0]["shots"]
        assert preview["selectedCount"] == 10
        assert all(shot["status"] == "selected" for shot in shots if shot["priority"] == "P0")
        assert all(shot["status"] == "proposed" for shot in shots if shot["priority"] != "P0")

        p0 = [shot for shot in shots if shot["priority"] == "P0"]
        selected = p0[:2]
        selected_ids = {shot["shotId"] for shot in selected}
        payload = []
        for shot in shots:
            row = {
                "itemId": preview["items"][0]["itemId"],
                "shotId": shot["shotId"],
                "shotName": shot["shotName"],
                "type": shot["type"],
                "priority": shot["priority"],
                "required": shot["required"],
                "isCustom": shot["isCustom"],
                "status": "selected" if shot["shotId"] in selected_ids else "waived",
                "source": "ai",
                "reason": "" if shot["shotId"] in selected_ids else "本次上架不需要",
                "promptHints": shot["promptHints"],
            }
            payload.append(row)
        saved = client.put(f"/api/projects/{pid}/tasks/shot-selections", json={"selections": payload})
        assert saved.status_code == 200 and saved.json()["saved"] == len(payload)

        planned = client.post(f"/api/projects/{pid}/tasks/plan", json={
            "presetId": "draft-first", "provider": "mock", "replaceExisting": True,
            "modelIds": ["chinese-grand"], "shotIds": sorted(selected_ids),
        }).json()
        assert len(planned["planned"]) == 2
        tasks = client.get(f"/api/projects/{pid}/tasks").json()["tasks"]
        assert {task["shotId"] for task in tasks} == selected_ids

        preview = client.get(f"/api/projects/{pid}/exports/preview").json()
        assert not preview["coverageComplete"]
        db = get_db()
        try:
            db.execute("UPDATE tasks SET status='accepted' WHERE project_id=?", (pid,))
            db.commit()
        finally:
            db.close()
        preview = client.get(f"/api/projects/{pid}/exports/preview").json()
        assert preview["coverageComplete"]
        waived = [item for item in preview["coverage"] if item["source"] == "manual"]
        assert waived and all(item["ready"] for item in waived)

def test_custom_shot_can_be_added_and_planned():
    import uuid

    with TestClient(app) as client:
        suffix = uuid.uuid4().hex[:6]
        project = client.post("/api/projects", json={
            "sku": f"CUSTOM-{suffix}", "name": "自定义镜头测试", "platform": "taobao",
            "style": "简约", "budget": 10,
        }).json()
        pid = project["id"]
        item = client.post(f"/api/projects/{pid}/items", json={
            "name": "工装裤", "categoryId": "pants", "attributes": {},
        }).json()
        saved = client.put(f"/api/projects/{pid}/tasks/shot-selections", json={"selections": [{
            "itemId": item["id"], "shotId": "custom-reflective-strip",
            "shotName": "反光条特写", "type": "detail", "priority": "P0",
            "required": True, "isCustom": True, "status": "selected", "source": "ai",
            "reason": "", "promptHints": "微距展示反光条反光效果与缝线",
        }]})
        assert saved.status_code == 200
        preview = client.post(f"/api/projects/{pid}/tasks/plan/preview", json={
            "presetId": "draft-first", "provider": "mock", "modelIds": ["chinese-grand"],
        }).json()
        custom = [shot for shot in preview["items"][0]["shots"] if shot["isCustom"]]
        assert [shot["shotName"] for shot in custom] == ["反光条特写"]

        planned = client.post(f"/api/projects/{pid}/tasks/plan", json={
            "presetId": "draft-first", "provider": "mock", "replaceExisting": True,
            "modelIds": ["chinese-grand"], "shotIds": ["custom-reflective-strip"],
        }).json()
        assert len(planned["planned"]) == 1
        task = client.get(f"/api/projects/{pid}/tasks").json()["tasks"][0]
        assert task["shotName"] == "反光条特写"
        assert "反光条反光效果" in task["prompt"]

        preview = client.get(f"/api/projects/{pid}/exports/preview").json()
        assert "反光条特写" in preview["missingShotNames"]
        db = get_db()
        try:
            db.execute("UPDATE tasks SET status='accepted' WHERE project_id=?", (pid,))
            db.commit()
        finally:
            db.close()
        custom_ready = [item for item in client.get(f"/api/projects/{pid}/exports/preview").json()["coverage"] if item["shotId"] == "custom-reflective-strip"]
        assert custom_ready and custom_ready[0]["ready"]

def test_fulfilled_original_asset_is_exported():
    import uuid
    from io import BytesIO

    from PIL import Image

    with TestClient(app) as client:
        suffix = uuid.uuid4().hex[:6]
        project = client.post("/api/projects", json={
            "sku": f"ASSET-{suffix}", "name": "原图抵扣导出测试", "platform": "taobao",
            "style": "简约", "budget": 10,
        }).json()
        pid = project["id"]
        item = client.post(f"/api/projects/{pid}/items", json={
            "name": "卫衣", "categoryId": "hoodie", "attributes": {"hasHood": True, "hasZip": False},
        }).json()
        image = Image.new("RGB", (80, 100), "#223344")
        buffer = BytesIO()
        image.save(buffer, format="PNG")
        uploaded = client.post(
            f"/api/projects/{pid}/assets/import",
            files={"files": ("original.png", buffer.getvalue(), "image/png")},
        ).json()
        assert uploaded["imported"] == 1
        asset = client.get(f"/api/projects/{pid}/assets").json()["assets"][0]
        assert client.post(f"/api/projects/{pid}/assets/{asset['id']}/confirm", json={
            "itemId": item["id"], "categoryId": "hoodie", "viewSlot": "front",
        }).json()["ok"]

        preview = client.post(f"/api/projects/{pid}/tasks/plan/preview", json={
            "provider": "mock", "modelIds": ["chinese-grand"],
        }).json()
        plan_item = preview["items"][0]
        selections = []
        for shot in plan_item["shots"]:
            if shot["priority"] != "P0":
                continue
            fulfilled = shot["shotId"] == "flat-front"
            selections.append({
                "itemId": plan_item["itemId"],
                "shotId": shot["shotId"],
                "shotName": shot["shotName"],
                "type": shot["type"],
                "priority": shot["priority"],
                "required": shot["required"],
                "isCustom": shot["isCustom"],
                "status": "fulfilled" if fulfilled else "waived",
                "source": "asset" if fulfilled else "manual",
                "assetId": asset["id"] if fulfilled else None,
                "reason": "" if fulfilled else "本次使用外部成片",
                "promptHints": shot["promptHints"],
            })
        assert client.put(f"/api/projects/{pid}/tasks/shot-selections", json={"selections": selections}).status_code == 200

        export_preview = client.get(f"/api/projects/{pid}/exports/preview").json()
        assert export_preview["coverageComplete"]
        asset_files = [file for file in export_preview["files"] if file["assetId"] == asset["id"]]
        assert len(asset_files) == 1
        exported = client.post(f"/api/projects/{pid}/exports", json={
                "taskIds": [], "assetIds": [asset["id"]], "namingScheme": "compact"
            }).json()
        assert exported["exported"] == 1
        assert exported["mapping"][0]["assetId"] == asset["id"]
        assert not Path(exported["mapping"][0]["written"]).name.startswith(project["sku"])
        assert Path(exported["mapping"][0]["written"]).is_file()

def test_single_flat_shot_plan_can_be_generated():
    import uuid

    with TestClient(app) as client:
        suffix = uuid.uuid4().hex[:6]
        project = client.post("/api/projects", json={
            "sku": f"ONE-FLAT-{suffix}", "name": "单张平面图测试", "platform": "taobao",
            "style": "简约", "budget": 10,
        }).json()
        pid = project["id"]
        client.post(f"/api/projects/{pid}/items", json={
            "name": "卫衣", "categoryId": "hoodie", "attributes": {"hasHood": True, "hasZip": False},
        })
        planned = client.post(f"/api/projects/{pid}/tasks/plan", json={
            "presetId": "draft-first", "provider": "mock", "replaceExisting": True,
            "modelIds": ["chinese-grand"], "shotIds": ["flat-front"],
        }).json()
        assert len(planned["planned"]) == 1
        tasks = client.get(f"/api/projects/{pid}/tasks").json()["tasks"]
        assert len(tasks) == 1
        assert tasks[0]["shotId"] == "flat-front"
        assert tasks[0]["type"] == "flat"

def test_project_layout_is_persisted_and_returned_with_project():
    import uuid

    with TestClient(app) as client:
        suffix = uuid.uuid4().hex[:6]
        project = client.post("/api/projects", json={
            "sku": f"LAYOUT-{suffix}", "name": "布局持久化测试", "platform": "taobao",
            "style": "简约", "budget": 10,
        }).json()
        pid = project["id"]
        layout = {
            "schemaVersion": "longy.project-layout.v1",
            "positions": {"asset-test": {"x": 123, "y": 456}},
            "roles": {"model": {"x": 78, "y": 90}},
        }
        saved = client.put(f"/api/projects/{pid}/layout", json=layout)
        assert saved.status_code == 200
        assert saved.json()["layout"] == layout
        detail = client.get(f"/api/projects/{pid}").json()
        assert detail["project"]["layout"] == layout
