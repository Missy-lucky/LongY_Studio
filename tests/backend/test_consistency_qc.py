import json
import os
import shutil
import time
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "temp" / "tests" / "consistency-qc-data"
os.environ.setdefault("LONGY_DATA_DIR", str(DATA_DIR))
os.environ.setdefault("LONGY_MAX_CONCURRENCY", "2")
os.environ.setdefault("LONGY_MOCK_FAILURE_RATE", "0")

from fastapi.testclient import TestClient  # noqa: E402

from backend.app.main import app  # noqa: E402
from backend.app.database import get_db  # noqa: E402
from backend.app.services.consistency_qc import run_consistency_qc  # noqa: E402


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def wait_for_status(client: TestClient, project_id: str, task_id: str, timeout: float = 40):
    deadline = time.time() + timeout
    while time.time() < deadline:
        tasks = client.get(f"/api/projects/{project_id}/tasks").json()["tasks"]
        task = next(item for item in tasks if item["id"] == task_id)
        if task["status"] not in {"queued", "generating"}:
            return task
        time.sleep(0.1)
    raise AssertionError("HD repair did not finish")


def test_model_identity_qc_uses_face_and_pose(client: TestClient):
    reference = ROOT / "asset-library" / "model-library" / "v2" / "chinese-grand" / "fullbody.png"
    report = run_consistency_qc(
        reference,
        "model",
        garment_reference=reference,
        model_reference=reference,
        enforce=True,
    )
    assert report["schema"] == "longy.consistency-qc.v2"
    assert report["model"]["faceGeometrySimilarity"] is not None
    assert report["model"]["faceAppearanceSimilarity"] is not None
    assert report["model"]["referencePose"] is not None
    assert report["model"]["outputPose"] is not None
    assert report["model"]["passed"] is True
    assert report["garment"]["passed"] is True
    assert report["authenticity"]["color"]["status"] == "pass"
    assert report["authenticity"]["silhouette"]["status"] == "pass"
    assert report["detail"]["laplacianVariance"] > 0


def test_mock_hd_repair_creates_new_raster_version_and_qc_report(client: TestClient):
    from PIL import Image

    project = client.post("/api/projects", json={
        "sku": "HD-QC-001", "name": "高清修复测试", "platform": "taobao", "style": "测试", "budget": 100,
    }).json()
    pid = project["id"]
    client.post(f"/api/projects/{pid}/items", json={
        "name": "高清测试上衣", "categoryId": "top", "isSellable": True,
    })
    client.post(f"/api/projects/{pid}/tasks/plan", json={
        "presetId": "fast-check", "provider": "mock", "replaceExisting": True,
        "modelIds": ["chinese-grand"],
    })
    tasks = client.get(f"/api/projects/{pid}/tasks").json()["tasks"]
    task = next(item for item in tasks if item["type"] == "model")
    client.post(f"/api/projects/{pid}/tasks/submit", json={"taskIds": [task["id"]]})
    draft = wait_for_status(client, pid, task["id"])
    assert draft["tier"] == "draft"

    response = client.post(f"/api/projects/{pid}/tasks/{task['id']}/hd-repair")
    assert response.status_code == 200
    assert response.json()["tier"] == "hd"
    hd = wait_for_status(client, pid, task["id"])
    assert hd["tier"] == "hd"
    assert hd["status"] == "review"

    version = next(item for item in hd["versions"] if item["id"] == hd["currentVersionId"])
    assert version["tier"] == "hd"
    assert Path(version["filePath"]).suffix == ".png"
    with Image.open(version["filePath"]) as image:
        assert image.size == (1152, 1536)
    assert version["qcScore"] is not None
    assert version["qcReportPath"]

    qc = client.get(f"/api/projects/{pid}/tasks/{task['id']}/versions/{version['id']}/qc").json()
    assert qc["passed"] is True
    assert qc["report"]["pipeline"] == ["base-generation", "hd-detail-repair"]
    assert qc["report"]["detail"]["sourceWidth"] == 1152
    assert qc["report"]["model"]["score"] is not None
    assert "face_not_detected" in qc["report"]["model"]["reasons"]

    unreviewed_lock = client.post(
        f"/api/projects/{pid}/tasks/{task['id']}/review",
        json={"action": "lock"},
    )
    assert unreviewed_lock.status_code == 409
    assert "先点击满意" in unreviewed_lock.json()["detail"]

    db = get_db()
    try:
        db.execute(
            "UPDATE task_versions SET qc_passed=0 WHERE id=?",
            (version["id"],),
        )
        db.commit()
    finally:
        db.close()
    assert client.post(
        f"/api/projects/{pid}/tasks/{task['id']}/review",
        json={"action": "accept"},
    ).status_code == 200
    blocked_lock = client.post(
        f"/api/projects/{pid}/tasks/{task['id']}/review",
        json={"action": "lock"},
    )
    assert blocked_lock.status_code == 409
    assert "QC 未通过" in blocked_lock.json()["detail"]

    db = get_db()
    try:
        db.execute(
            "UPDATE task_versions SET qc_passed=1 WHERE id=?",
            (version["id"],),
        )
        db.commit()
    finally:
        db.close()
    assert client.post(
        f"/api/projects/{pid}/tasks/{task['id']}/review",
        json={"action": "lock"},
    ).status_code == 200

