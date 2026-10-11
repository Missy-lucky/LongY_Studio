"""任务接口：规则规划、幂等提交、审核、重生成与版本恢复。"""
import json
import uuid
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field
from ..config import settings
from ..database import get_db, utc_now
from ..providers import resolve_provider
from ..queue.worker import worker
from ..services.library_loader import load_shot_templates
from ..services.shot_planning import build_shot_plan_preview
from ..services.task_planner import _expand_template_shots, plan_tasks
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
    shot_ids: list[str] | None = Field(default=None, alias="shotIds")


@router.post("/plan/preview")
def plan_preview(project_id: str, body: PlanIn) -> dict:
    db = get_db()
    try:
        if not db.execute("SELECT 1 FROM projects WHERE id=?", (project_id,)).fetchone():
            raise HTTPException(404, "项目不存在")
    finally:
        db.close()
    return build_shot_plan_preview(
        project_id, body.preset_id, body.provider, body.model_ids
    )


@router.post("/plan")
def plan(project_id: str, body: PlanIn) -> dict:
    db = get_db()
    try:
        if not db.execute("SELECT 1 FROM projects WHERE id=?", (project_id,)).fetchone():
            raise HTTPException(404, "项目不存在")
    finally:
        db.close()
    return plan_tasks(
        project_id, body.preset_id, body.provider,
        body.replace_existing, body.model_ids, body.shot_ids,
    )


class ShotSelectionIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    item_id: str = Field(alias="itemId")
    shot_id: str = Field(alias="shotId")
    shot_name: str = Field(min_length=1, alias="shotName")
    type: str
    priority: str
    required: bool = True
    is_custom: bool = Field(default=False, alias="isCustom")
    status: str = "selected"
    source: str = "ai"
    asset_id: str | None = Field(default=None, alias="assetId")
    reason: str = ""
    prompt_hints: str = Field(default="", alias="promptHints")


class ShotSelectionBatchIn(BaseModel):
    selections: list[ShotSelectionIn]


@router.put("/shot-selections")
def save_shot_selections(project_id: str, body: ShotSelectionBatchIn) -> dict:
    db = get_db()
    try:
        if not db.execute("SELECT 1 FROM projects WHERE id=?", (project_id,)).fetchone():
            raise HTTPException(404, "项目不存在")
        items = {
            row["id"]: dict(row)
            for row in db.execute(
                """SELECT i.*,c.name category_name FROM items i
                   JOIN categories c ON c.id=i.category_id WHERE i.project_id=?""",
                (project_id,),
            ).fetchall()
        }
        templates = load_shot_templates()
        now = utc_now()
        with db:
            db.execute("DELETE FROM project_shot_selections WHERE project_id=?", (project_id,))
            for selection in body.selections:
                item = items.get(selection.item_id)
                if not item:
                    raise HTTPException(400, f"镜头所属单品不存在：{selection.item_id}")
                if selection.type not in {"flat", "partial", "detail", "model"}:
                    raise HTTPException(400, f"非法镜头类型：{selection.type}")
                if selection.priority not in {"P0", "P1", "P2"}:
                    raise HTTPException(400, f"非法镜头优先级：{selection.priority}")
                if selection.status not in {"selected", "fulfilled", "waived"}:
                    raise HTTPException(400, f"非法镜头状态：{selection.status}")

                template = templates.get(item["category_id"])
                template_shot = None
                if template:
                    attributes = json.loads(item["attributes_json"] or "{}")
                    template_shot = next((
                        shot for shot in _expand_template_shots(template, attributes)
                        if shot["id"] == selection.shot_id
                    ), None)
                if template_shot:
                    if selection.type != template_shot["type"]:
                        raise HTTPException(400, f"模板镜头类型不匹配：{selection.shot_id}")
                    if selection.priority != template_shot["priority"]:
                        raise HTTPException(400, f"模板镜头优先级不匹配：{selection.shot_id}")
                elif not selection.is_custom:
                    raise HTTPException(400, f"未知模板镜头：{selection.shot_id}")

                source = selection.source
                asset_id = selection.asset_id
                if selection.status == "selected":
                    source, asset_id = "ai", None
                elif selection.status == "fulfilled":
                    if source not in {"asset", "manual"}:
                        raise HTTPException(400, "已满足镜头来源必须是 asset/manual")
                    if source == "asset":
                        asset_row = db.execute(
                            """SELECT 1 FROM assets WHERE id=? AND project_id=? AND item_id=?""",
                            (asset_id, project_id, selection.item_id),
                        ).fetchone() if asset_id else None
                        if not asset_row:
                            raise HTTPException(400, "参考资产不存在或不属于该单品")
                elif selection.status == "waived":
                    if not selection.reason.strip():
                        raise HTTPException(400, "豁免必拍镜头时必须填写原因")
                    source, asset_id = "manual", None

                db.execute(
                    """INSERT INTO project_shot_selections(
                           project_id,item_id,shot_id,shot_name,type,priority,required,is_custom,
                           status,source,asset_id,reason,prompt_hints,created_at,updated_at
                       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                       ON CONFLICT(project_id,item_id,shot_id) DO UPDATE SET
                           shot_name=excluded.shot_name,type=excluded.type,
                           priority=excluded.priority,required=excluded.required,
                           is_custom=excluded.is_custom,status=excluded.status,
                           source=excluded.source,asset_id=excluded.asset_id,
                           reason=excluded.reason,prompt_hints=excluded.prompt_hints,
                           updated_at=excluded.updated_at""",
                    (
                        project_id, selection.item_id, selection.shot_id,
                        template_shot["name"] if template_shot else selection.shot_name,
                        selection.type, selection.priority,
                        int(template_shot["required"] if template_shot else selection.required),
                        int(not template_shot and selection.is_custom),
                        selection.status, source, asset_id, selection.reason,
                        template_shot["promptHints"] if template_shot else selection.prompt_hints,
                        now, now,
                    ),
                )
        return {"saved": len(body.selections)}
    finally:
        db.close()


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


