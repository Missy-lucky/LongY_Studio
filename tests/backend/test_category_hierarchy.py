import os
import uuid
from pathlib import Path

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]
os.environ.setdefault("LONGY_DATA_DIR", str(ROOT / "temp" / "tests" / "backend-data"))

from backend.app.main import app  # noqa: E402


def test_category_api_exposes_primary_and_secondary_categories():
    with TestClient(app) as client:
        categories = client.get("/api/library/categories").json()["categories"]
        by_id = {category["id"]: category for category in categories}
        assert len(categories) == 42
        assert by_id["baseballCap"]["group"] == "配饰"
        assert by_id["baseballCap"]["parentId"] == "accessory"
        assert by_id["suitPants"]["group"] == "下装"
        assert by_id["suitPants"]["parentId"] == "lower"


def test_leaf_category_and_primary_group_reach_generation_prompt():
    with TestClient(app) as client:
        project = client.post("/api/projects", json={
            "sku": f"TAX-{uuid.uuid4().hex[:6]}",
            "name": "二级品类提示词测试",
            "platform": "taobao",
            "style": "简约",
            "budget": 10,
        }).json()
        item = client.post(f"/api/projects/{project['id']}/items", json={
            "name": "黑色机车皮衣",
            "categoryId": "leatherJacket",
            "attributes": {"hasZipper": True, "hasBelt": False},
        })
        assert item.status_code == 200
        planned = client.post(f"/api/projects/{project['id']}/tasks/plan", json={
            "presetId": "fast-check",
            "provider": "mock",
            "replaceExisting": True,
            "modelIds": ["chinese-grand"],
        })
        assert planned.status_code == 200
        tasks = client.get(f"/api/projects/{project['id']}/tasks").json()["tasks"]
        assert tasks
        assert all("Primary category: 上装" in task["prompt"] or "一级分类：上装" in task["prompt"] for task in tasks)
        assert all("皮衣" in task["prompt"] for task in tasks)
