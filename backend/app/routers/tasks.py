"""任务接口：规则规划、幂等提交、审核、重生成与版本恢复。"""
import uuid
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field
from ..config import settings
from ..database import get_db, utc_now
from ..providers import resolve_provider
from ..queue.worker import worker
from ..services.task_planner import plan_tasks
from ..utils.case import camelize

router = APIRouter()


@router.get("")
def list_tasks(project_id: str, status: str | None = None) -> dict:
    db = get_db()
    try:
        sql = "SELECT * FROM tasks WHERE project_id=?"
        args = [project_id]
        if status:
            sql += " AND status=?"
            args.append(status)
        sql += " ORDER BY code"
        rows = db.execute(sql, args).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            versions = db.execute("SELECT * FROM task_versions WHERE task_id=? ORDER BY version", (r["id"],)).fetchall()
            d["versions"] = camelize([dict(v) for v in versions])
            out.append(d)
        return {"tasks": camelize(out)}
    finally:
        db.close()


class PlanIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    preset_id: str = Field(default="draft-first", alias="presetId")
    provider: str = "mock"
    replace_existing: bool = Field(default=False, alias="replaceExisting")
    model_ids: list[str] | None = Field(default=None, alias="modelIds")


@router.post("/plan")
def plan(project_id: str, body: PlanIn) -> dict:
    db = get_db()
    try:
        if not db.execute("SELECT 1 FROM projects WHERE id=?", (project_id,)).fetchone():
            raise HTTPException(404, "项目不存在")
    finally:
        db.close()
    return plan_tasks(project_id, body.preset_id, body.provider, body.replace_existing, body.model_ids)


class SubmitIn(BaseModel):
    task_ids: list[str] = Field(alias="taskIds")
    idempotency_key: str = Field(default_factory=lambda: uuid.uuid4().hex, alias="idempotencyKey")


@router.post("/submit")
def submit(project_id: str, body: SubmitIn) -> dict:
    db = get_db()
    queued = 0
    try:
        for tid in body.task_ids:
            row = db.execute("SELECT status FROM tasks WHERE id=? AND project_id=?", (tid, project_id)).fetchone()
            if not row:
                raise HTTPException(404, f"任务不存在：{tid}")
            if row["status"] not in ("planned", "cached", "failed"):
                continue
            index = db.execute("SELECT COALESCE(MAX(queue_index),0)+1 n FROM tasks WHERE project_id=?", (project_id,)).fetchone()["n"]
            db.execute(
                "UPDATE tasks SET status='queued',idempotency_key=?,queue_index=?,updated_at=? WHERE id=?",
                (f"{body.idempotency_key}:{tid}", index, utc_now(), tid),
            )
            queued += 1
        db.execute("INSERT INTO events(time,project_id,type,message) VALUES(?,?,?,?)",
                   (utc_now(), project_id, "queue.submit", f"提交 {queued} 个任务，幂等键 {body.idempotency_key[:8]}"))
        db.commit()
    finally:
        db.close()
    if queued:
        worker.start()
    return {"queued": queued, "idempotencyKey": body.idempotency_key}


class ReviewIn(BaseModel):
    action: str = Field(pattern="^(accept|reject|lock|unlock)$")
    reason: str | None = None
    note: str = ""


@router.post("/{task_id}/review")
def review(project_id: str, task_id: str, body: ReviewIn) -> dict:
    status_map = {"accept": "accepted", "reject": "rejected", "lock": "locked", "unlock": "accepted"}
    version_status = {"accept": "accepted", "reject": "rejected", "lock": "locked", "unlock": "accepted"}
    db = get_db()
    try:
        row = db.execute("SELECT current_version_id FROM tasks WHERE id=? AND project_id=?", (task_id, project_id)).fetchone()
        if not row:
            raise HTTPException(404, "任务不存在")
        db.execute("UPDATE tasks SET status=?,updated_at=? WHERE id=?", (status_map[body.action], utc_now(), task_id))
        if row["current_version_id"]:
            db.execute("UPDATE task_versions SET status=?,reason=?,note=? WHERE id=?",
                       (version_status[body.action], body.reason, body.note, row["current_version_id"]))
        db.execute("INSERT INTO events(time,project_id,task_id,type,message) VALUES(?,?,?,?,?)",
                   (utc_now(), project_id, task_id, f"review.{body.action}", f"任务审核：{body.action}（{body.reason or '无原因'}）"))
        db.commit()
        return {"ok": True}
    finally:
        db.close()


@router.post("/{task_id}/regenerate")
def regenerate(project_id: str, task_id: str) -> dict:
    db = get_db()
    try:
        row = db.execute("SELECT tier,provider FROM tasks WHERE id=? AND project_id=?", (task_id, project_id)).fetchone()
        if not row:
            raise HTTPException(404, "任务不存在")
        next_v = db.execute("SELECT COALESCE(MAX(version),0)+1 v FROM task_versions WHERE task_id=?", (task_id,)).fetchone()["v"]
        vid = uuid.uuid4().hex[:12]
        db.execute("INSERT INTO task_versions(id,task_id,version,tier,status,provider,created_at) VALUES(?,?,?,?,?,?,?)",
                   (vid, task_id, next_v, row["tier"], "generating", row["provider"], utc_now()))
        db.execute("UPDATE tasks SET status='queued',current_version_id=?,idempotency_key=?,updated_at=? WHERE id=?", (vid, uuid.uuid4().hex, utc_now(), task_id))
        db.execute("INSERT INTO events(time,project_id,task_id,type,message) VALUES(?,?,?,?,?)",
                   (utc_now(), project_id, task_id, "task.regenerate", f"任务创建 v{next_v}，历史版本保留"))
        db.commit()
    finally:
        db.close()
    worker.start()
    return {"version": next_v}


@router.post("/{task_id}/versions/{version_id}/restore")
def restore(project_id: str, task_id: str, version_id: str) -> dict:
    db = get_db()
    try:
        row = db.execute("SELECT version FROM task_versions WHERE id=? AND task_id=?", (version_id, task_id)).fetchone()
        if not row:
            raise HTTPException(404, "版本不存在")
        db.execute("UPDATE tasks SET current_version_id=?,status='review',updated_at=? WHERE id=?", (version_id, utc_now(), task_id))
        db.execute("INSERT INTO events(time,project_id,task_id,type,message) VALUES(?,?,?,?,?)",
                   (utc_now(), project_id, task_id, "version.restore", f"恢复到 v{row['version']}（引用，不覆盖）"))
        db.commit()
        return {"ok": True}
    finally:
        db.close()






@router.get("/{task_id}/versions/{version_id}/file")
def version_file(project_id: str, task_id: str, version_id: str) -> FileResponse:
    db = get_db()
    try:
        row = db.execute(
            """SELECT v.file_path FROM task_versions v
               JOIN tasks t ON t.id=v.task_id
               WHERE v.id=? AND v.task_id=? AND t.project_id=?""",
            (version_id, task_id, project_id),
        ).fetchone()
        if not row or not row["file_path"]:
            raise HTTPException(404, "版本结果文件不存在")
        path = Path(row["file_path"])
        if not path.is_absolute():
            path = settings.data_dir / path
        path = path.resolve()
        if not str(path).startswith(str(settings.data_dir.resolve())) or not path.is_file():
            raise HTTPException(404, "版本结果文件不存在")
        return FileResponse(path)
    finally:
        db.close()




