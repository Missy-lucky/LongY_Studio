"""共享资产规则库接口：品类、规范、模特、提示词模板与参考图安全读取。"""
import json
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from ..config import PROJECT_ROOT
from ..database import get_db
from ..services.prompt_builder import legacy_prompts
from ..services.library_loader import load_shot_templates
from ..utils.case import camelize

router = APIRouter()


@router.get("/categories")
def categories() -> dict:
    db = get_db()
    try:
        rows = db.execute("SELECT * FROM categories ORDER BY layer_order,name").fetchall()
        out = []
        for r in rows:
            d = dict(r)
            d["requiredViews"] = json.loads(d.pop("required_views"))
            d["defaultDetailTasks"] = json.loads(d.pop("default_detail_tasks"))
            d["defaultPartialTasks"] = json.loads(d.pop("default_partial_tasks"))
            d["modelPromptHints"] = d.pop("model_prompt_hints")
            d["negativeHints"] = d.pop("negative_hints")
            d["isSellableDefault"] = bool(d.pop("is_sellable_default"))
            d["builtin"] = bool(d.pop("builtin"))
            out.append(d)
        return {"categories": out}
    finally:
        db.close()


@router.get("/reference-specs")
def reference_specs() -> dict:
    db = get_db()
    try:
        rows = db.execute("SELECT * FROM reference_specs ORDER BY type,name").fetchall()
        out = []
        for r in rows:
            d = dict(r)
            d["applicableCategories"] = json.loads(d.pop("applicable_categories"))
            d["isDefault"] = bool(d.pop("is_default"))
            out.append(d)
        return {"referenceSpecs": out}
    finally:
        db.close()


@router.get("/models")
def models() -> dict:
    db = get_db()
    try:
        rows = db.execute("SELECT * FROM models ORDER BY id").fetchall()
        out = []
        for r in rows:
            d = dict(r)
            d["styles"] = json.loads(d["styles"])
            d["skinTone"] = d.pop("skin_tone")
            d["referencePath"] = d.pop("reference_path")
            d["licenseNote"] = d.pop("license_note")
            d["enabled"] = bool(d.pop("enabled"))
            out.append(d)
        return {"models": out}
    finally:
        db.close()


@router.get("/models/{model_id}/reference")
def model_reference(model_id: str, variant: str = "full") -> FileResponse:
    db = get_db()
    try:
        row = db.execute(
            "SELECT reference_path FROM models WHERE id=? AND enabled=1", (model_id,)
        ).fetchone()
    finally:
        db.close()
    if not row or not row["reference_path"]:
        raise HTTPException(404, "模特没有可用参考图")
    path = (PROJECT_ROOT / row["reference_path"]).resolve()
    if variant == "preview":
        preview = path.with_name("model-card.jpg")
        if preview.is_file():
            path = preview
    asset_root = (PROJECT_ROOT / "asset-library").resolve()
    if not str(path).startswith(str(asset_root)) or not path.is_file():
        raise HTTPException(404, "模特参考图不存在")
    return FileResponse(path)


@router.get("/prompt-templates")
def prompt_templates() -> dict:
    path = PROJECT_ROOT / "asset-library" / "prompt-templates" / "legacy-v2.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    data.update(legacy_prompts())
    return {"templates": camelize(data)}


@router.get("/shot-templates/{category_id}")
def shot_template(category_id: str) -> dict:
    template = load_shot_templates().get(category_id)
    if not template:
        raise HTTPException(404, "品类套图模板不存在")
    return {"template": template}
