"""导出接口：仅导出锁定版本，重名不覆盖，写入导出档案。"""
import re
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from ..config import settings
from ..database import get_db
from ..services.shot_coverage import project_shot_coverage

router = APIRouter()
TYPE_FOLDERS = {"flat": "01_平面图", "detail": "02_细节图", "partial": "03_局部图", "model": "04_模特图"}


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def safe_name(s: str) -> str:
    return re.sub(r'[\\/:*?"<>|\s]+', "-", s).strip("-") or "untitled"


def task_filename(scheme: str, sku: str, item: str, code: str, version: int, suffix: str) -> str:
    if scheme == "compact":
        return f"{safe_name(item or '套装')}-{safe_name(code)}-v{version}{suffix}"
    return f"{sku}-{safe_name(item or '套装')}-{safe_name(code)}-v{version}{suffix}"


def asset_filename(scheme: str, sku: str, item: str, shot_id: str, suffix: str) -> str:
    if scheme == "compact":
        return f"{safe_name(item or '套装')}-{safe_name(shot_id)}-original{suffix}"
    return f"{sku}-{safe_name(item or '套装')}-{safe_name(shot_id)}-original{suffix}"


@router.get("/preview")
def preview(project_id: str, naming_scheme: str = "detailed") -> dict:
    if naming_scheme not in {"detailed", "compact"}:
        raise HTTPException(422, "naming_scheme 仅支持 detailed / compact")
    db = get_db()
    try:
        proj = db.execute("SELECT sku,name FROM projects WHERE id=?", (project_id,)).fetchone()
        if not proj:
            raise HTTPException(404, "项目不存在")
        rows = db.execute(
            """SELECT t.id,t.code,t.type,v.version,v.file_path,i.name item_name
               FROM tasks t JOIN task_versions v ON v.id=t.current_version_id
               LEFT JOIN items i ON i.id=t.item_id
               WHERE t.project_id=? AND t.status IN ('locked','exported') ORDER BY t.code""",
            (project_id,),
        ).fetchall()
        seen: dict[str, int] = {}
        files = []
        for r in rows:
            base = task_filename(
                naming_scheme, proj["sku"], r["item_name"] or "套装", r["code"],
                r["version"], Path(r["file_path"] or "x.svg").suffix,
            )
            seen[base] = seen.get(base, 0) + 1
            files.append({
                "taskId": r["id"], "assetId": None, "fileName": base,
                "folder": TYPE_FOLDERS[r["type"]], "conflict": seen[base] > 1,
            })
        asset_rows = db.execute(
            """SELECT s.shot_id,s.shot_name,s.type,a.id asset_id,a.file_path,i.name item_name
               FROM project_shot_selections s
               JOIN assets a ON a.id=s.asset_id
               JOIN items i ON i.id=s.item_id
               WHERE s.project_id=? AND s.status='fulfilled' AND s.source='asset'
               ORDER BY i.created_at,i.id,s.priority,s.shot_id""",
            (project_id,),
        ).fetchall()
        for r in asset_rows:
            base = asset_filename(
                naming_scheme, proj["sku"], r["item_name"] or "套装",
                r["shot_id"], Path(r["file_path"]).suffix,
            )
            seen[base] = seen.get(base, 0) + 1
            files.append({
                "taskId": None, "assetId": r["asset_id"], "fileName": base,
                "folder": TYPE_FOLDERS[r["type"]], "conflict": seen[base] > 1,
            })
        root = settings.data_dir / "exports" / f"{proj['sku']}-{safe_name(proj['name'])}"
        coverage = project_shot_coverage(project_id)
        return {
            "files": files,
            "exportDir": str(root),
            "coverageComplete": coverage["complete"],
            "coverage": coverage["coverage"],
            "missingShotNames": coverage["missingShotNames"],
        }
    finally:
        db.close()


class ExportIn(BaseModel):
    task_ids: list[str] = Field(default_factory=list, alias="taskIds")
    asset_ids: list[str] = Field(default_factory=list, alias="assetIds")
    target_dir: str | None = Field(default=None, alias="targetDir")
    naming_scheme: str = Field(default="detailed", alias="namingScheme")


