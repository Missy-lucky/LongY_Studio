"""按品类套图模板拆解任务：确定性规则，不消耗大模型 token。"""
import hashlib
import json
import uuid

from ..config import PROJECT_ROOT
from ..database import get_db, utc_now
from ..providers import resolve_provider
from ..services.library_loader import SHOT_GROUPS, load_shot_templates
from ..services.garment_structure import render_structure_facts
from ..services.outfit_fallbacks import resolve_outfit_fallbacks
from ..services.prompt_builder import _templates, build_prompt, calibrated_negative_prompt

PRESET_ROOT = PROJECT_ROOT / "asset-library" / "generation-presets"
SHOT_TYPE_NAMES = {
    "flat": "平面图",
    "detail": "细节图",
    "partial": "模特上身商品特写",
    "model": "模特上身搭配展示",
}

def _outfit_context(items) -> str:
    """Build a deterministic outfit manifest and conservative missing-layer policy."""
    lines = [
        f"- {item['name']}（{item['category_name']}，{'售卖商品' if item['is_sellable'] else '搭配素材'}）"
        for item in items
    ]
    fallbacks = resolve_outfit_fallbacks(item["category_id"] for item in items)
    lines.extend(fallback.prompt_line for fallback in fallbacks)
    return "\n".join(lines)


def _reference_context(references, task_type: str) -> str:
    role_rules = {
        "pose": "只参考人体动作和构图，不复制人物身份、服装或背景",
        "style": "只参考光线、背景和商业构图，不复制人物与商品",
        "detail": "只作为商品局部结构证据，不改变权威商品图的颜色和版型",
    }
    applicable_roles = {
        "flat": {"style"},
        "detail": {"style", "detail"},
        "partial": {"pose", "style", "detail"},
        "model": {"pose", "style"},
    }[task_type]
    return "\n".join(
        f"- {row['role']}: {row['name']}；{role_rules[row['role']]}"
        for row in references
        if row["role"] in applicable_roles
    )


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
    input_fingerprint: str,
) -> str:
    raw = "\n".join((
        item_id, task_type, shot_id, priority, tier, prompt, provider, input_fingerprint,
    ))
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
    evidence_negative = calibrated_negative_prompt()
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
            """SELECT i.*, c.name category_name,c.group_name category_group,
                      c.required_views,c.default_detail_tasks,
                      c.default_partial_tasks,c.model_prompt_hints,c.negative_hints
               FROM items i JOIN categories c ON c.id=i.category_id
               WHERE i.project_id=? ORDER BY i.created_at,i.id""",
            (project_id,),
        ).fetchall()
        models = db.execute(
            """SELECT * FROM models
               WHERE enabled=1 AND (project_id IS NULL OR project_id=?) ORDER BY id""",
            (project_id,),
        ).fetchall()
        if model_ids is not None:
            selected = set(model_ids)
            models = [model for model in models if model["id"] in selected]
        else:
            selected_model = db.execute(
                "SELECT selected_model_id FROM projects WHERE id=?", (project_id,)
            ).fetchone()
            if selected_model and selected_model["selected_model_id"]:
                models = [
                    model for model in models
                    if model["id"] == selected_model["selected_model_id"]
                ]

        project_references = db.execute(
            """SELECT id,role,name,hash FROM project_references
               WHERE project_id=? ORDER BY role,created_at,id""",
            (project_id,),
        ).fetchall()
        project_asset_hashes = [
            row["hash"] for row in db.execute(
                "SELECT hash FROM assets WHERE project_id=? ORDER BY item_id,created_at,id",
                (project_id,),
            ).fetchall()
        ]

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

        outfit_fallbacks = resolve_outfit_fallbacks(item["category_id"] for item in items)
        outfit_context = _outfit_context(items)
        def add(item, shot: dict, model=None):
            nonlocal max_code
            max_code += 1
            task_type = shot["type"]
            selection = selection_rows.get((item["id"], shot["id"]), {})
            custom_prompt = (
                selection.get("custom_prompt", "")
                if selection.get("prompt_mode") == "custom" else ""
            )
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
                outfit_context,
                _reference_context(project_references, task_type),
                item["category_group"],
                render_structure_facts(json.loads(item["structure_json"] or "{}")),
                custom_prompt,
            )
            fingerprint_parts = [*project_asset_hashes]
            fingerprint_parts.extend(
                f"{row['role']}:{row['id']}:{row['hash']}" for row in project_references
            )
            if model:
                fingerprint_parts.append(
                    f"model:{model['id']}:{model['version']}:{model['reference_hash'] or ''}"
                )
            if task_type in {"partial", "model"}:
                fingerprint_parts.extend(
                    f"fallback:{fallback.id}:{fallback.sha256}"
                    for fallback in outfit_fallbacks
                )
            input_fingerprint = hashlib.sha256(
                "\n".join(fingerprint_parts).encode("utf-8")
            ).hexdigest()
            key = _cache_key(
                item["id"], task_type, shot["id"], shot["priority"],
                preset["tier"], prompt, provider.id, input_fingerprint,
            )
            existing_cache = db.execute(
                "SELECT file_path FROM cache_entries WHERE cache_key=?", (key,)
            ).fetchone()
            tid = uuid.uuid4().hex[:12]
            name = f"{item['name']} {shot['name']}"
            category_negative = item["negative_hints"] or ""
            structure_negative = (
                "不得改变已记录的版型、领型、袖型、扣件、口袋、腰头、下摆、图案、标识或其他结构事实。"
                if item["structure_json"] not in (None, "", "{}") else ""
            )
            negative_prompt = " ".join(
                x for x in (
                    category_negative, structure_negative, legacy_negative, evidence_negative,
                ) if x
            )
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

            partial_index = 0
            for shot in visible:
                if shot["type"] == "model":
                    continue
                model = None
                if shot["type"] == "partial" and models:
                    model = models[partial_index % len(models)]
                    partial_index += 1
                add(item, shot, model)

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
