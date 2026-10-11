"""把 asset-library/ 中的 JSON 规则导入 SQLite。JSON 是源头，数据库是运行索引。"""
import json
from pathlib import Path
from ..database import get_db, utc_now
from ..config import PROJECT_ROOT

LIBRARY_ROOT = PROJECT_ROOT / "asset-library"


def _read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def load_asset_library() -> dict:
    counts = {"categories": 0, "referenceSpecs": 0, "models": 0}
    db = get_db()
    try:
        now = utc_now()
        for path in sorted((LIBRARY_ROOT / "categories").glob("*.json")):
            if path.name in {"manifest.json", "all.json"}:
                continue
            c = _read(path)
            db.execute(
                """INSERT INTO categories(
                    id,name,body_zone,layer_order,required_views,default_detail_tasks,
                    default_partial_tasks,model_prompt_hints,negative_hints,is_sellable_default,
                    builtin,version,created_at,updated_at
                ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET name=excluded.name,body_zone=excluded.body_zone,
                    layer_order=excluded.layer_order,required_views=excluded.required_views,
                    default_detail_tasks=excluded.default_detail_tasks,
                    default_partial_tasks=excluded.default_partial_tasks,
                    model_prompt_hints=excluded.model_prompt_hints,negative_hints=excluded.negative_hints,
                    is_sellable_default=excluded.is_sellable_default,builtin=excluded.builtin,
                    version=excluded.version,updated_at=excluded.updated_at""",
                (c["id"], c["name"], c["bodyZone"], c["layerOrder"], json.dumps(c["requiredViews"], ensure_ascii=False),
                 json.dumps(c["defaultDetailTasks"], ensure_ascii=False), json.dumps(c["defaultPartialTasks"], ensure_ascii=False),
                 c["modelPromptHints"], c["negativeHints"], int(c["isSellableByDefault"]), int(c["builtin"]), 1, now, now),
            )
            counts["categories"] += 1
        for path in sorted((LIBRARY_ROOT / "reference-styles").glob("*.json")):
            s = _read(path)
            db.execute(
                """INSERT INTO reference_specs(id,type,name,composition,background,lighting,ratio,applicable_categories,is_default,version)
                VALUES(?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET type=excluded.type,name=excluded.name,composition=excluded.composition,
                    background=excluded.background,lighting=excluded.lighting,ratio=excluded.ratio,
                    applicable_categories=excluded.applicable_categories,is_default=excluded.is_default,version=excluded.version""",
                (s["id"], s["type"], s["name"], s["composition"], s["background"], s["lighting"], s["ratio"],
                 json.dumps(s["applicableCategories"], ensure_ascii=False), int(s["isDefault"]), 1),
            )
            counts["referenceSpecs"] += 1
        for path in sorted((LIBRARY_ROOT / "model-library").glob("*.json")):
            if path.name == "model-styles.json":
                continue
            m = _read(path)
            db.execute(
                """INSERT INTO models(id,name,pose,styles,skin_tone,hair,reference_path,license_note,enabled,version)
                VALUES(?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET name=excluded.name,pose=excluded.pose,styles=excluded.styles,
                    skin_tone=excluded.skin_tone,hair=excluded.hair,reference_path=excluded.reference_path,
                    license_note=excluded.license_note,enabled=excluded.enabled,version=excluded.version""",
                (m["id"], m["name"], m["pose"], json.dumps(m["styles"], ensure_ascii=False), m["skinTone"], m["hair"],
                 m.get("referencePath"), m["licenseNote"], int(m["enabled"]), 1),
            )
            counts["models"] += 1
        db.commit()
    finally:
        db.close()
    return counts
