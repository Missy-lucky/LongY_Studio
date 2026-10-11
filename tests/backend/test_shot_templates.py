import os
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
os.environ.setdefault("LONGY_DATA_DIR", str(ROOT / "temp" / "tests" / "backend-data"))

from backend.app.services.library_loader import load_shot_templates, validate_shot_template  # noqa: E402


def test_all_shot_templates_are_indexed_by_category():
    templates = load_shot_templates()
    assert len(templates) == 33
    assert templates["hoodie"]["categoryName"] == "卫衣"


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
    )
    assert "Image 1 is the authoritative original clothing" in prompt
    assert "Category display rules: 保留袋鼠口袋" in prompt
    assert "Shot rules: 双袖对称展开" in prompt
    assert "Color / material record: 黑色 / 毛圈布" in prompt

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
