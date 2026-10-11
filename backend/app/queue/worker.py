"""本地任务队列：固定并发、事件留痕、幂等调用与可恢复失败。"""
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor

from ..config import PROJECT_ROOT, settings
from ..database import get_db, utc_now
from ..providers import resolve_provider
from ..providers.base import GenerateRequest

FLAT_REFERENCE = "asset-library/reference-templates/plan-view.png"
MODEL_STYLE_REFERENCE = "asset-library/reference-templates/model-display.jpg"


class QueueWorker:
    def __init__(self) -> None:
        self._executor = ThreadPoolExecutor(
            max_workers=max(1, settings.max_concurrency), thread_name_prefix="longy-queue"
        )
        self._thread: threading.Thread | None = None
        self._lock = threading.Lock()

    def start(self) -> None:
        with self._lock:
            if self._thread and self._thread.is_alive():
                return
            self._thread = threading.Thread(
                target=self._supervise, name="longy-queue-supervisor", daemon=True
            )
            self._thread.start()

    def _supervise(self) -> None:
        idle_cycles = 0
        while True:
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
                """SELECT t.*,m.reference_path model_reference_path
                   FROM tasks t
                   LEFT JOIN models m ON m.id=t.model_id
                   WHERE t.id=?""",
                (task_id,),
            ).fetchone()
            if not task or task["status"] not in ("queued", "generating"):
                return
            references = [r["file_path"] for r in db.execute(
                "SELECT file_path FROM assets WHERE item_id=? ORDER BY created_at",
                (task["item_id"],),
            ).fetchall()]
            if task["type"] == "flat":
                references.append(FLAT_REFERENCE)
            elif task["type"] == "model":
                if task["model_reference_path"]:
                    references.append(task["model_reference_path"])
                references.append(MODEL_STYLE_REFERENCE)

            version_id = task["current_version_id"]
            if version_id:
                row = db.execute(
                    "SELECT status FROM task_versions WHERE id=?", (version_id,)
                ).fetchone()
                if not row or row["status"] != "generating":
                    version_id = None
            if not version_id:
                next_v = db.execute(
                    "SELECT COALESCE(MAX(version),0)+1 v FROM task_versions WHERE task_id=?",
                    (task_id,),
                ).fetchone()["v"]
                version_id = uuid.uuid4().hex[:12]
                db.execute(
                    """INSERT INTO task_versions(id,task_id,version,tier,status,provider,created_at)
                       VALUES(?,?,?,?,?,?,?)""",
                    (version_id, task_id, next_v, task["tier"], "generating", task["provider"], utc_now()),
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

        task = get_db().execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
        provider = resolve_provider(task["provider"])
        request = GenerateRequest(
            task_id=task_id,
            tier=task["tier"],
            task_type=task["type"],
            prompt=task["prompt"],
            negative_prompt=task["negative_prompt"],
            reference_paths=references,
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

        provider.generate(request, stage, complete, error, task["idempotency_key"] or uuid.uuid4().hex)
        done.wait(timeout=300)
        db = get_db()
        try:
            call = db.execute(
                "SELECT id FROM provider_calls WHERE provider=? AND idempotency_key=?",
                (task["provider"], task["idempotency_key"]),
            ).fetchone()
            if "result" in result_box:
                result = result_box["result"]
                db.execute(
                    "UPDATE task_versions SET status='review',cost=?,duration_ms=?,file_path=? WHERE id=?",
                    (result.cost, result.duration_ms, result.file_path, version_id),
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
                self._event(task["project_id"], task_id, "task.review", f"任务 {task['code']} 已生成，等待审核")
            else:
                err = result_box.get("error")
                message = getattr(err, "message", "生成超时")
                code = getattr(err, "code", "TIMEOUT")
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
                db.commit()
                self._event(task["project_id"], task_id, "task.fail", f"任务 {task['code']} 失败：{message}")
        finally:
            db.close()


worker = QueueWorker()


