"""任务接口：规则规划、幂等提交、审核、重生成与版本恢复。"""
import base64
import binascii
import hashlib
import json
import re
import uuid
from pathlib import Path
from typing import Literal
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field
from ..config import settings
from ..database import get_db, utc_now
from ..providers import list_providers, resolve_provider
from ..queue.worker import AUTO_PAUSE_ERROR_CODES, worker
from ..services.library_loader import load_shot_templates
from ..services.provider_config import provider_setting
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


def _validate_model_ids(db, project_id: str, model_ids: list[str] | None) -> None:
    if not model_ids:
        return
    requested = set(model_ids)
    allowed = {
        row["id"] for row in db.execute(
            """SELECT id FROM models
               WHERE enabled=1 AND (project_id IS NULL OR project_id=?)""",
            (project_id,),
        ).fetchall()
    }
    invalid = requested - allowed
    if invalid:
        raise HTTPException(400, f"模特不存在或不属于当前项目：{', '.join(sorted(invalid))}")


@router.post("/plan/preview")
def plan_preview(project_id: str, body: PlanIn) -> dict:
    db = get_db()
    try:
        if not db.execute("SELECT 1 FROM projects WHERE id=?", (project_id,)).fetchone():
            raise HTTPException(404, "项目不存在")
        _validate_model_ids(db, project_id, body.model_ids)
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
        _validate_model_ids(db, project_id, body.model_ids)
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
    prompt_mode: Literal["default", "custom"] = Field(default="default", alias="promptMode")
    custom_prompt: str = Field(default="", max_length=6000, alias="customPrompt")


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
                           status,source,asset_id,reason,prompt_hints,prompt_mode,custom_prompt,
                           created_at,updated_at
                       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                       ON CONFLICT(project_id,item_id,shot_id) DO UPDATE SET
                           shot_name=excluded.shot_name,type=excluded.type,
                           priority=excluded.priority,required=excluded.required,
                           is_custom=excluded.is_custom,status=excluded.status,
                           source=excluded.source,asset_id=excluded.asset_id,
                           reason=excluded.reason,prompt_hints=excluded.prompt_hints,
                           prompt_mode=excluded.prompt_mode,custom_prompt=excluded.custom_prompt,
                           updated_at=excluded.updated_at""",
                    (
                        project_id, selection.item_id, selection.shot_id,
                        template_shot["name"] if template_shot else selection.shot_name,
                        selection.type, selection.priority,
                        int(template_shot["required"] if template_shot else selection.required),
                        int(not template_shot and selection.is_custom),
                        selection.status, source, asset_id, selection.reason,
                        template_shot["promptHints"] if template_shot else selection.prompt_hints,
                        selection.prompt_mode,
                        selection.custom_prompt.strip(),
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
        candidates = []
        for tid in body.task_ids:
            row = db.execute(
                "SELECT id,status,provider,tier,estimated_cost FROM tasks WHERE id=? AND project_id=?",
                (tid, project_id),
            ).fetchone()
            if not row:
                raise HTTPException(404, f"任务不存在：{tid}")
            if row["status"] in ("planned", "cached", "failed"):
                candidates.append(row)
        by_provider: dict[str, list] = {}
        for row in candidates:
            by_provider.setdefault(row["provider"], []).append(row)
        for provider_id, provider_rows in by_provider.items():
            if provider_id == "mock":
                continue
            max_images = int(float(provider_setting(provider_id, "maxBatchImages", "4") or 4))
            if len(provider_rows) > max_images:
                raise HTTPException(
                    409,
                    f"{provider_id} 本批 {len(provider_rows)} 张超过安全上限 {max_images} 张；请拆批或在 Provider 设置中调整",
                )
            max_cost = float(provider_setting(provider_id, "maxEstimatedCostPerBatch", "0") or 0)
            estimate = sum(float(row["estimated_cost"] or 0) for row in provider_rows)
            if max_cost > 0 and estimate > max_cost:
                raise HTTPException(409, f"{provider_id} 本批预估 {estimate:.2f} 超过费用上限 {max_cost:.2f}")
        project = db.execute("SELECT budget FROM projects WHERE id=?", (project_id,)).fetchone()
        if not project:
            raise HTTPException(404, "项目不存在")
        spent = float(db.execute(
            "SELECT COALESCE(SUM(amount),0) amount FROM cost_events WHERE project_id=? AND provider<>'mock'",
            (project_id,),
        ).fetchone()["amount"])
        batch_estimate = sum(
            float(row["estimated_cost"] or 0) for row in candidates if row["provider"] != "mock"
        )
        if project["budget"] > 0 and spent + batch_estimate > project["budget"]:
            remaining = max(0.0, float(project["budget"]) - spent)
            raise HTTPException(409, f"本批预估 {batch_estimate:.2f} 超过项目剩余预算 {remaining:.2f}")
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


class QueueCancelIn(BaseModel):
    task_ids: list[str] = Field(alias="taskIds")


class QueueProviderRecoveryIn(BaseModel):
    provider: str = Field(min_length=1)


def _recover_provider_tasks(db, project_id: str, provider_id: str) -> dict:
    """Move only queued and systemic-provider failures to an explicitly chosen provider."""
    provider = resolve_provider(provider_id)
    rows = db.execute(
        """SELECT t.*,v.status current_version_status,v.error_code current_error_code,
                  v.mask_path current_mask_path
           FROM tasks t
           LEFT JOIN task_versions v ON v.id=t.current_version_id
           WHERE t.project_id=? AND t.status IN ('queued','failed')
           ORDER BY t.queue_index,t.code""",
        (project_id,),
    ).fetchall()
    task_ids: list[str] = []
    skipped: list[dict[str, str]] = []
    retried = 0
    migrated_queued = 0
    now = utc_now()
    max_images = 100 if provider.id == "mock" else int(float(provider_setting(provider.id, "maxBatchImages", "4") or 4))
    max_cost = 0 if provider.id == "mock" else float(provider_setting(provider.id, "maxEstimatedCostPerBatch", "0") or 0)
    accumulated_estimate = 0.0
    for row in rows:
        is_systemic_failure = (
            row["status"] == "failed"
            and row["current_error_code"] in AUTO_PAUSE_ERROR_CODES
        )
        if row["status"] == "failed" and not is_systemic_failure:
            continue
        if row["current_mask_path"] and provider.capabilities.get("maskEdit") is False:
            skipped.append({"taskId": row["id"], "reason": "目标 Provider 不支持蒙版重绘"})
            continue
        if len(task_ids) >= max_images:
            skipped.append({"taskId": row["id"], "reason": f"目标 Provider 单批上限为 {max_images} 张"})
            continue
        next_estimate = provider.estimate(row["tier"], 1)
        if max_cost > 0 and accumulated_estimate + next_estimate > max_cost:
            skipped.append({"taskId": row["id"], "reason": f"迁移后将超过单批费用上限 {max_cost:.2f}"})
            continue

        current_version_id = row["current_version_id"]
        if is_systemic_failure:
            next_version = db.execute(
                "SELECT COALESCE(MAX(version),0)+1 v FROM task_versions WHERE task_id=?",
                (row["id"],),
            ).fetchone()["v"]
            current_version_id = uuid.uuid4().hex[:12]
            db.execute(
                """INSERT INTO task_versions(
                       id,task_id,version,tier,status,provider,prompt,negative_prompt,
                       reference_mode,created_at)
                   VALUES(?,?,?,?,?,?,?,?,?,?)""",
                (
                    current_version_id, row["id"], next_version, row["tier"],
                    "generating", provider.id, row["prompt"], row["negative_prompt"],
                    "original", now,
                ),
            )
            retried += 1
        else:
            migrated_queued += 1
            if current_version_id and row["current_version_status"] == "generating":
                db.execute(
                    "UPDATE task_versions SET provider=? WHERE id=?",
                    (provider.id, current_version_id),
                )

        cache_seed = row["cache_key"] or row["id"]
        cache_key = hashlib.sha256(
            f"{cache_seed}\nprovider-recovery:{provider.id}".encode("utf-8")
        ).hexdigest()
        db.execute(
            """UPDATE tasks
               SET status='queued',provider=?,estimated_cost=?,cache_hit=0,cache_key=?,
                   current_version_id=?,idempotency_key=?,updated_at=?
               WHERE id=?""",
            (
                provider.id, provider.estimate(row["tier"], 1), cache_key,
                current_version_id, uuid.uuid4().hex, now, row["id"],
            ),
        )
        task_ids.append(row["id"])
        accumulated_estimate += next_estimate

    if task_ids:
        db.execute(
            """INSERT INTO events(time,project_id,type,message,payload)
               VALUES(?,?,?,?,?)""",
            (
                now, project_id, "queue.provider_recover",
                f"已切换到 {provider.name}：重试 {retried} 个系统性失败任务，迁移 {migrated_queued} 个排队任务",
                json.dumps({"provider": provider.id, "taskIds": task_ids, "skipped": skipped}, ensure_ascii=False),
            ),
        )
    return {
        "provider": provider.id,
        "retried": retried,
        "migratedQueued": migrated_queued,
        "taskIds": task_ids,
        "skipped": skipped,
    }


@router.post("/queue/pause")
def pause_queue(project_id: str) -> dict:
    worker.pause()
    db = get_db()
    try:
        db.execute(
            "INSERT INTO events(time,project_id,type,message) VALUES(?,?,?,?)",
            (utc_now(), project_id, "queue.pause", "队列已暂停：不再领取新的待生成任务"),
        )
        db.commit()
    finally:
        db.close()
    return {"paused": True}


@router.post("/queue/resume")
def resume_queue(project_id: str) -> dict:
    worker.resume()
    db = get_db()
    try:
        db.execute(
            "INSERT INTO events(time,project_id,type,message) VALUES(?,?,?,?)",
            (utc_now(), project_id, "queue.resume", "队列已恢复：继续处理待生成任务"),
        )
        db.commit()
    finally:
        db.close()
    return {"paused": False}


@router.post("/queue/recover-provider")
def recover_provider_queue(project_id: str, body: QueueProviderRecoveryIn) -> dict:
    provider_ids = {item["id"] for item in list_providers()}
    if body.provider not in provider_ids:
        raise HTTPException(400, f"未知 Provider：{body.provider}")
    db = get_db()
    try:
        if not db.execute("SELECT 1 FROM projects WHERE id=?", (project_id,)).fetchone():
            raise HTTPException(404, "项目不存在")
        with db:
            result = _recover_provider_tasks(db, project_id, body.provider)
    finally:
        db.close()
    if result["taskIds"]:
        worker.resume()
    return {**result, "paused": worker.paused}


@router.post("/queue/cancel")
def cancel_tasks(project_id: str, body: QueueCancelIn) -> dict:
    cancelled = 0
    running = 0
    db = get_db()
    try:
        for task_id in body.task_ids:
            row = db.execute(
                "SELECT status,current_version_id FROM tasks WHERE id=? AND project_id=?",
                (task_id, project_id),
            ).fetchone()
            if not row:
                continue
            if row["status"] == "generating":
                if worker.cancel(task_id):
                    running += 1
                continue
            if row["status"] != "queued":
                continue
            if row["current_version_id"]:
                db.execute(
                    "UPDATE task_versions SET status='failed',error_code=?,error_message=? WHERE id=?",
                    ("USER_CANCELLED", "用户取消生成", row["current_version_id"]),
                )
            db.execute(
                "UPDATE tasks SET status='failed',updated_at=? WHERE id=?",
                (utc_now(), task_id),
            )
            db.execute(
                "INSERT INTO events(time,project_id,task_id,type,message) VALUES(?,?,?,?,?)",
                (utc_now(), project_id, task_id, "task.cancel", "任务在排队阶段被用户取消"),
            )
            cancelled += 1
        db.commit()
    finally:
        db.close()
    return {"cancelled": cancelled, "cancelling": running}


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
        row = db.execute(
            """SELECT t.current_version_id,t.status,v.qc_passed,i.structure_json
               FROM tasks t
               LEFT JOIN task_versions v ON v.id=t.current_version_id
               LEFT JOIN items i ON i.id=t.item_id
               WHERE t.id=? AND t.project_id=?""",
            (task_id, project_id),
        ).fetchone()
        if not row:
            raise HTTPException(404, "任务不存在")
        if body.action == "lock" and row["qc_passed"] != 1:
            raise HTTPException(409, "一致性 QC 未通过或尚未完成，请先修正并重新生成后再锁定")
        if body.action == "lock" and row["status"] not in ("accepted", "locked"):
            raise HTTPException(409, "请先点击满意，人工确认商品结构事实后再锁定")
        db.execute("UPDATE tasks SET status=?,updated_at=? WHERE id=?", (status_map[body.action], utc_now(), task_id))
        if row["current_version_id"]:
            db.execute("UPDATE task_versions SET status=?,reason=?,note=? WHERE id=?",
                       (version_status[body.action], body.reason, body.note, row["current_version_id"]))
        structure_suffix = "；已人工确认商品结构事实" if (
            body.action == "accept" and row["structure_json"] not in (None, "", "{}")
        ) else ""
        db.execute("INSERT INTO events(time,project_id,task_id,type,message) VALUES(?,?,?,?,?)",
                   (utc_now(), project_id, task_id, f"review.{body.action}", f"任务审核：{body.action}（{body.reason or '无原因'}）{structure_suffix}"))
        db.commit()
        return {"ok": True}
    finally:
        db.close()


class RegenerateIn(BaseModel):
    prompt: str | None = None
    negative_prompt: str | None = Field(default=None, alias="negativePrompt")
    reason: str | None = None
    note: str | None = None
    reference_mode: str = Field(default="original", pattern="^(original|generated)$", alias="referenceMode")
    base_version_id: str | None = Field(default=None, alias="baseVersionId")
    mask_data_url: str | None = Field(default=None, alias="maskDataUrl")
    model_config = ConfigDict(populate_by_name=True)


@router.post("/{task_id}/regenerate")
def regenerate(project_id: str, task_id: str, body: RegenerateIn | None = None) -> dict:
    revision = body or RegenerateIn()
    prompt = revision.prompt.strip() if revision.prompt else None
    negative_prompt = revision.negative_prompt.strip() if revision.negative_prompt else None
    reason = revision.reason.strip() if revision.reason else None
    note = revision.note.strip() if revision.note else None
    db = get_db()
    try:
        row = db.execute(
            "SELECT tier,provider,prompt,negative_prompt,current_version_id FROM tasks WHERE id=? AND project_id=?",
            (task_id, project_id),
        ).fetchone()
        if not row:
            raise HTTPException(404, "任务不存在")

        base_version_id = revision.base_version_id or row["current_version_id"]
        if revision.reference_mode == "generated":
            base = db.execute(
                "SELECT id,version,file_path FROM task_versions WHERE id=? AND task_id=?",
                (base_version_id, task_id),
            ).fetchone() if base_version_id else None
            if not base:
                raise HTTPException(409, "缺少可用的基础生成版本，无法按当前图微调")
            if not base["file_path"]:
                raise HTTPException(409, f"基础版本 v{base['version']}还没有生成结果，无法按当前图微调")

        has_revision = any((prompt, negative_prompt, reason, note))
        if has_revision:
            if row["current_version_id"]:
                db.execute(
                    """UPDATE task_versions
                       SET status='rejected',reason=?,note=?,prompt=?,negative_prompt=?
                       WHERE id=?""",
                    (reason or "user-revision", note or "", prompt or row["prompt"],
                     negative_prompt or row["negative_prompt"], row["current_version_id"]),
                )
            db.execute(
                """UPDATE tasks
                   SET prompt=COALESCE(?, prompt),
                       negative_prompt=COALESCE(?, negative_prompt),
                       updated_at=?
                   WHERE id=?""",
                (prompt, negative_prompt, utc_now(), task_id),
            )

        next_v = db.execute("SELECT COALESCE(MAX(version),0)+1 v FROM task_versions WHERE task_id=?", (task_id,)).fetchone()["v"]
        vid = uuid.uuid4().hex[:12]
        mask_path: Path | None = None
        if revision.mask_data_url:
            if revision.reference_mode != "generated":
                raise HTTPException(409, "局部蒙版只能在“按当前图微调”模式下使用")
            match = re.fullmatch(r"data:image/png;base64,([A-Za-z0-9+/=]+)", revision.mask_data_url)
            if not match:
                raise HTTPException(422, "蒙版必须是 PNG data URL")
            try:
                mask_bytes = base64.b64decode(match.group(1), validate=True)
            except (ValueError, binascii.Error) as exc:
                raise HTTPException(422, "蒙版 Base64 无效") from exc
            if len(mask_bytes) > 8 * 1024 * 1024:
                raise HTTPException(413, "蒙版文件过大")
            if mask_bytes[:8] != b"\x89PNG\r\n\x1a\n":
                raise HTTPException(422, "蒙版不是有效的 PNG 文件")
            mask_path = settings.data_dir / "projects" / task_id / "masks" / f"{vid}.png"
            mask_path.parent.mkdir(parents=True, exist_ok=True)
            mask_path.write_bytes(mask_bytes)

        db.execute(
            """INSERT INTO task_versions(
                   id,task_id,version,tier,status,provider,prompt,negative_prompt,
                   reason,note,reference_mode,base_version_id,mask_path,created_at)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (vid, task_id, next_v, row["tier"], "generating", row["provider"],
             prompt or row["prompt"], negative_prompt or row["negative_prompt"],
             reason, note or "", revision.reference_mode,
             base_version_id if revision.reference_mode == "generated" else None,
             str(mask_path) if mask_path else None, utc_now()),
        )
        db.execute("UPDATE tasks SET status='queued',current_version_id=?,idempotency_key=?,updated_at=? WHERE id=?", (vid, uuid.uuid4().hex, utc_now(), task_id))
        message = f"任务创建 v{next_v}"
        if has_revision:
            message += "，使用用户修正提示词"
            message += "；按原图重画" if revision.reference_mode == "original" else "；按当前生成图微调"
            if mask_path:
                message += "；使用局部蒙版"
            if reason:
                message += f"（{reason}）"
        else:
            message += "，历史版本保留"
        db.execute("INSERT INTO events(time,project_id,task_id,type,message) VALUES(?,?,?,?,?)",
                   (utc_now(), project_id, task_id, "task.regenerate", message))
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
        spent = float(db.execute(
            "SELECT COALESCE(SUM(amount),0) amount FROM cost_events WHERE project_id=? AND provider<>'mock'",
            (project_id,),
        ).fetchone()["amount"])
        remaining = max(0.0, float(row["budget"]) - spent) if row["budget"] > 0 else 0.0
        if row["budget"] > 0 and estimate > remaining:
            raise HTTPException(409, f"高清修复预估 {estimate:.2f} 超过项目剩余预算 {remaining:.2f}")

        next_v = db.execute(
            "SELECT COALESCE(MAX(version),0)+1 v FROM task_versions WHERE task_id=?", (task_id,)
        ).fetchone()["v"]
        version_id = uuid.uuid4().hex[:12]
        idempotency = uuid.uuid4().hex
        queue_index = db.execute(
            "SELECT COALESCE(MAX(queue_index),0)+1 n FROM tasks WHERE project_id=?", (project_id,)
        ).fetchone()["n"]
        db.execute(
            """INSERT INTO task_versions(
                   id,task_id,version,tier,status,provider,prompt,negative_prompt,created_at)
               VALUES(?,?,?,?,?,?,?,?,?)""",
            (version_id, task_id, next_v, "hd", "generating", row["provider"],
             row["prompt"], row["negative_prompt"], utc_now()),
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
