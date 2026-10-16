"""单品接口：素材确认后形成可规划的商品单品。"""
import json
import uuid
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from ..config import settings
from ..database import get_db, utc_now
from ..services.garment_structure import normalize_structure_facts
from ..services.library_loader import load_shot_templates
from ..utils.case import camelize

router = APIRouter()


class ItemIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str = Field(min_length=1)
    category_id: str = Field(alias="categoryId")
    attributes: dict[str, bool] = Field(default_factory=dict)
    structure_facts: dict[str, str] = Field(default_factory=dict, alias="structureFacts")
    color_material: str = Field(default="", alias="colorMaterial")
    selling_points: str = Field(default="", alias="sellingPoints")
    is_sellable: bool = Field(default=True, alias="isSellable")


class ItemUpdateIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    category_id: str | None = Field(default=None, alias="categoryId")
    attributes: dict[str, bool] | None = None
    structure_facts: dict[str, str] | None = Field(default=None, alias="structureFacts")


def _validated_attributes(category_id: str, attributes: dict[str, bool]) -> dict[str, bool]:
    template = load_shot_templates().get(category_id)
    if not template:
        raise HTTPException(422, "品类套图模板不存在")
    allowed = {attribute["key"] for attribute in template["attributes"]}
    invalid = set(attributes) - allowed
    if invalid:
        raise HTTPException(
            400,
            f"非法商品属性：{', '.join(sorted(invalid))}；可选属性：{', '.join(sorted(allowed))}",
        )
    return attributes


def _structure_facts(raw: dict[str, str] | None) -> dict[str, str]:
    try:
        return normalize_structure_facts(raw)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


def _item_dict(row) -> dict:
    item = dict(row)
    item["attributes"] = json.loads(item.pop("attributes_json") or "{}")
    item["structure_facts"] = json.loads(item.pop("structure_json") or "{}")
    return camelize(item)


def _delete_storage_files(values: list[str]) -> None:
    root = settings.data_dir.resolve()
    for value in values:
        path = Path(value)
        if not path.is_absolute():
            path = settings.data_dir / path
        path = path.resolve()
        if path.is_relative_to(root):
            path.unlink(missing_ok=True)


@router.get("")
def list_items(project_id: str) -> dict:
    db = get_db()
    try:
        rows = db.execute("SELECT * FROM items WHERE project_id=? ORDER BY created_at,id", (project_id,)).fetchall()
        return {"items": [_item_dict(row) for row in rows]}
    finally:
        db.close()