@router.post("/{task_id}/hd-repair")
def start_hd_repair(project_id: str, task_id: str) -> dict:
    """Create a dedicated HD repair version instead of only upsizing the draft."""
    from ..providers import resolve_provider as resolve_provider_for_estimate

    db = get_db()
    try:
        row = db.execute(
            """SELECT t.*,p.budget FROM tasks t JOIN projects p ON p.id=t.project_id
               WHERE t.id=? AND t.project_id=?""",
            (task_id, project_id),
        ).fetchone()
        if not row:
            raise HTTPException(404, "任务不存在")
        if row["status"] not in ("accepted", "locked", "rejected", "review"):
            raise HTTPException(409, "只有已生成并进入审核/锁定状态的任务才能执行高清修复")
        if row["tier"] == "hd" and row["status"] in ("review",):
            raise HTTPException(409, "该任务已在高清修复流程中")

        provider = resolve_provider_for_estimate(row["provider"])
        estimate = 0 if row["provider"] == "mock" else provider.estimate("hd", 1)
        if row["budget"] > 0 and estimate > row["budget"]:
            raise HTTPException(409, f"高清修复预估 {estimate:.2f} 超过项目剩余预算 {row['budget']:.2f}")

        next_v = db.execute(
            "SELECT COALESCE(MAX(version),0)+1 v FROM task_versions WHERE task_id=?", (task_id,)
        ).fetchone()["v"]
        version_id = uuid.uuid4().hex[:12]
        idempotency = uuid.uuid4().hex
        queue_index = db.execute(
            "SELECT COALESCE(MAX(queue_index),0)+1 n FROM tasks WHERE project_id=?", (project_id,)
        ).fetchone()["n"]
        db.execute(
            """INSERT INTO task_versions(id,task_id,version,tier,status,provider,created_at)
               VALUES(?,?,?,?,?,?,?)""",
            (version_id, task_id, next_v, "hd", "generating", row["provider"], utc_now()),
        )
        db.execute(
            """UPDATE tasks SET tier='hd',status='queued',current_version_id=?,idempotency_key=?,
               queue_index=?,updated_at=? WHERE id=?""",
            (version_id, idempotency, queue_index, utc_now(), task_id),
        )
        db.execute(
            "INSERT INTO events(time,project_id,task_id,type,message) VALUES(?,?,?,?,?)",
            (utc_now(), project_id, task_id, "task.hd_repair",
             f"任务创建高清细节修复 v{next_v}（两阶段：基础图 + 细节修复）"),
        )
        db.commit()
    finally:
        db.close()
    worker.start()
    return {"version": next_v, "versionId": version_id, "tier": "hd"}


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






@router.get("/{task_id}/versions/{version_id}/qc")
def version_qc(project_id: str, task_id: str, version_id: str) -> dict:
    db = get_db()
    try:
        row = db.execute(
            """SELECT v.qc_score,v.qc_passed,v.qc_report_path,t.project_id AS project_id
               FROM task_versions v JOIN tasks t ON t.id=v.task_id
               WHERE v.id=? AND v.task_id=? AND t.project_id=?""",
            (version_id, task_id, project_id),
        ).fetchone()
        if not row:
            raise HTTPException(404, "版本 QC 报告不存在")
        report_path = Path(row["qc_report_path"]) if row["qc_report_path"] else None
        if report_path and not report_path.is_absolute():
            report_path = settings.data_dir / report_path
        report = None
        if report_path:
            resolved = report_path.resolve()
            if not str(resolved).startswith(str(settings.data_dir.resolve())) or not resolved.is_file():
                raise HTTPException(404, "版本 QC 报告不存在")
            report = json.loads(resolved.read_text(encoding="utf-8"))
        return {
            "taskId": task_id,
            "versionId": version_id,
            "score": row["qc_score"],
            "passed": bool(row["qc_passed"]),
            "report": report,
        }
    except (OSError, json.JSONDecodeError):
        raise HTTPException(404, "版本 QC 报告不存在")
    finally:
        db.close()
