"""按品类套图模板拆解任务：确定性规则，不消耗大模型 token。"""
import hashlib
import json
import uuid

from ..config import PROJECT_ROOT
from ..database import get_db, utc_now
from ..providers import resolve_provider
from ..services.library_loader import SHOT_GROUPS, load_shot_templates
from ..services.prompt_builder import _templates, build_prompt

PRESET_ROOT = PROJECT_ROOT / "asset-library" / "generation-presets"
SHOT_TYPE_NAMES = {
    "flat": "平面图",
    "detail": "细节图",
    "partial": "局部图",
    "model": "模特图",
}


def _load_preset(preset_id: str) -> dict:
    path = PRESET_ROOT / f"{preset_id}.json"
    if not path.exists():
        path = PRESET_ROOT / "draft-first.json"
    return json.loads(path.read_text(encoding="utf-8"))


def _cache_key(
    item_id: str,
    task_type: str,
    shot_id: str,
    priority: str,
    tier: str,
    prompt: str,
    provider: str,
) -> str:
    raw = "\n".join((item_id, task_type, shot_id, priority, tier, prompt, provider))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _allowed_priorities(preset_id: str) -> set[str]:
    if preset_id == "fast-check":
        return {"P0"}
    if preset_id == "draft-first":
        return {"P0", "P1"}
    return {"P0", "P1", "P2"}


def _expand_template_shots(template: dict, attributes: dict[str, bool]) -> list[dict]:
    """按固定镜头 + 条件镜头展开，保持模板文件中的分组顺序。"""
    shots: list[dict] = []
    for group in SHOT_GROUPS:
        shots.extend(template["shots"][group])
    for rule in template["conditionalShots"]:
        condition = rule["when"]
        if attributes.get(condition["attribute"]) == condition["equals"]:
            shots.extend(rule["add"])
    return shots


def _legacy_shots(item, preset: dict) -> list[dict]:
    """旧品类字段兜底；仅在该品类没有套图模板时使用。"""
    shots: list[dict] = []
    views = json.loads(item["required_views"])
    if preset.get("flat") == "firstTwoViews":
        views = views[:2]
    shots.extend({
        "id": f"legacy-flat-{index}",
        "name": view,
        "type": "flat",
        "required": True,
        "priority": "P0",
        "promptHints": "",
        "references": ["garment"],
    } for index, view in enumerate(views))
    shots.extend({
        "id": f"legacy-detail-{index}",
        "name": focus,
        "type": "detail",
        "required": True,
        "priority": "P0",
        "promptHints": "",
        "references": ["garment"],
    } for index, focus in enumerate(json.loads(item["default_detail_tasks"])[: int(preset["detailPerItem"])]))
    shots.extend({
        "id": f"legacy-partial-{index}",
        "name": focus,
        "type": "partial",
        "required": True,
        "priority": "P0",
        "promptHints": "",
        "references": ["garment"],
    } for index, focus in enumerate(json.loads(item["default_partial_tasks"])[: int(preset["partialPerItem"])]))
    return shots