@router.post("")
def create_item(project_id: str, body: ItemIn) -> dict:
    db = get_db()
    try:
        if not db.execute("SELECT 1 FROM projects WHERE id=?", (project_id,)).fetchone():
            raise HTTPException(404, "项目不存在")
        if not db.execute("SELECT 1 FROM categories WHERE id=?", (body.category_id,)).fetchone():
            raise HTTPException(422, "品类不存在")
        attributes = _validated_attributes(body.category_id, body.attributes)
        structure_facts = _structure_facts(body.structure_facts)

        iid = uuid.uuid4().hex[:12]
        now = utc_now()
        attributes_json = json.dumps(attributes, ensure_ascii=False, sort_keys=True)
        structure_json = json.dumps(structure_facts, ensure_ascii=False)
        db.execute(
            """INSERT INTO items(
                   id,project_id,name,category_id,attributes_json,structure_json,
                   color_material,selling_points,is_sellable,created_at,updated_at
               ) VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
            (iid, project_id, body.name, body.category_id, attributes_json, structure_json,
             body.color_material, body.selling_points, int(body.is_sellable), now, now),
        )
        db.execute("INSERT INTO events(time,project_id,type,message) VALUES(?,?,?,?)",
                   (now, project_id, "item.create", f"新增单品：{body.name}"))
        db.commit()
        row = db.execute("SELECT * FROM items WHERE id=?", (iid,)).fetchone()
        return _item_dict(row)
    finally:
        db.close()


@router.patch("/{item_id}")
def update_item(project_id: str, item_id: str, body: ItemUpdateIn) -> dict:
    db = get_db()
    invalidated_files: list[str] = []
    try:
        row = db.execute(
            "SELECT * FROM items WHERE id=? AND project_id=?", (item_id, project_id)
        ).fetchone()
        if not row:
            raise HTTPException(404, "单品不存在")
        category_id = body.category_id or row["category_id"]
        if not db.execute("SELECT 1 FROM categories WHERE id=?", (category_id,)).fetchone():
            raise HTTPException(422, "品类不存在")
        attributes = (
            _validated_attributes(category_id, body.attributes)
            if body.attributes is not None
            else {} if body.category_id else json.loads(row["attributes_json"] or "{}")
        )
        structure_facts = (
            _structure_facts(body.structure_facts)
            if body.structure_facts is not None
            else json.loads(row["structure_json"] or "{}")
        )
        now = utc_now()
        category_changed = body.category_id is not None and category_id != row["category_id"]
        if category_changed:
            version_rows = db.execute(
                """SELECT v.file_path,v.qc_report_path,v.mask_path
                   FROM task_versions v JOIN tasks t ON t.id=v.task_id
                   WHERE t.item_id=? AND t.project_id=?""",
                (item_id, project_id),
            ).fetchall()
            for version_row in version_rows:
                invalidated_files.extend(value for value in version_row if value)
            db.execute(
                "DELETE FROM tasks WHERE item_id=? AND project_id=?", (item_id, project_id)
            )
            db.execute(
                "DELETE FROM project_shot_selections WHERE item_id=? AND project_id=?",
                (item_id, project_id),
            )
        db.execute(
            """UPDATE items SET category_id=?,attributes_json=?,structure_json=?,updated_at=?
               WHERE id=? AND project_id=?""",
            (
                category_id,
                json.dumps(attributes, ensure_ascii=False, sort_keys=True),
                json.dumps(structure_facts, ensure_ascii=False),
                now,
                item_id,
                project_id,
            ),
        )
        if body.category_id:
            db.execute(
                "UPDATE assets SET category_id=? WHERE item_id=? AND project_id=?",
                (category_id, item_id, project_id),
            )
        db.execute(
            "INSERT INTO events(time,project_id,type,message) VALUES(?,?,?,?)",
            (
                now, project_id,
                "item.category.update" if category_changed else "item.facts.update",
                f"更新单品品类并清除旧镜头方案：{row['name']}"
                if category_changed else f"更新单品结构事实：{row['name']}",
            ),
        )
        db.commit()
        _delete_storage_files(invalidated_files)
        updated = db.execute("SELECT * FROM items WHERE id=?", (item_id,)).fetchone()
        return _item_dict(updated)
    finally:
        db.close()


@router.delete("/{item_id}")
def delete_item(project_id: str, item_id: str) -> dict:
    db = get_db()
    try:
        item = db.execute(
            "SELECT name FROM items WHERE id=? AND project_id=?", (item_id, project_id)
        ).fetchone()
        if not item:
            raise HTTPException(404, "单品不存在")
        files = [
            row["file_path"]
            for row in db.execute(
                "SELECT file_path FROM assets WHERE item_id=? AND project_id=?",
                (item_id, project_id),
            ).fetchall()
            if row["file_path"]
        ]
        version_rows = db.execute(
            """SELECT v.file_path,v.qc_report_path,v.mask_path
               FROM task_versions v JOIN tasks t ON t.id=v.task_id
               WHERE t.item_id=? AND t.project_id=?""",
            (item_id, project_id),
        ).fetchall()
        for row in version_rows:
            files.extend(value for value in row if value)
        with db:
            db.execute(
                "DELETE FROM assets WHERE item_id=? AND project_id=?", (item_id, project_id)
            )
            db.execute(
                "DELETE FROM items WHERE id=? AND project_id=?", (item_id, project_id)
            )
            db.execute(
                "INSERT INTO events(time,project_id,type,message) VALUES(?,?,?,?)",
                (utc_now(), project_id, "item.delete", f"删除单品：{item['name']}"),
            )
        _delete_storage_files(files)
        return {"deleted": True}
    finally:
        db.close()
