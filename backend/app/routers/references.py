"""Project-owned custom models and role-labelled generation references."""
from __future__ import annotations

import hashlib
import json
import uuid
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from ..config import settings
from ..database import get_db, utc_now
from ..services.image_qc import image_dimensions
from ..services.reference_qc_registry import is_known_bad_reference
from ..utils.case import camelize
from .assets import ALLOWED, valid_image_bytes

router = APIRouter()
REFERENCE_LIMITS = {"pose": 1, "style": 2, "detail": 3}
MODEL_REFERENCE_ANGLES = {
    "front", "three-quarter-left", "three-quarter-right",
    "profile-left", "profile-right", "back", "face-detail",
}
RIGHTS_BASES = {"self", "licensed", "consent"}
MAX_IMAGE_BYTES = 25 * 1024 * 1024


def _read_image(upload: UploadFile, data: bytes) -> tuple[str, str]:
    filename = upload.filename or "reference.png"
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED:
        raise HTTPException(400, "格式不支持")
    if not data or len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(400, "图片为空或超过 25MB")
    if not valid_image_bytes(data, suffix):
        raise HTTPException(400, "文件内容不是有效图片")
    return suffix, hashlib.sha256(data).hexdigest()


def _storage_file(relative_path: str) -> Path:
    root = settings.data_dir.resolve()
    path = (root / relative_path).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise HTTPException(404, "参考图文件不存在")
    return path


def _project_exists(db, project_id: str) -> None:
    if not db.execute("SELECT 1 FROM projects WHERE id=?", (project_id,)).fetchone():
        raise HTTPException(404, "项目不存在")


@router.get("/models")
def list_project_models(project_id: str) -> dict:
    db = get_db()
    try:
        _project_exists(db, project_id)
        selected = db.execute(
            "SELECT selected_model_id FROM projects WHERE id=?", (project_id,)
        ).fetchone()["selected_model_id"]
        rows = db.execute(
            """SELECT * FROM models
               WHERE enabled=1 AND (project_id IS NULL OR project_id=?)
               ORDER BY CASE WHEN project_id IS NULL THEN 0 ELSE 1 END,id""",
            (project_id,),
        ).fetchall()
        models = []
        for row in rows:
            model = dict(row)
            model["styles"] = json.loads(model["styles"])
            model["skinTone"] = model.pop("skin_tone")
            model["referencePath"] = model.pop("reference_path")
            model["licenseNote"] = model.pop("license_note")
            model["referenceHash"] = model.pop("reference_hash")
            model["projectId"] = model.pop("project_id")
            model["createdAt"] = model.pop("created_at")
            model["rightsBasis"] = model.pop("rights_basis", None)
            model["rightsNote"] = model.pop("rights_note", "")
            model["rightsConfirmedAt"] = model.pop("rights_confirmed_at", None)
            model["enabled"] = bool(model["enabled"])
            model["referenceUrl"] = (
                f"/api/projects/{project_id}/models/{model['id']}/reference"
                if model["source"] == "custom"
                else f"/api/library/models/{model['id']}/reference?variant=preview"
            )
            ref_rows = db.execute(
                "SELECT * FROM model_references WHERE model_id=? ORDER BY is_primary DESC,created_at,id",
                (model["id"],),
            ).fetchall()
            model["references"] = [
                {
                    **camelize(dict(reference)),
                    "url": f"/api/projects/{project_id}/models/{model['id']}/references/{reference['id']}/file",
                }
                for reference in ref_rows
            ]
            models.append(model)
        return {"models": camelize(models), "selectedModelId": selected}
    finally:
        db.close()