@router.post("")
def export(project_id: str, body: ExportIn) -> dict:
    if body.naming_scheme not in {"detailed", "compact"}:
        raise HTTPException(422, "namingScheme 仅支持 detailed / compact")
    db = get_db()
    try:
        proj = db.execute("SELECT sku,name FROM projects WHERE id=?", (project_id,)).fetchone()
        if not proj:
            raise HTTPException(404, "项目不存在")
        coverage = project_shot_coverage(project_id)
        if not coverage["complete"]:
            raise HTTPException(
                409,
                f"缺少必拍镜头：{'、'.join(coverage['missingShotNames'])}",
            )
        rows = []
        for tid in body.task_ids:
            row = db.execute(
                """SELECT t.id,t.code,t.type,v.id version_id,v.version,v.file_path,i.name item_name
                   FROM tasks t JOIN task_versions v ON v.id=t.current_version_id
                   LEFT JOIN items i ON i.id=t.item_id
                   WHERE t.id=? AND t.project_id=? AND t.status IN ('locked','exported')""",
                (tid, project_id),
            ).fetchone()
            if row and row["file_path"]:
                rows.append(row)
        target = Path(body.target_dir) if body.target_dir else settings.data_dir / "exports" / f"{proj['sku']}-{safe_name(proj['name'])}"
        target.mkdir(parents=True, exist_ok=True)
        batch_id = uuid.uuid4().hex[:12]
        db.execute("INSERT INTO export_batches(id,project_id,target_dir,created_at) VALUES(?,?,?,?)",
                   (batch_id, project_id, str(target), now()))
        mapping, exported, failed = [], 0, []
        for r in rows:
            try:
                src = (settings.data_dir / r["file_path"]).resolve()
                if not src.is_file():
                    raise RuntimeError("源文件不存在")
                folder = target / TYPE_FOLDERS[r["type"]]
                folder.mkdir(parents=True, exist_ok=True)
                base = task_filename(
                    body.naming_scheme, proj["sku"], r["item_name"] or "套装",
                    r["code"], r["version"], src.suffix,
                )
                out = folder / base
                n = 1
                while out.exists():
                    out = folder / f"{Path(base).stem}-{n}{src.suffix}"
                    n += 1
                shutil.copy2(src, out)
                db.execute("INSERT INTO export_files(id,batch_id,task_id,source_version_id,file_path,original_name,created_at) VALUES(?,?,?,?,?,?,?)",
                           (uuid.uuid4().hex[:12], batch_id, r["id"], r["version_id"], str(out), out.name, now()))
                db.execute("UPDATE tasks SET status='exported',updated_at=? WHERE id=?", (now(), r["id"]))
                db.execute("UPDATE task_versions SET status='exported' WHERE id=?", (r["version_id"],))
                mapping.append({"taskId": r["id"], "written": str(out)})
                exported += 1
            except Exception as exc:
                failed.append({"taskId": r["id"], "reason": str(exc)})
        asset_rows = []
        if body.asset_ids:
            asset_rows = db.execute(
                """SELECT s.shot_id,s.shot_name,s.type,a.id asset_id,a.file_path,i.name item_name
                   FROM project_shot_selections s
                   JOIN assets a ON a.id=s.asset_id
                   JOIN items i ON i.id=s.item_id
                   WHERE s.project_id=? AND s.status='fulfilled' AND s.source='asset'
                   AND a.id IN ({})
                   ORDER BY i.created_at,i.id,s.priority,s.shot_id""".format(
                       ",".join("?" for _ in body.asset_ids)
                   ),
                (project_id, *body.asset_ids),
            ).fetchall()
        for r in asset_rows:
            try:
                src = (settings.data_dir / r["file_path"]).resolve()
                if not src.is_file():
                    raise RuntimeError("源素材不存在")
                folder = target / TYPE_FOLDERS[r["type"]]
                folder.mkdir(parents=True, exist_ok=True)
                base = asset_filename(
                    body.naming_scheme, proj["sku"], r["item_name"] or "套装",
                    r["shot_id"], src.suffix,
                )
                out = folder / base
                asset_n = 1
                while out.exists():
                    out = folder / f"{Path(base).stem}-{asset_n}{src.suffix}"
                    asset_n += 1
                shutil.copy2(src, out)
                db.execute(
                    """INSERT INTO export_asset_files(
                           id,batch_id,asset_id,shot_id,file_path,original_name,created_at
                       ) VALUES(?,?,?,?,?,?,?)""",
                    (uuid.uuid4().hex[:12], batch_id, r["asset_id"], r["shot_id"], str(out), out.name, now()),
                )
                mapping.append({"assetId": r["asset_id"], "written": str(out)})
                exported += 1
            except Exception as exc:
                failed.append({"assetId": r["asset_id"], "reason": str(exc)})

        db.execute("INSERT INTO events(time,project_id,type,message) VALUES(?,?,?,?)",
                   (now(), project_id, "export.done", f"导出完成：{exported} 张成功，{len(failed)} 张失败"))
        db.commit()
        return {"exported": exported, "mapping": mapping, "failed": failed, "batchId": batch_id, "targetDir": str(target)}
    finally:
        db.close()


