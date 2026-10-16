import uuid

from fastapi.testclient import TestClient

from backend.app.database import get_db
from backend.app.main import app
from backend.app.providers.base import Cancellable
from backend.app.providers.openrouter_icu import classify_provider_error
from backend.app.providers.base import GenerateError
from backend.app.queue.worker import (
    AUTO_PAUSE_ERROR_CODES, QueueWorker, _provider_failure_detail,
)


def test_provider_error_classification_is_actionable():
    assert classify_provider_error("429 too many requests")[0] == "RATE_LIMITED"
    assert classify_provider_error("insufficient_quota")[0] == "QUOTA_EXCEEDED"
    assert classify_provider_error("401 invalid API key")[0] == "AUTHENTICATION_FAILED"
    assert classify_provider_error("content policy violation")[0] == "CONTENT_REJECTED"
    assert classify_provider_error("socket closed")[0] == "IMAGE_EDIT_FAILED"


def test_systemic_provider_errors_pause_and_keep_recovery_suggestion():
    error = GenerateError(
        "QUOTA_EXCEEDED", "账户额度不足", "充值或切换 Provider", False,
    )
    assert _provider_failure_detail(error) == (
        "QUOTA_EXCEEDED", "账户额度不足；建议：充值或切换 Provider",
    )
    assert {"QUOTA_EXCEEDED", "AUTHENTICATION_FAILED", "API_KEY_MISSING"} <= AUTO_PAUSE_ERROR_CODES


def test_quota_failure_stops_worker_and_persists_actionable_error(monkeypatch):
    class QuotaProvider:
        def generate(self, req, _stage, _complete, on_error, _key):
            on_error(GenerateError(
                "QUOTA_EXCEEDED", "测试账户额度不足", "切换 Provider 或停止生成", False,
            ))
            return Cancellable(req.task_id, lambda: None)

    with TestClient(app) as client:
        project = client.post("/api/projects", json={
            "sku": f"QUOTA-{uuid.uuid4().hex[:6]}", "name": "额度暂停测试",
            "platform": "taobao", "style": "简约", "budget": 10,
        }).json()
        project_id = project["id"]
        client.post(f"/api/projects/{project_id}/items", json={
            "name": "测试上衣", "categoryId": "top", "isSellable": True,
        })
        client.post(f"/api/projects/{project_id}/tasks/plan", json={
            "presetId": "fast-check", "provider": "mock", "replaceExisting": True,
            "shotIds": ["flat-front"],
        })
        task = client.get(f"/api/projects/{project_id}/tasks").json()["tasks"][0]

    db = get_db()
    try:
        db.execute(
            "UPDATE tasks SET provider='quota-test',status='queued' WHERE id=?",
            (task["id"],),
        )
        db.commit()
    finally:
        db.close()
    monkeypatch.setattr("backend.app.queue.worker.resolve_provider", lambda _id: QuotaProvider())
    local_worker = QueueWorker()
    try:
        local_worker._process_task(task["id"])
        assert local_worker.paused is True
    finally:
        local_worker._executor.shutdown(wait=True)

    db = get_db()
    try:
        failed = db.execute(
            """SELECT t.status,v.error_code,v.error_message
               FROM tasks t JOIN task_versions v ON v.id=t.current_version_id
               WHERE t.id=?""",
            (task["id"],),
        ).fetchone()
        assert failed["status"] == "failed"
        assert failed["error_code"] == "QUOTA_EXCEEDED"
        assert failed["error_message"] == (
            "测试账户额度不足；建议：切换 Provider 或停止生成"
        )
        event = db.execute(
            "SELECT message FROM events WHERE project_id=? AND type='queue.auto_pause'",
            (project_id,),
        ).fetchone()
        assert event and "队列已自动暂停" in event["message"]
    finally:
        db.close()