@router.post("/models/import")
async def import_custom_model(
    project_id: str,
    file: UploadFile = File(...),
    name: str = Form(default="自定义模特"),
    rights_confirmed: bool = Form(default=False, alias="rightsConfirmed"),
    rights_basis: str = Form(default="", alias="rightsBasis"),
    rights_note: str = Form(default="", alias="rightsNote"),
) -> dict:
    if not rights_confirmed or rights_basis not in RIGHTS_BASES:
        raise HTTPException(422, "必须确认人物图片使用权，并选择有效授权依据")
    data = await file.read()
    suffix, digest = _read_image(file, data)
    model_id = f"custom-{uuid.uuid4().hex[:12]}"
    target_dir = settings.data_dir / "projects" / project_id / "models"
    target = target_dir / f"{model_id}{suffix}"
    db = get_db()
    try:
        _project_exists(db, project_id)
        if db.execute(
            "SELECT 1 FROM models WHERE project_id=? AND reference_hash=?",
            (project_id, digest),
        ).fetchone():
            raise HTTPException(409, "该自定义模特已上传")
        target_dir.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        try:
            width, height = image_dimensions(target)
        except Exception as exc:
            target.unlink(missing_ok=True)
            raise HTTPException(400, "图片解码失败") from exc
        relative = target.relative_to(settings.data_dir).as_posix()
        clean_name = name.strip() or "自定义模特"
        db.execute(
            """INSERT INTO models(
                   id,name,pose,styles,skin_tone,hair,reference_path,license_note,
                   enabled,version,project_id,source,reference_hash,created_at,
                   rights_basis,rights_note,rights_confirmed_at
               ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                model_id, clean_name, "用户上传全身参考图", json.dumps(["自定义"], ensure_ascii=False),
                "", "", relative, "用户已显式确认人物图片使用权", 1, 1,
                project_id, "custom", digest, utc_now(),
                rights_basis, rights_note.strip(), utc_now(),
            ),
        )
        reference_id = uuid.uuid4().hex[:12]
        db.execute(
            """INSERT INTO model_references(
                   id,model_id,angle,name,file_path,hash,size,width,height,is_primary,created_at
               ) VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
            (
                reference_id, model_id, "front", "正面主参考", relative, digest,
                len(data), width, height, 1, utc_now(),
            ),
        )
        db.execute(
            "UPDATE projects SET selected_model_id=?,updated_at=? WHERE id=?",
            (model_id, utc_now(), project_id),
        )
        db.execute(
            "INSERT INTO events(time,project_id,type,message) VALUES(?,?,?,?)",
            (utc_now(), project_id, "model.custom.import", f"上传自定义模特：{clean_name}"),
        )
        db.commit()
        return {
            "model": {
                "id": model_id,
                "name": clean_name,
                "source": "custom",
                "projectId": project_id,
                "referenceUrl": f"/api/projects/{project_id}/models/{model_id}/reference",
                "width": width,
                "height": height,
                "rightsBasis": rights_basis,
                "rightsConfirmedAt": utc_now(),
                "references": [{
                    "id": reference_id, "angle": "front", "name": "正面主参考",
                    "url": f"/api/projects/{project_id}/models/{model_id}/references/{reference_id}/file",
                    "isPrimary": True,
                }],
            },
            "selectedModelId": model_id,
        }
    except Exception:
        if target.is_file() and not db.execute(
            "SELECT 1 FROM models WHERE id=?", (model_id,)
        ).fetchone():
            target.unlink(missing_ok=True)
        raise
    finally:
        db.close()


@router.post("/models/{model_id}/select")
def select_project_model(project_id: str, model_id: str) -> dict:
    db = get_db()
    try:
        _project_exists(db, project_id)
        model = db.execute(
            """SELECT id FROM models
               WHERE id=? AND enabled=1 AND (project_id IS NULL OR project_id=?)""",
            (model_id, project_id),
        ).fetchone()
        if not model:
            raise HTTPException(404, "模特不存在或不属于当前项目")
        db.execute(
            "UPDATE projects SET selected_model_id=?,updated_at=? WHERE id=?",
            (model_id, utc_now(), project_id),
        )
        db.commit()
        return {"selectedModelId": model_id}
    finally:
        db.close()


