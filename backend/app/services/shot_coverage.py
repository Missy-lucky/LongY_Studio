"""Export coverage checks driven by category shot templates."""
from __future__ import annotations

import json

from ..database import get_db
from ..services.library_loader import SHOT_GROUPS, load_shot_templates

READY_STATUSES = ("accepted", "locked", "exported")


def _active_required_shots(template: dict, attributes: dict[str, bool]) -> list[dict]:
    shots: list[dict] = []
    for group in SHOT_GROUPS:
        shots.extend(template["shots"][group])
    for rule in template["conditionalShots"]:
        condition = rule["when"]
        if attributes.get(condition["attribute"]) == condition["equals"]:
            shots.extend(rule["add"])
    return [
        shot for shot in shots
        if shot.get("required") is True and shot.get("priority") == "P0"
    ]


def project_shot_coverage(project_id: str) -> dict:
    """Return required-shot readiness without mutating SQLite."""
    db = get_db()
    try:
        items = db.execute(
            """SELECT i.id,i.name,i.category_id,i.attributes_json,i.is_sellable
               FROM items i
               WHERE i.project_id=?
               ORDER BY i.created_at,i.id""",
            (project_id,),
        ).fetchall()
        templates = load_shot_templates()
        primary_item = next(
            (item for item in items if item["is_sellable"]),
            items[0] if items else None,
        )
        coverage: list[dict] = []
        for item in items:
            template = templates.get(item["category_id"])
            if not template:
                continue
            attributes = json.loads(item["attributes_json"] or "{}")
            ready_shot_ids = {
                row["shot_id"]
                for row in db.execute(
                    """SELECT shot_id FROM tasks
                       WHERE project_id=? AND item_id=? AND shot_id IS NOT NULL
                         AND status IN (?,?,?)""",
                    (project_id, item["id"], *READY_STATUSES),
                )
            }
            is_primary = item["id"] == (primary_item["id"] if primary_item else None)
            for shot in _active_required_shots(template, attributes):
                if shot["type"] == "model" and not is_primary:
                    continue
                ready = shot["id"] in ready_shot_ids
                coverage.append({
                    "itemId": item["id"],
                    "itemName": item["name"],
                    "shotId": shot["id"],
                    "shotName": shot["name"],
                    "type": shot["type"],
                    "ready": ready,
                })
        missing = [entry["shotName"] for entry in coverage if not entry["ready"]]
        return {
            "complete": not missing,
            "coverage": coverage,
            "missingShotNames": missing,
        }
    finally:
        db.close()
