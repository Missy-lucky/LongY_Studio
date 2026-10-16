"""本地任务队列：固定并发、事件留痕、幂等调用与可恢复失败。"""
import json
from pathlib import Path

import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor

from ..config import PROJECT_ROOT, settings
from ..database import get_db, utc_now
from ..providers import resolve_provider
from ..providers.base import Cancellable, GenerateRequest
from ..services.library_loader import load_shot_templates
from ..services.consistency_qc import run_consistency_qc, save_qc_report
from ..services.outfit_fallbacks import resolve_outfit_fallbacks

FLAT_REFERENCE = "asset-library/reference-templates/plan-view.png"
MODEL_STYLE_REFERENCE = "asset-library/reference-templates/model-display.jpg"
AUTO_PAUSE_ERROR_CODES = {"QUOTA_EXCEEDED", "AUTHENTICATION_FAILED", "API_KEY_MISSING"}


def _provider_failure_detail(error) -> tuple[str, str]:
    code = getattr(error, "code", "TIMEOUT")
    message = getattr(error, "message", "生成超时")
    suggestion = getattr(error, "suggestion", "").strip()
    if suggestion:
        message = f"{message}；建议：{suggestion}"
    return code, message


def _garment_reference_paths(db, task, reserved_reference_slots: int = 2) -> tuple[list[str], list[str]]:
    """Return target refs and bounded generation refs, with real fallback layers."""
    target = [r["file_path"] for r in db.execute(
        "SELECT file_path FROM assets WHERE item_id=? ORDER BY created_at,id",
        (task["item_id"],),
    ).fetchall()][:12]
    if task["type"] not in {"partial", "model"}:
        return target, target
    category_ids = {
        row["category_id"]
        for row in db.execute(
            "SELECT category_id FROM items WHERE project_id=? ORDER BY created_at,id",
            (task["project_id"],),
        ).fetchall()
    }
    fallbacks = resolve_outfit_fallbacks(category_ids)
    fallback_paths = [fallback.path for fallback in fallbacks]
    provider_id = task["provider"] if "provider" in task.keys() else ""
    declared_limit = getattr(resolve_provider(provider_id), "capabilities", {}).get("maxReferenceImages", 16)
    provider_limit = declared_limit if isinstance(declared_limit, int) else 16
    garment_reference_limit = min(10, max(1, provider_limit - reserved_reference_slots))
    actual_reference_limit = garment_reference_limit - len(fallback_paths)
    if task["type"] == "partial":
        return target, [*target[:actual_reference_limit], *fallback_paths]
    rows = db.execute(
        """SELECT i.id item_id,a.file_path
           FROM assets a JOIN items i ON i.id=a.item_id
           WHERE i.project_id=?
           ORDER BY CASE WHEN i.id=? THEN 0 ELSE 1 END,
                    i.created_at,i.id,a.created_at,a.id""",
        (task["project_id"], task["item_id"]),
    ).fetchall()
    outfit: list[str] = []
    per_item: dict[str, int] = {}
    # Keep the garment budget at ten so identity/style/project references still fit.
    for row in rows:
        if len(outfit) >= actual_reference_limit:
            break
        count = per_item.get(row["item_id"], 0)
        if count >= 2:
            continue
        outfit.append(row["file_path"])
        per_item[row["item_id"]] = count + 1
    return target, [*outfit, *fallback_paths]


def _project_reference_paths(db, project_id: str, task_type: str) -> list[str]:
    applicable_roles = {
        "flat": {"style"},
        "detail": {"style", "detail"},
        "partial": {"pose", "style", "detail"},
        "model": {"pose", "style"},
    }[task_type]
    return [
        row["file_path"]
        for row in db.execute(
            """SELECT role,file_path FROM project_references
               WHERE project_id=? ORDER BY
                 CASE role WHEN 'pose' THEN 0 WHEN 'detail' THEN 1 ELSE 2 END,
                 created_at,id""",
            (project_id,),
        ).fetchall()
        if row["role"] in applicable_roles
    ]


def _model_reference_paths(db, model_id: str | None, fallback: str | None) -> list[str]:
    if not model_id:
        return [fallback] if fallback else []
    rows = db.execute(
        """SELECT file_path FROM model_references WHERE model_id=?
           ORDER BY is_primary DESC,
             CASE angle WHEN 'front' THEN 0 WHEN 'three-quarter-left' THEN 1
                        WHEN 'three-quarter-right' THEN 2 WHEN 'profile-left' THEN 3
                        WHEN 'profile-right' THEN 4 WHEN 'back' THEN 5 ELSE 6 END,
             created_at,id LIMIT 6""",
        (model_id,),
    ).fetchall()
    paths = [row["file_path"] for row in rows]
    if fallback and fallback not in paths:
        paths.insert(0, fallback)
    return paths