def test_provider_recovery_skips_masked_task_for_provider_without_mask_support(monkeypatch):
    with TestClient(app) as client:
        project = client.post("/api/projects", json={
            "sku": f"MASK-{uuid.uuid4().hex[:6]}", "name": "蒙版迁移", "platform": "local", "budget": 100,
        }).json()
        project_id = project["id"]
        client.post(f"/api/projects/{project_id}/items", json={
            "name": "测试上衣", "categoryId": "top", "isSellable": True,
        })
        planned = client.post(f"/api/projects/{project_id}/tasks/plan", json={
            "presetId": "fast-check", "provider": "mock", "replaceExisting": True,
            "shotIds": ["flat-front"],
        }).json()["planned"][0]
        db = get_db()
        try:
            db.execute(
                """INSERT INTO task_versions(
                       id,task_id,version,tier,status,provider,prompt,negative_prompt,mask_path,error_code,created_at
                   ) VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
                ("masked-version", planned["id"], 1, "draft", "failed", "openai", "p", "n", "mask.png", "QUOTA_EXCEEDED", "2026-10-16T00:00:00Z"),
            )
            db.execute(
                "UPDATE tasks SET status='failed',provider='openai',current_version_id='masked-version' WHERE id=?",
                (planned["id"],),
            )
            db.commit()
        finally:
            db.close()
        monkeypatch.setattr("backend.app.routers.tasks.worker.resume", lambda: None)
        response = client.post(
            f"/api/projects/{project_id}/tasks/queue/recover-provider",
            json={"provider": "volcengine-ark"},
        )
        assert response.status_code == 200
        assert response.json()["taskIds"] == []
        assert response.json()["skipped"] == [{
            "taskId": planned["id"], "reason": "目标 Provider 不支持蒙版重绘",
        }]


def test_provider_recovery_migrates_queue_and_only_systemic_failures(monkeypatch):
    with TestClient(app) as client:
        project = client.post("/api/projects", json={
            "sku": f"RECOVER-{uuid.uuid4().hex[:6]}", "name": "Provider 恢复测试",
            "platform": "taobao", "style": "简约", "budget": 10,
        }).json()
        project_id = project["id"]
        client.post(f"/api/projects/{project_id}/items", json={
            "name": "测试上衣", "categoryId": "top", "isSellable": True,
        })
        client.post(f"/api/projects/{project_id}/tasks/plan", json={
            "presetId": "fast-check", "provider": "mock", "replaceExisting": True,
            "shotIds": ["flat-front", "flat-back", "detail-collar"],
        })
        tasks = client.get(f"/api/projects/{project_id}/tasks").json()["tasks"]
        assert len(tasks) == 3

        quota_task, queued_task, content_task = tasks
        db = get_db()
        try:
            for task, version_id, status, error_code in (
                (quota_task, "quota-version", "failed", "QUOTA_EXCEEDED"),
                (queued_task, "queued-version", "generating", None),
                (content_task, "content-version", "failed", "CONTENT_REJECTED"),
            ):
                db.execute(
                    """INSERT INTO task_versions(
                           id,task_id,version,tier,status,provider,prompt,negative_prompt,
                           error_code,error_message,created_at)
                       VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
                    (
                        version_id, task["id"], 1, "draft", status, "quota-test",
                        task["prompt"], task["negativePrompt"], error_code,
                        "测试错误" if error_code else None, "2026-10-16T00:00:00Z",
                    ),
                )
                db.execute(
                    """UPDATE tasks SET status=?,provider='quota-test',current_version_id=?
                       WHERE id=?""",
                    ("queued" if task is queued_task else "failed", version_id, task["id"]),
                )
            db.commit()
        finally:
            db.close()

        resumed = []
        monkeypatch.setattr("backend.app.routers.tasks.worker.resume", lambda: resumed.append(True))
        response = client.post(
            f"/api/projects/{project_id}/tasks/queue/recover-provider",
            json={"provider": "mock"},
        )
        assert response.status_code == 200
        assert response.json()["retried"] == 1
        assert response.json()["migratedQueued"] == 1
        assert set(response.json()["taskIds"]) == {quota_task["id"], queued_task["id"]}
        assert response.json()["paused"] is False
        assert resumed == [True]

        assert client.post(
            f"/api/projects/{project_id}/tasks/queue/recover-provider",
            json={"provider": "not-a-provider"},
        ).status_code == 400

    db = get_db()
    try:
        recovered = db.execute(
            "SELECT status,provider,current_version_id FROM tasks WHERE id=?",
            (quota_task["id"],),
        ).fetchone()
        assert recovered["status"] == "queued"
        assert recovered["provider"] == "mock"
        assert recovered["current_version_id"] != "quota-version"
        retry_version = db.execute(
            "SELECT version,status,provider,error_code FROM task_versions WHERE id=?",
            (recovered["current_version_id"],),
        ).fetchone()
        assert dict(retry_version) == {
            "version": 2, "status": "generating", "provider": "mock", "error_code": None,
        }

        migrated = db.execute(
            """SELECT t.status,t.provider,v.provider version_provider
               FROM tasks t JOIN task_versions v ON v.id=t.current_version_id
               WHERE t.id=?""",
            (queued_task["id"],),
        ).fetchone()
        assert dict(migrated) == {
            "status": "queued", "provider": "mock", "version_provider": "mock",
        }

        untouched = db.execute(
            "SELECT status,provider,current_version_id FROM tasks WHERE id=?",
            (content_task["id"],),
        ).fetchone()
        assert dict(untouched) == {
            "status": "failed", "provider": "quota-test", "current_version_id": "content-version",
        }
        event = db.execute(
            "SELECT message FROM events WHERE project_id=? AND type='queue.provider_recover'",
            (project_id,),
        ).fetchone()
        assert event and "重试 1 个系统性失败任务" in event["message"]
        assert "迁移 1 个排队任务" in event["message"]
    finally:
        db.close()

