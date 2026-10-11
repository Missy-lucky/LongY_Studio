"""项目接口：创建 / 列表 / 详情 / 事件流恢复"""
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from ..database import get_db
from ..utils.case import camelize

router = APIRouter()


class ProjectIn(BaseModel):
    sku: str = Field(min_length=1)
    name: str = Field(min_length=1)
    platform: str = ""
    style: str = ""
    budget: float = 0


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.post("")
def create_project(p: ProjectIn) -> dict:
    import uuid
    pid = uuid.uuid4().hex[:12]
    db = get_db()
    try:
        db.execute(
            "INSERT INTO projects(id, sku, name, platform, style, budget, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?)",
            (pid, p.sku, p.name, p.platform, p.style, p.budget, now(), now()),
        )
        db.execute("INSERT INTO events(time, project_id, type, message) VALUES(?,?,?,?)",
                   (now(), pid, "project.create", f"项目创建：{p.sku} {p.name}"))
        db.commit()
    finally:
        db.close()
    return camelize({"id": pid, **p.model_dump()})


@router.get("")
def list_projects() -> dict:
    db = get_db()
    try:
        rows = db.execute("SELECT * FROM projects ORDER BY created_at DESC").fetchall()
        return {"projects": camelize([dict(r) for r in rows])}
    finally:
        db.close()


class ProjectUpdate(BaseModel):
    sku: str | None = Field(default=None, min_length=1)
    name: str | None = Field(default=None, min_length=1)
    platform: str | None = None
    style: str | None = None
    budget: float | None = Field(default=None, ge=0)


@router.patch("/{project_id}")
def update_project(project_id: str, body: ProjectUpdate) -> dict:
    db = get_db()
    try:
        row = db.execute("SELECT * FROM projects WHERE id=?", (project_id,)).fetchone()
        if not row:
            raise HTTPException(404, "项目不存在")
        values = body.model_dump(exclude_unset=True)
        if "sku" in values:
            duplicate = db.execute(
                "SELECT id FROM projects WHERE sku=? AND id<>?", (values["sku"], project_id)
            ).fetchone()
            if duplicate:
                raise HTTPException(409, "商品编号已存在")
        for key, value in values.items():
            db.execute(f"UPDATE projects SET {key}=? WHERE id=?", (value, project_id))
        db.execute("UPDATE projects SET updated_at=? WHERE id=?", (now(), project_id))
        db.execute(
            "INSERT INTO events(time,project_id,type,message) VALUES(?,?,?,?)",
            (now(), project_id, "project.update", f"项目资料更新：{', '.join(values) or '无字段'}"),
        )
        db.commit()
        updated = db.execute("SELECT * FROM projects WHERE id=?", (project_id,)).fetchone()
        return {"project": camelize(dict(updated))}
    finally:
        db.close()


@router.get("/{project_id}")
def get_project(project_id: str) -> dict:
    db = get_db()
    try:
        row = db.execute("SELECT * FROM projects WHERE id=?", (project_id,)).fetchone()
        if not row:
            raise HTTPException(404, "项目不存在")
        stats = db.execute(
            "SELECT status, COUNT(*) n FROM tasks WHERE project_id=? GROUP BY status", (project_id,)
        ).fetchall()
        return {"project": camelize(dict(row)), "taskStats": {r["status"]: r["n"] for r in stats}}
    finally:
        db.close()


@router.get("/{project_id}/events")
def project_events(project_id: str, after_id: int = 0, limit: int = 200) -> dict:
    """前端恢复界面：按事件 id 增量拉取（需求 18.2）"""
    db = get_db()
    try:
        rows = db.execute(
            "SELECT * FROM events WHERE project_id=? AND id>? ORDER BY id LIMIT ?",
            (project_id, after_id, limit),
        ).fetchall()
        return {"events": camelize([dict(r) for r in rows]), "lastId": rows[-1]["id"] if rows else after_id}
    finally:
        db.close()