class QueueWorker:
    def __init__(self) -> None:
        self._executor = ThreadPoolExecutor(
            max_workers=max(1, settings.max_concurrency), thread_name_prefix="longy-queue"
        )
        self._thread: threading.Thread | None = None
        self._lock = threading.Lock()
        self._paused = False
        self._cancellations: dict[str, Cancellable] = {}
        self._cancelled_ids: set[str] = set()

    def start(self) -> None:
        with self._lock:
            if self._thread and self._thread.is_alive():
                return
            self._thread = threading.Thread(
                target=self._supervise, name="longy-queue-supervisor", daemon=True
            )
            self._thread.start()

    def pause(self) -> bool:
        with self._lock:
            changed = not self._paused
            self._paused = True
        return changed

    def resume(self) -> None:
        with self._lock:
            self._paused = False
        self.start()

    @property
    def paused(self) -> bool:
        with self._lock:
            return self._paused

    def cancel(self, task_id: str) -> bool:
        """Cancel a running provider call; queued tasks are cancelled by the router."""
        with self._lock:
            handle = self._cancellations.get(task_id)
            self._cancelled_ids.add(task_id)
        if handle:
            handle.cancel()
            return True
        return False

    def _supervise(self) -> None:
        idle_cycles = 0
        while True:
            if self.paused:
                idle_cycles = 0
                time.sleep(0.2)
                continue
            rows: list[str] = []
            db = get_db()
            try:
                rows = [r["id"] for r in db.execute(
                    "SELECT id FROM tasks WHERE status='queued' ORDER BY queue_index,code LIMIT ?",
                    (settings.max_concurrency,),
                ).fetchall()]
            finally:
                db.close()
            if not rows:
                idle_cycles += 1
                # 队列空闲后退出 supervisor，避免桌面端长时间运行时产生持续 CPU 唤醒。
                if idle_cycles >= 3:
                    with self._lock:
                        if self._thread is threading.current_thread():
                            self._thread = None
                    return
                time.sleep(0.25)
                continue
            idle_cycles = 0
            futures = [self._executor.submit(self._process_task, task_id) for task_id in rows]
            for future in futures:
                future.result()

    def _event(self, project_id: str, task_id: str | None, type_: str, message: str) -> None:
        db = get_db()
        try:
            db.execute(
                "INSERT INTO events(time,project_id,task_id,type,message) VALUES(?,?,?,?,?)",
                (utc_now(), project_id, task_id, type_, message),
            )
            db.commit()
        finally:
            db.close()

    def _process_task(self, task_id: str) -> None:
        db = get_db()
        version_id: str | None = None
        try:
            task = db.execute(
                """SELECT t.*,i.category_id,i.structure_json,m.reference_path model_reference_path
                   FROM tasks t
                   LEFT JOIN items i ON i.id=t.item_id
                   LEFT JOIN models m ON m.id=t.model_id
                   WHERE t.id=?""",
                (task_id,),
            ).fetchone()
            if not task or task["status"] not in ("queued", "generating"):
                return
            model_references = _model_reference_paths(db, task["model_id"], task["model_reference_path"])
            target_garment_references, garment_references = _garment_reference_paths(
                db, task, reserved_reference_slots=max(2, min(7, len(model_references) + 1)),
            )
            project_references = _project_reference_paths(db, task["project_id"], task["type"])
            template = load_shot_templates().get(task["category_id"]) if task["category_id"] else None
            shot = None
            if template and task["shot_id"]:
                candidates = [
                    *template["shots"].get(task["type"], []),
                    *[
                        item
                        for rule in template["conditionalShots"]
                        for item in rule["add"]
                        if item["type"] == task["type"]
                    ],
                ]
                shot = next((item for item in candidates if item["id"] == task["shot_id"]), None)
            roles = shot["references"] if shot else None
            if roles is None:
                roles = {
                    "flat": ["garment"],
                    "detail": ["garment"],
                    "partial": ["garment", "model-identity"],
                    "model": ["garment", "model-identity", "style"],
                }[task["type"]]
            references: list[str] = []
            for role in roles:
                if role == "garment":
                    references.extend(garment_references)
                elif role == "model-identity":
                    references.extend(path for path in model_references if path not in references)
                elif role == "style":
                    references.append(MODEL_STYLE_REFERENCE)
            if task["type"] in ("partial", "model"):
                references.extend(path for path in model_references if path not in references)
            for reference in project_references:
                if reference not in references:
                    references.append(reference)
            declared_limit = getattr(resolve_provider(task["provider"]), "capabilities", {}).get("maxReferenceImages", 16)
            provider_limit = declared_limit if isinstance(declared_limit, int) else 16
            references = references[:provider_limit]

            model_reference_path = model_references[0] if model_references else None
            mask_path: str | None = None
            version_id = task["current_version_id"]
            current_version = None
            if version_id:
                current_version = db.execute(
                    "SELECT status,reference_mode,base_version_id,mask_path FROM task_versions WHERE id=?",
                    (version_id,),
                ).fetchone()
                if not current_version or current_version["status"] != "generating":
                    version_id = None
                    current_version = None
            if current_version:
                mask_path = current_version["mask_path"]
            if current_version and current_version["reference_mode"] == "generated":
                base_version_id = current_version["base_version_id"]
                base_version = db.execute(
                    "SELECT file_path FROM task_versions WHERE id=? AND task_id=?",
                    (base_version_id, task_id),
                ).fetchone() if base_version_id else None
                if base_version and base_version["file_path"]:
                    # The generated image is the edit base; original references remain after it
                    # as commodity/authenticity constraints.
                    references.insert(0, base_version["file_path"])
            if not version_id:
                next_v = db.execute(
                    "SELECT COALESCE(MAX(version),0)+1 v FROM task_versions WHERE task_id=?", (task_id,)
                ).fetchone()["v"]
                version_id = uuid.uuid4().hex[:12]
                db.execute(
                    """INSERT INTO task_versions(
                           id,task_id,version,tier,status,provider,prompt,negative_prompt,
                           reference_mode,created_at)
                       VALUES(?,?,?,?,?,?,?,?,?,?)""",
                    (version_id, task_id, next_v, task["tier"], "generating", task["provider"],
                     task["prompt"], task["negative_prompt"], "original", utc_now()),
                )
            idem = task["idempotency_key"] or uuid.uuid4().hex
            db.execute(
                """UPDATE tasks SET status='generating',current_version_id=?,idempotency_key=?,
                   updated_at=? WHERE id=?""",
                (version_id, idem, utc_now(), task_id),
            )
            db.execute(
                """INSERT OR IGNORE INTO provider_calls(
                       id,task_id,version_id,provider,idempotency_key,request_digest,status,created_at)
                   VALUES(?,?,?,?,?,?,?,?)""",
                (uuid.uuid4().hex[:16], task_id, version_id, task["provider"], idem,
                 f"{task['cache_key']}:{task['tier']}", "running", utc_now()),
            )
            db.commit()
        finally:
            db.close()
        if not version_id:
            return

        task_db = get_db()
        try:
            # Refresh mutable task state after creating the version, while retaining
            # item-owned structure facts required by post-generation QC.
            task = task_db.execute(
                """SELECT t.*,i.structure_json
                   FROM tasks t
                   LEFT JOIN items i ON i.id=t.item_id
                   WHERE t.id=?""",
                (task_id,),
            ).fetchone()
        finally:
            task_db.close()
        if not task:
            return
        provider = resolve_provider(task["provider"])

        def resolve_runtime_path(value: str | None) -> Path | None:
            if not value:
                return None
            candidate = Path(value)
            if candidate.is_absolute():
                return candidate if candidate.is_file() else None
            if candidate.parts and candidate.parts[0] == "asset-library":
                candidate = PROJECT_ROOT / candidate
            else:
                candidate = settings.data_dir / candidate
            return candidate if candidate.is_file() else None

        garment_reference = resolve_runtime_path(
            target_garment_references[0] if target_garment_references else None
        )
        model_reference = resolve_runtime_path(model_reference_path)
        output = template["defaults"]["outputByType"][task["type"]] if template else None
        request = GenerateRequest(
            task_id=task_id,
            tier=task["tier"],
            task_type=task["type"],
            prompt=task["prompt"],
            negative_prompt=task["negative_prompt"],
            output_width=output["width"] if output else None,
            output_height=output["height"] if output else None,
            reference_paths=references,
            mask_path=mask_path,
        )
        done = threading.Event()
        result_box: dict = {}

        def stage(stage: str, message: str) -> None:
            self._event(task["project_id"], task_id, f"task.stage.{stage}", message)

        def complete(result) -> None:
            result_box["result"] = result
            done.set()

        def error(err) -> None:
            result_box["error"] = err
            done.set()

        cancellable = provider.generate(request, stage, complete, error, task["idempotency_key"] or uuid.uuid4().hex)
        with self._lock:
            if task_id in self._cancelled_ids:
                cancellable.cancel()
            else:
                self._cancellations[task_id] = cancellable
        deadline = time.monotonic() + 300
        timed_out = False
        while not done.wait(0.2):
            with self._lock:
                cancelled_now = task_id in self._cancelled_ids
            if cancelled_now:
                break
            if time.monotonic() >= deadline:
                timed_out = True
                cancellable.cancel()
                break
        with self._lock:
            self._cancellations.pop(task_id, None)
            cancelled = task_id in self._cancelled_ids
        db = get_db()
        try:
            call = db.execute(
                "SELECT id FROM provider_calls WHERE provider=? AND idempotency_key=?",
                (task["provider"], task["idempotency_key"]),
            ).fetchone()
            if "result" in result_box:
                result = result_box["result"]
                output_path = Path(result.file_path)
                try:
                    qc_report = run_consistency_qc(
                        output_path,
                        task["type"],
                        garment_reference=garment_reference,
                        model_reference=model_reference,
                        enforce=task["provider"] != "mock",
                        deep_model_qc=task["provider"] != "mock",
                        structure_facts=json.loads(task["structure_json"] or "{}"),
                    )
                    qc_report["tier"] = task["tier"]
                    qc_report["pipeline"] = ["base-generation", "hd-detail-repair"] if task["tier"] == "hd" else ["base-generation"]
                    qc_path = save_qc_report(qc_report, output_path)
                    qc_score = qc_report.get("score")
                    qc_passed = int(bool(qc_report.get("passed")))
                except Exception as exc:
                    qc_path = None
                    qc_score = None
                    qc_passed = 0
                    self._event(task["project_id"], task_id, "task.qc.error", f"一致性 QC 执行失败：{exc}")

                db.execute(
                    """UPDATE task_versions
                       SET status='review',cost=?,duration_ms=?,file_path=?,qc_score=?,qc_passed=?,qc_report_path=?
                       WHERE id=?""",
                    (result.cost, result.duration_ms, result.file_path, qc_score, qc_passed,
                     str(qc_path) if qc_path else None, version_id),
                )
                db.execute(
                    "UPDATE tasks SET status='review',estimated_cost=?,updated_at=? WHERE id=?",
                    (result.cost, utc_now(), task_id),
                )
                db.execute(
                    "INSERT OR REPLACE INTO cache_entries(cache_key,provider,file_path,cost,created_at,last_used_at) VALUES(?,?,?,?,?,?)",
                    (task["cache_key"], task["provider"], result.file_path, result.cost, utc_now(), utc_now()),
                )
                db.execute(
                    "INSERT INTO cost_events(id,project_id,task_id,kind,provider,amount,created_at) VALUES(?,?,?,?,?,?,?)",
                    (uuid.uuid4().hex[:12], task["project_id"], task_id, "generation",
                     task["provider"], result.cost, utc_now()),
                )
                if call:
                    db.execute(
                        "UPDATE provider_calls SET status='success',cost=?,duration_ms=? WHERE id=?",
                        (result.cost, result.duration_ms, call["id"]),
                    )
                db.commit()
                qc_message = "" if qc_passed else "；一致性 QC 未通过，请检查 QC 报告"
                self._event(
                    task["project_id"], task_id, "task.review",
                    f"任务 {task['code']} 已生成，等待审核{qc_message}",
                )
            else:
                err = result_box.get("error")
                if cancelled:
                    message = "用户取消生成"
                    code = "USER_CANCELLED"
                elif timed_out:
                    message = "生成请求超过 300 秒，已终止 Provider 调用"
                    code = "PROVIDER_TIMEOUT"
                else:
                    code, message = _provider_failure_detail(err)
                auto_paused = code in AUTO_PAUSE_ERROR_CODES and self.pause()
                db.execute(
                    "UPDATE task_versions SET status='failed',error_code=?,error_message=? WHERE id=?",
                    (code, message, version_id),
                )
                db.execute(
                    "UPDATE tasks SET status='failed',updated_at=? WHERE id=?", (utc_now(), task_id)
                )
                if call:
                    db.execute(
                        "UPDATE provider_calls SET status='failed',error_code=? WHERE id=?",
                        (code, call["id"]),
                    )
                if auto_paused:
                    db.execute(
                        """INSERT INTO events(time,project_id,type,message)
                           VALUES(?,?,?,?)""",
                        (
                            utc_now(), task["project_id"], "queue.auto_pause",
                            f"检测到 {code}，队列已自动暂停；请切换或重新配置 Provider 后再恢复",
                        ),
                    )
                db.commit()
                self._event(task["project_id"], task_id, "task.fail", f"任务 {task['code']} 失败：{message}")
        finally:
            db.close()
            with self._lock:
                self._cancellations.pop(task_id, None)
                self._cancelled_ids.discard(task_id)


worker = QueueWorker()