@router.get("/models/{model_id}/reference")
def custom_model_reference(project_id: str, model_id: str) -> FileResponse:
    db = get_db()
    try:
        row = db.execute(
            "SELECT reference_path FROM models WHERE id=? AND project_id=? AND enabled=1",
            (model_id, project_id),
        ).fetchone()
    finally:
        db.close()
    if not row:
        raise HTTPException(404, "自定义模特不存在")
    return FileResponse(_storage_file(row["reference_path"]))


@router.post("/models/{model_id}/references/import")
async def import_model_reference(
    project_id: str,
    model_id: str,
    angle: str = Form(...),
    file: UploadFile = File(...),
    name: str = Form(default=""),
) -> dict:
    if angle not in MODEL_REFERENCE_ANGLES or angle == "front":
        raise HTTPException(400, "附加角度必须是侧面、背面、三分之四或面部细节")
    data = await file.read()
    suffix, digest = _read_image(file, data)
    reference_id = uuid.uuid4().hex[:12]
    target_dir = settings.data_dir / "projects" / project_id / "models" / model_id
    target = target_dir / f"{reference_id}{suffix}"
    db = get_db()
    try:
        model = db.execute(
            "SELECT id FROM models WHERE id=? AND project_id=? AND source='custom' AND rights_confirmed_at IS NOT NULL",
            (model_id, project_id),
        ).fetchone()
        if not model:
            raise HTTPException(404, "自定义模特不存在、未授权或不属于当前项目")
        if db.execute("SELECT 1 FROM model_references WHERE model_id=? AND angle=?", (model_id, angle)).fetchone():
            raise HTTPException(409, "该角度已经上传")
        if db.execute("SELECT 1 FROM model_references WHERE model_id=? AND hash=?", (model_id, digest)).fetchone():
            raise HTTPException(409, "该图片已存在于身份包")
        target_dir.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        try:
            width, height = image_dimensions(target)
        except Exception as exc:
            target.unlink(missing_ok=True)
            raise HTTPException(400, "图片解码失败") from exc
        relative = target.relative_to(settings.data_dir).as_posix()
        clean_name = name.strip() or Path(file.filename or angle).stem
        db.execute(
            """INSERT INTO model_references(
                   id,model_id,angle,name,file_path,hash,size,width,height,is_primary,created_at
               ) VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
            (reference_id, model_id, angle, clean_name, relative, digest, len(data), width, height, 0, utc_now()),
        )
        db.execute(
            "INSERT INTO events(time,project_id,type,message) VALUES(?,?,?,?)",
            (utc_now(), project_id, "model.reference.import", f"模特身份包新增角度：{angle}"),
        )
        db.commit()
        return {"reference": {
            "id": reference_id, "modelId": model_id, "angle": angle, "name": clean_name,
            "filePath": relative, "url": f"/api/projects/{project_id}/models/{model_id}/references/{reference_id}/file",
            "size": len(data), "width": width, "height": height, "isPrimary": False,
        }}
    except Exception:
        if target.is_file() and not db.execute("SELECT 1 FROM model_references WHERE id=?", (reference_id,)).fetchone():
            target.unlink(missing_ok=True)
        raise
    finally:
        db.close()


@router.get("/models/{model_id}/references/{reference_id}/file")
def model_reference_file(project_id: str, model_id: str, reference_id: str) -> FileResponse:
    db = get_db()
    try:
        row = db.execute(
            """SELECT r.file_path FROM model_references r JOIN models m ON m.id=r.model_id
               WHERE r.id=? AND r.model_id=? AND m.project_id=?""",
            (reference_id, model_id, project_id),
        ).fetchone()
    finally:
        db.close()
    if not row:
        raise HTTPException(404, "模特身份参考不存在")
    return FileResponse(_storage_file(row["file_path"]))


@router.get("/references")
def list_project_references(project_id: str) -> dict:
    db = get_db()
    try:
        _project_exists(db, project_id)
        rows = db.execute(
            "SELECT * FROM project_references WHERE project_id=? ORDER BY role,created_at,id",
            (project_id,),
        ).fetchall()
        return {"references": camelize([dict(row) for row in rows])}
    finally:
        db.close()


@router.post("/references/import")
async def import_project_reference(
    project_id: str,
    role: str = Form(...),
    file: UploadFile = File(...),
    name: str = Form(default=""),
) -> dict:
    if role not in REFERENCE_LIMITS:
        raise HTTPException(400, "参考图角色必须是 pose、style 或 detail")
    data = await file.read()
    suffix, digest = _read_image(file, data)
    if is_known_bad_reference(digest):
        raise HTTPException(
            422,
            "该图片命中已确认的问题样例，不能作为生成参考图；请上传原始商品图或其他合格参考图",
        )
    reference_id = uuid.uuid4().hex[:12]
    target_dir = settings.data_dir / "projects" / project_id / "references"
    target = target_dir / f"{reference_id}{suffix}"
    db = get_db()
    try:
        _project_exists(db, project_id)
        count = db.execute(
            "SELECT COUNT(*) n FROM project_references WHERE project_id=? AND role=?",
            (project_id, role),
        ).fetchone()["n"]
        if count >= REFERENCE_LIMITS[role]:
            raise HTTPException(409, f"{role} 参考图最多 {REFERENCE_LIMITS[role]} 张")
        if db.execute(
            "SELECT 1 FROM project_references WHERE project_id=? AND role=? AND hash=?",
            (project_id, role, digest),
        ).fetchone():
            raise HTTPException(409, "该角色下已存在相同参考图")
        target_dir.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        try:
            width, height = image_dimensions(target)
        except Exception as exc:
            target.unlink(missing_ok=True)
            raise HTTPException(400, "图片解码失败") from exc
        relative = target.relative_to(settings.data_dir).as_posix()
        clean_name = name.strip() or Path(file.filename or "参考图").stem
        db.execute(
            """INSERT INTO project_references(
                   id,project_id,role,name,file_path,hash,size,width,height,created_at
               ) VALUES(?,?,?,?,?,?,?,?,?,?)""",
            (
                reference_id, project_id, role, clean_name, relative, digest,
                len(data), width, height, utc_now(),
            ),
        )
        db.execute(
            "INSERT INTO events(time,project_id,task_id,type,message) VALUES(?,?,?,?,?)",
            (utc_now(), project_id, reference_id, "reference.import", f"上传 {role} 参考图：{clean_name}"),
        )
        db.commit()
        return {
            "reference": {
                "id": reference_id,
                "projectId": project_id,
                "role": role,
                "name": clean_name,
                "filePath": relative,
                "size": len(data),
                "width": width,
                "height": height,
                "createdAt": utc_now(),
            }
        }
    except Exception:
        if target.is_file() and not db.execute(
            "SELECT 1 FROM project_references WHERE id=?", (reference_id,)
        ).fetchone():
            target.unlink(missing_ok=True)
        raise
    finally:
        db.close()


@router.get("/references/{reference_id}/file")
def project_reference_file(project_id: str, reference_id: str) -> FileResponse:
    db = get_db()
    try:
        row = db.execute(
            "SELECT file_path FROM project_references WHERE id=? AND project_id=?",
            (reference_id, project_id),
        ).fetchone()
    finally:
        db.close()
    if not row:
        raise HTTPException(404, "参考图不存在")
    return FileResponse(_storage_file(row["file_path"]))


@router.delete("/references/{reference_id}")
def delete_project_reference(project_id: str, reference_id: str) -> dict:
    db = get_db()
    try:
        row = db.execute(
            "SELECT file_path FROM project_references WHERE id=? AND project_id=?",
            (reference_id, project_id),
        ).fetchone()
        if not row:
            raise HTTPException(404, "参考图不存在")
        db.execute(
            "DELETE FROM project_references WHERE id=? AND project_id=?",
            (reference_id, project_id),
        )
        db.commit()
        path = (settings.data_dir / row["file_path"]).resolve()
        if path.is_relative_to(settings.data_dir.resolve()):
            path.unlink(missing_ok=True)
        return {"deleted": True}
    finally:
        db.close()
