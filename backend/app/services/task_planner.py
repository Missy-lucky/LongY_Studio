"""按品类规则拆解任务：确定性规则，不消耗大模型 token。"""
import hashlib
import json
import uuid
from pathlib import Path
from ..config import PROJECT_ROOT
from ..database import get_db, utc_now
from ..providers import resolve_provider
from .prompt_builder import _templates, build_prompt

PRESET_ROOT = PROJECT_ROOT / "asset-library" / "generation-presets"


def _load_preset(preset_id: str) -> dict:
    path = PRESET_ROOT / f"{preset_id}.json"
    if not path.exists():
        path = PRESET_ROOT / "draft-first.json"
    return json.loads(path.read_text(encoding="utf-8"))


def _cache_key(item_id: str, task_type: str, focus: str, tier: str, prompt: str, provider: str) -> str:
    raw = "\n".join((item_id, task_type, focus, tier, prompt, provider))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def plan_tasks(project_id: str, preset_id: str = "draft-first", provider_id: str = "mock", replace_existing: bool = False, model_ids: list[str] | None = None) -> dict:
    preset = _load_preset(preset_id)
    provider = resolve_provider(provider_id)
    legacy_negative = _templates()["negativePrompt"]
    db = get_db()
    planned, cached, skipped = [], [], 0
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

        def add(item, task_type, focus, model=None):
            nonlocal max_code
            max_code += 1
            prompt = build_prompt(
                task_type, item["name"], item["category_name"], focus,
                item["color_material"], item["selling_points"],
                model["name"] if model else None, item["model_prompt_hints"],
            )
            key = _cache_key(item["id"], task_type, focus, preset["tier"], prompt, provider.id)
            existing_cache = db.execute(
                "SELECT file_path FROM cache_entries WHERE cache_key=?", (key,)
            ).fetchone()
            tid = uuid.uuid4().hex[:12]
            type_name = {
                "flat": "平面图", "detail": "细节图", "partial": "局部图", "model": "模特图"
            }[task_type]
            name = f"{item['name']} {focus} {type_name}"
            category_negative = item["negative_hints"] or ""
            negative_prompt = " ".join(x for x in (category_negative, legacy_negative) if x)
            db.execute(
                """INSERT INTO tasks(id,project_id,item_id,model_id,code,name,type,tier,status,provider,prompt,
                   negative_prompt,cache_key,estimated_cost,cache_hit,created_at,updated_at)
                   VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (tid, project_id, item["id"], model["id"] if model else None,
                 f"T{max_code:03d}", name, task_type, preset["tier"],
                 "cached" if existing_cache else "planned", provider.id, prompt,
                 negative_prompt, key, 0 if existing_cache else provider.estimate(preset["tier"], 1),
                 int(bool(existing_cache)), utc_now(), utc_now()),
            )
            (cached if existing_cache else planned).append(
                {"id": tid, "name": name, "cacheHit": bool(existing_cache)}
            )

        for item in items:
            views = json.loads(item["required_views"])
            if preset.get("flat") == "firstTwoViews":
                views = views[:2]
            for view in views:
                add(item, "flat", view)
            for focus in json.loads(item["default_detail_tasks"])[: int(preset["detailPerItem"])]:
                add(item, "detail", focus)
            for focus in json.loads(item["default_partial_tasks"])[: int(preset["partialPerItem"])]:
                add(item, "partial", focus)

        # 模特图是整套搭配的任务；用首个可售单品代表 project 级组合。
        primary_item = next((item for item in items if item["is_sellable"]), items[0] if items else None)
        if primary_item:
            for model in models:
                for angle in preset["modelAngles"]:
                    add(primary_item, "model", angle, model)

        db.execute(
            "INSERT INTO events(time,project_id,type,message) VALUES(?,?,?,?)",
            (utc_now(), project_id, "task.plan",
             f"任务规划完成：新增 {len(planned)+len(cached)}，缓存命中 {len(cached)}，跳过 {skipped}"),
        )
        db.commit()
        return {
            "planned": planned, "cached": cached, "skipped": skipped,
            "presetId": preset["id"], "provider": provider.id,
        }
    finally:
        db.close()


