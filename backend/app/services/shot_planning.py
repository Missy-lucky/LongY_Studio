"""Build an editable shot plan before any image generation cost is committed."""
from __future__ import annotations

import json

from ..database import get_db
from ..providers import resolve_provider
from ..services.library_loader import SHOT_GROUPS, load_shot_templates
from ..services.outfit_fallbacks import resolve_outfit_fallbacks
from .task_planner import _expand_template_shots, _load_preset

SELECTION_STATUSES = {"selected", "fulfilled", "waived"}


def _shot_view(shot: dict, selection: dict | None, estimated_cost: float) -> dict:
    status = selection["status"] if selection else (
        "selected" if shot.get("priority") == "P0" else "proposed"
    )
    return {
        "shotId": shot["id"],
        "shotName": shot["name"],
        "type": shot["type"],
        "priority": shot["priority"],
        "required": bool(shot.get("required", shot.get("priority") == "P0")),
        "isCustom": bool(shot.get("isCustom", False)),
        "promptHints": shot.get("promptHints", ""),
        "promptMode": selection["prompt_mode"] if selection else "default",
        "customPrompt": selection["custom_prompt"] if selection else "",
        "status": status,
        "source": selection["source"] if selection else "ai",
        "assetId": selection["asset_id"] if selection else None,
        "reason": selection["reason"] if selection else "",
        "estimatedCost": estimated_cost if status == "selected" else 0,
    }


def build_shot_plan_preview(
    project_id: str,
    preset_id: str = "draft-first",
    provider_id: str = "mock",
    model_ids: list[str] | None = None,
) -> dict:
    """Return every useful shot, but select only P0 by default."""
    preset = _load_preset(preset_id)
    provider = resolve_provider(provider_id)
    unit_cost = provider.estimate(preset["tier"], 1)
    templates = load_shot_templates()
    db = get_db()
    try:
        items = db.execute(
            """SELECT i.*,c.name category_name,c.required_views,
                      c.default_detail_tasks,c.default_partial_tasks
               FROM items i JOIN categories c ON c.id=i.category_id
               WHERE i.project_id=? ORDER BY i.created_at,i.id""",
            (project_id,),
        ).fetchall()
        selections = {
            (row["item_id"], row["shot_id"]): dict(row)
            for row in db.execute(
                "SELECT * FROM project_shot_selections WHERE project_id=?",
                (project_id,),
            ).fetchall()
        }
        models = db.execute(
            """SELECT id FROM models
               WHERE enabled=1 AND (project_id IS NULL OR project_id=?) ORDER BY id""",
            (project_id,),
        ).fetchall()
        if model_ids is not None:
            selected_models = set(model_ids)
            models = [row for row in models if row["id"] in selected_models]
        else:
            selected_model = db.execute(
                "SELECT selected_model_id FROM projects WHERE id=?", (project_id,)
            ).fetchone()
            if selected_model and selected_model["selected_model_id"]:
                models = [
                    model for model in models
                    if model["id"] == selected_model["selected_model_id"]
                ]
        model_count = max(1, len(models))
        outfit_fallbacks = resolve_outfit_fallbacks(
            item["category_id"] for item in items
        )

        out_items = []
        for item in items:
            attributes = json.loads(item["attributes_json"] or "{}")
            template = templates.get(item["category_id"])
            shots = _expand_template_shots(template, attributes) if template else []
            custom_shots = [
                {
                    "id": row["shot_id"],
                    "name": row["shot_name"],
                    "type": row["type"],
                    "priority": row["priority"],
                    "required": bool(row["required"]),
                    "promptHints": row["prompt_hints"],
                    "references": ["garment"],
                    "isCustom": True,
                }
                for row in db.execute(
                    """SELECT * FROM project_shot_selections
                       WHERE project_id=? AND item_id=? AND is_custom=1""",
                    (project_id, item["id"]),
                ).fetchall()
            ]
            all_shots = shots + custom_shots
            shot_views = [
                _shot_view(
                    shot,
                    selections.get((item["id"], shot["id"])),
                    unit_cost * (model_count if shot["type"] == "model" else 1),
                )
                for shot in all_shots
            ]
            assets = [
                {"id": row["id"], "viewSlot": row["view_slot"], "filePath": row["file_path"]}
                for row in db.execute(
                    """SELECT id,view_slot,file_path FROM assets
                       WHERE item_id=? ORDER BY created_at,id""",
                    (item["id"],),
                ).fetchall()
            ]
            selected_count = sum(shot["status"] == "selected" for shot in shot_views)
            out_items.append({
                "itemId": item["id"],
                "itemName": item["name"],
                "categoryId": item["category_id"],
                "categoryName": item["category_name"],
                "assets": assets,
                "shots": shot_views,
                "selectedCount": selected_count,
                "estimatedCost": sum(shot["estimatedCost"] for shot in shot_views),
            })

        return {
            "presetId": preset["id"],
            "tier": preset["tier"],
            "provider": provider.id,
            "outfitFallbacks": [
                {
                    "id": fallback.id,
                    "role": fallback.role,
                    "name": fallback.name,
                    "reason": fallback.reason,
                    "previewUrl": f"/api/library/default-garments/{fallback.id}/file",
                }
                for fallback in outfit_fallbacks
            ],
            "items": out_items,
            "selectedCount": sum(item["selectedCount"] for item in out_items),
            "estimatedCost": sum(item["estimatedCost"] for item in out_items),
        }
    finally:
        db.close()
