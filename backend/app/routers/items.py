"""单品接口：素材确认后形成可规划的商品单品。"""
import json
import uuid
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from ..database import get_db, utc_now
from ..services.library_loader import load_shot_templates
from ..utils.case import camelize

router = APIRouter()


class ItemIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str = Field(min_length=1)
    category_id: str = Field(alias="categoryId")
    attributes: dict[str, bool] = Field(default_factory=dict)
    color_material: str = Field(default="", alias="colorMaterial")
    selling_points: str = Field(default="", alias="sellingPoints")
    is_sellable: bool = Field(default=True, alias="isSellable")


@router.get("")
def list_items(project_id: str) -> dict:
    db = get_db()
    try:
        rows = db.execute("SELECT * FROM items WHERE project_id=? ORDER BY created_at,id", (project_id,)).fetchall()
        out = []
        for row in rows:
            item = dict(row)
            item["attributes"] = json.loads(item.pop("attributes_json") or "{}")
            out.append(item)
        return {"items": camelize(out)}
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
        template = load_shot_templates().get(body.category_id)
        if not template:
            raise HTTPException(422, "品类套图模板不存在")
        allowed_attributes = {attribute["key"] for attribute in template["attributes"]}
        invalid_attributes = set(body.attributes) - allowed_attributes
        if invalid_attributes:
            raise HTTPException(
                400,
                f"非法商品属性：{', '.join(sorted(invalid_attributes))}；可选属性：{', '.join(sorted(allowed_attributes))}",
            )

        iid = uuid.uuid4().hex[:12]
        now = utc_now()
        attributes_json = json.dumps(body.attributes, ensure_ascii=False, sort_keys=True)
        db.execute(
            """INSERT INTO items(id,project_id,name,category_id,attributes_json,color_material,selling_points,is_sellable,created_at,updated_at)
               VALUES(?,?,?,?,?,?,?,?,?,?)""",
            (iid, project_id, body.name, body.category_id, attributes_json,
             body.color_material, body.selling_points, int(body.is_sellable), now, now),
        )
        db.execute("INSERT INTO events(time,project_id,type,message) VALUES(?,?,?,?)",
                   (now, project_id, "item.create", f"新增单品：{body.name}"))
        db.commit()
        return {"id": iid, **body.model_dump(by_alias=True)}
    finally:
        db.close()
