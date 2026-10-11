"""单品接口：素材确认后形成可规划的商品单品。"""
import uuid
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from ..database import get_db, utc_now
from ..utils.case import camelize

router = APIRouter()


class ItemIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str = Field(min_length=1)
    category_id: str = Field(alias="categoryId")
    color_material: str = Field(default="", alias="colorMaterial")
    selling_points: str = Field(default="", alias="sellingPoints")
    is_sellable: bool = Field(default=True, alias="isSellable")


@router.get("")
def list_items(project_id: str) -> dict:
    db = get_db()
    try:
        rows = db.execute("SELECT * FROM items WHERE project_id=? ORDER BY created_at,id", (project_id,)).fetchall()
        return {"items": camelize([dict(r) for r in rows])}
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
        iid = uuid.uuid4().hex[:12]
        now = utc_now()
        db.execute(
            """INSERT INTO items(id,project_id,name,category_id,color_material,selling_points,is_sellable,created_at,updated_at)
               VALUES(?,?,?,?,?,?,?,?,?)""",
            (iid, project_id, body.name, body.category_id, body.color_material, body.selling_points, int(body.is_sellable), now, now),
        )
        db.execute("INSERT INTO events(time,project_id,type,message) VALUES(?,?,?,?)",
                   (now, project_id, "item.create", f"新增单品：{body.name}"))
        db.commit()
        return {"id": iid, **body.model_dump(by_alias=True)}
    finally:
        db.close()



