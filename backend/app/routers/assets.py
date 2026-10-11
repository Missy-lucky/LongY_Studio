"""素材接口：导入、去重、分组、品类确认、安全读取与旧版流程预处理。"""
import hashlib
import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field

from ..config import PROJECT_ROOT, settings
from ..database import get_db
from ..services.image_qc import (
    image_dimensions,
    inspect_image,
    prepare_plan_view_inputs,
)
from ..utils.case import camelize

router = APIRouter()
ALLOWED = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".tif", ".tiff", ".bmp"}


def valid_image_bytes(data: bytes, ext: str) -> bool:
    """扩展名与文件头双重校验，避免伪装成图片的可执行或任意文件。"""
    if ext in {".jpg", ".jpeg"}:
        return data.startswith(b"\xff\xd8\xff")
    if ext == ".png":
        return data.startswith(b"\x89PNG\r\n\x1a\n")
    if ext == ".webp":
        return len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP"
    if ext in {".heic", ".heif"}:
        return len(data) >= 12 and data[4:8] == b"ftyp"
    if ext in {".tif", ".tiff"}:
        return data.startswith(b"II*\x00") or data.startswith(b"MM\x00*")
    if ext == ".bmp":
        return data.startswith(b"BM")
    return False


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def safe_name(s: str) -> str:
    return re.sub(r'[\\/:*?"<>|\s]+', "-", s).strip("-") or "untitled"


def _asset_path(project_id: str, asset_id: str) -> tuple[Path, Path]:
    db = get_db()
    try:
        row = db.execute(
            "SELECT file_path FROM assets WHERE id=? AND project_id=?",
            (asset_id, project_id),
        ).fetchone()
        if not row:
            raise HTTPException(404, "素材不存在")
        relative = Path(row["file_path"])
        absolute = (settings.data_dir / relative).resolve()
        if not str(absolute).startswith(str(settings.data_dir.resolve())):
            raise HTTPException(400, "非法素材路径")
        if not absolute.is_file():
            raise HTTPException(404, "素材文件不存在")
        return relative, absolute
    finally:
        db.close()


@router.post("/import")
async def import_assets(project_id: str, files: list[UploadFile] = File(...)) -> dict:
    db = get_db()
    imported, duplicated = 0, 0
    failed = []
    try:
        if not db.execute("SELECT 1 FROM projects WHERE id=?", (project_id,)).fetchone():
            raise HTTPException(404, "项目不存在")
        for f in files:
            ext = "." + (f.filename or "").rsplit(".", 1)[-1].lower()
            if ext not in ALLOWED:
                failed.append({"name": f.filename, "reason": "格式不支持"})
                continue
            data = await f.read()
            if not valid_image_bytes(data, ext):
                failed.append({"name": f.filename, "reason": "文件内容不是有效图片"})
                continue
            digest = hashlib.sha256(data).hexdigest()
            if db.execute(
                "SELECT 1 FROM assets WHERE project_id=? AND hash=?", (project_id, digest)
            ).fetchone():
                duplicated += 1
                continue
            asset_dir = settings.data_dir / "projects" / project_id / "assets"
            asset_dir.mkdir(parents=True, exist_ok=True)
            filename = f"{uuid.uuid4().hex[:12]}{ext}"
            target = asset_dir / filename
            target.write_bytes(data)
            try:
                width, height = image_dimensions(target)
            except Exception:
                target.unlink(missing_ok=True)
                failed.append({"name": f.filename, "reason": "图片解码失败"})
                continue
            db.execute(
                """INSERT INTO assets(id,project_id,file_path,hash,size,width,height,created_at)
                   VALUES(?,?,?,?,?,?,?,?)""",
                (uuid.uuid4().hex[:12], project_id, f"projects/{project_id}/assets/{filename}",
                 digest, len(data), width, height, now()),
            )
            imported += 1
        db.execute(
            "INSERT INTO events(time,project_id,type,message) VALUES(?,?,?,?)",
            (now(), project_id, "assets.import",
             f"已导入 {imported} 张，重复 {duplicated} 张，失败 {len(failed)} 张"),
        )
        db.commit()
    finally:
        db.close()
    return {"imported": imported, "duplicated": duplicated, "failed": failed}


@router.get("")
def list_assets(project_id: str) -> dict:
    db = get_db()
    try:
        rows = db.execute(
            "SELECT * FROM assets WHERE project_id=? ORDER BY created_at,id",
            (project_id,),
        ).fetchall()
        return {"assets": camelize([dict(r) for r in rows])}
    finally:
        db.close()


class ConfirmIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    category_id: str = Field(alias="categoryId")
    view_slot: str | None = Field(default=None, alias="viewSlot")
    item_id: str | None = Field(default=None, alias="itemId")


@router.post("/{asset_id}/confirm")
def confirm(project_id: str, asset_id: str, body: ConfirmIn) -> dict:
    db = get_db()
    try:
        cur = db.execute(
            "UPDATE assets SET category_id=?,view_slot=?,item_id=? WHERE id=? AND project_id=?",
            (body.category_id, body.view_slot, body.item_id, asset_id, project_id),
        )
        if cur.rowcount == 0:
            raise HTTPException(404, "素材不存在")
        db.execute(
            "INSERT INTO events(time,project_id,task_id,type,message) VALUES(?,?,?,?,?)",
            (now(), project_id, asset_id, "category.confirm", f"素材确认品类：{body.category_id}"),
        )
        db.commit()
        return {"ok": True}
    finally:
        db.close()


@router.get("/{asset_id}/file")
def asset_file(project_id: str, asset_id: str) -> FileResponse:
    _, absolute = _asset_path(project_id, asset_id)
    return FileResponse(absolute)


@router.get("/{asset_id}/quality")
def asset_quality(project_id: str, asset_id: str) -> dict:
    _, absolute = _asset_path(project_id, asset_id)
    # 素材原图不强制 1536 方图；只检查可解码和白底/覆盖率参考值。
    return {"metrics": inspect_image(absolute, expected_size=None)}


@router.post("/{asset_id}/legacy-plan-view/prepare")
def prepare_legacy_plan_view(project_id: str, asset_id: str) -> dict:
    """把旧版两阶段平面图流程的输入准备到 storage，不修改素材原件。"""
    _, absolute = _asset_path(project_id, asset_id)
    work_dir = settings.data_dir / "projects" / project_id / "legacy-plan-view" / asset_id
    prepared = prepare_plan_view_inputs(absolute, work_dir)
    template_path = PROJECT_ROOT / "asset-library" / "prompt-templates" / "legacy-v2.json"
    template = json.loads(template_path.read_text(encoding="utf-8"))

    def storage_relative(path: Path) -> str:
        return path.relative_to(settings.data_dir).as_posix()

    db = get_db()
    try:
        db.execute(
            "INSERT INTO events(time,project_id,task_id,type,message) VALUES(?,?,?,?,?)",
            (now(), project_id, asset_id, "legacy.prepare",
             "旧版平面图输入已准备：上传图 + 高清细节证据图"),
        )
        db.commit()
    finally:
        db.close()
    return {
        "uploadPath": storage_relative(prepared.upload_path),
        "evidencePath": storage_relative(prepared.evidence_path),
        "basePrompt": template["flatBase"],
        "retouchPrompt": template["flatRetouch"],
        "referencePath": "asset-library/reference-templates/plan-view.png",
        "qualityGates": template["qualityGates"],
    }