def plan_tasks(
    project_id: str,
    preset_id: str = "draft-first",
    provider_id: str = "mock",
    replace_existing: bool = False,
    model_ids: list[str] | None = None,
    shot_ids: list[str] | None = None,
) -> dict:
    preset = _load_preset(preset_id)
    provider = resolve_provider(provider_id)
    legacy_negative = _templates()["negativePrompt"]
    templates = load_shot_templates()
    allowed_priorities = _allowed_priorities(preset_id)
    db = get_db()
    planned, cached, skipped = [], [], 0
    requested_shots = set(shot_ids) if shot_ids is not None else None

    try:
        if replace_existing:
            db.execute(
                "DELETE FROM tasks WHERE project_id=? AND status IN ('planned','cached')",
                (project_id,),
            )
        max_code = db.execute(
            "SELECT COALESCE(MAX(CAST(substr(code,2) AS INTEGER)),0) n FROM tasks WHERE project_id=?",
            (project_id,),
        ).fetchone()["n"]
        items = db.execute(
            """SELECT i.*, c.name category_name,c.required_views,c.default_detail_tasks,
                      c.default_partial_tasks,c.model_prompt_hints,c.negative_hints
               FROM items i JOIN categories c ON c.id=i.category_id
               WHERE i.project_id=? ORDER BY i.created_at,i.id""",
            (project_id,),
        ).fetchall()
        models = db.execute("SELECT * FROM models WHERE enabled=1 ORDER BY id").fetchall()
        if model_ids is not None:
            selected = set(model_ids)
            models = [model for model in models if model["id"] in selected]

        primary_item = next(
            (item for item in items if item["is_sellable"]),
            items[0] if items else None,
        )
        selection_rows = {
            (row["item_id"], row["shot_id"]): dict(row)
            for row in db.execute(
                "SELECT * FROM project_shot_selections WHERE project_id=?",
                (project_id,),
            ).fetchall()
        }

        def add(item, shot: dict, model=None):
            nonlocal max_code
            max_code += 1
            task_type = shot["type"]
            prompt = build_prompt(
                task_type,
                item["name"],
                item["category_name"],
                shot["name"],
                item["color_material"],
                item["selling_points"],
                model["name"] if model else None,
                item["model_prompt_hints"],
                shot["promptHints"],
            )
            key = _cache_key(
                item["id"], task_type, shot["id"], shot["priority"],
                preset["tier"], prompt, provider.id,
            )
            existing_cache = db.execute(
                "SELECT file_path FROM cache_entries WHERE cache_key=?", (key,)
            ).fetchone()
            tid = uuid.uuid4().hex[:12]
            name = f"{item['name']} {shot['name']}"
            category_negative = item["negative_hints"] or ""
            negative_prompt = " ".join(x for x in (category_negative, legacy_negative) if x)
            db.execute(
                """INSERT INTO tasks(
                       id,project_id,item_id,model_id,code,name,type,tier,status,provider,prompt,
                       negative_prompt,cache_key,estimated_cost,cache_hit,shot_id,shot_name,priority,
                       created_at,updated_at
                   ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    tid, project_id, item["id"], model["id"] if model else None,
                    f"T{max_code:03d}", name, task_type, preset["tier"],
                    "cached" if existing_cache else "planned", provider.id, prompt,
                    negative_prompt, key, 0 if existing_cache else provider.estimate(preset["tier"], 1),
                    int(bool(existing_cache)), shot["id"], shot["name"], shot["priority"],
                    utc_now(), utc_now(),
                ),
            )
            (cached if existing_cache else planned).append(
                {"id": tid, "name": name, "shotId": shot["id"], "cacheHit": bool(existing_cache)}
            )

        for item in items:
            template = templates.get(item["category_id"])
            if not template:
                for shot in _legacy_shots(item, preset):
                    add(item, shot)
                continue

            attributes = json.loads(item["attributes_json"] or "{}")
            expanded = _expand_template_shots(template, attributes)
            expanded.extend({
                "id": row["shot_id"],
                "name": row["shot_name"],
                "type": row["type"],
                "required": bool(row["required"]),
                "priority": row["priority"],
                "promptHints": row["prompt_hints"],
                "references": ["garment"],
            } for row in db.execute(
                """SELECT * FROM project_shot_selections
                   WHERE project_id=? AND item_id=? AND is_custom=1""",
                (project_id, item["id"]),
            ).fetchall())

            if requested_shots is None:
                visible = [shot for shot in expanded if shot["priority"] in allowed_priorities]
            else:
                visible = [
                    shot for shot in expanded
                    if shot["id"] in requested_shots
                    and selection_rows.get((item["id"], shot["id"]), {}).get("status", "selected") == "selected"
                ]
            skipped += len(expanded) - len(visible)

            for shot in visible:
                if shot["type"] == "model":
                    continue
                add(item, shot)

            # 模特镜头仍按模板展开；多个已选模特身份按镜头轮换，避免破坏镜头清单。
            if item["id"] == (primary_item["id"] if primary_item else None):
                model_shots = [shot for shot in visible if shot["type"] == "model"]
                if model_shots:
                    for index, shot in enumerate(model_shots):
                        model = models[index % len(models)] if models else None
                        add(item, shot, model)

        # 模板缺失时的旧版模特兜底逻辑。
        if primary_item and primary_item["category_id"] not in templates:
            for model in models:
                for angle in preset["modelAngles"]:
                    add(primary_item, {
                        "id": f"legacy-model-{model['id']}-{angle}",
                        "name": angle,
                        "type": "model",
                        "required": True,
                        "priority": "P0",
                        "promptHints": "",
                        "references": ["garment", "model-identity", "style"],
                    }, model)

        db.execute(
            "INSERT INTO events(time,project_id,type,message) VALUES(?,?,?,?)",
            (
                utc_now(), project_id, "task.plan",
                f"任务规划完成：新增 {len(planned)+len(cached)}，缓存命中 {len(cached)}，按预设跳过 {skipped}",
            ),
        )
        db.commit()
        return {
            "planned": planned,
            "cached": cached,
            "skipped": skipped,
            "presetId": preset["id"],
            "provider": provider.id,
        }
    finally:
        db.close()
