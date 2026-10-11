import os
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
os.environ.setdefault("LONGY_DATA_DIR", str(ROOT / "temp" / "tests" / "library-data"))

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
