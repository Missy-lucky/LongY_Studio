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
        selections = {
            (row["item_id"], row["shot_id"]): dict(row)
            for row in db.execute(
                "SELECT * FROM project_shot_selections WHERE project_id=?",
                (project_id,),
            ).fetchall()
        }
        custom_required = [
            row for row in selections.values()
            if row["is_custom"] and row["required"] and row["priority"] == "P0"
        ]
        already_covered_ids = set()
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
                selection = selections.get((item["id"], shot["id"]))
                accepted = shot["id"] in ready_shot_ids
                if selection and selection["status"] in ("fulfilled", "waived"):
                    ready = True
                    source = selection["source"]
                    reason = selection["reason"]
                else:
                    ready = accepted
                    source = "ai" if accepted else (
                        "ai" if not selection or selection["status"] == "selected" else "missing"
                    )
                    reason = selection["reason"] if selection else ""
                already_covered_ids.add((item["id"], shot["id"]))
                coverage.append({
                    "itemId": item["id"],
                    "itemName": item["name"],
                    "shotId": shot["id"],
                    "shotName": shot["name"],
                    "type": shot["type"],
                    "ready": ready,
                    "source": source,
                    "reason": reason,
                })

        for selection in custom_required:
            key = (selection["item_id"], selection["shot_id"])
            if key in already_covered_ids:
                continue
            item_names = {item["id"]: item["name"] for item in items}
            accepted = db.execute(
                """SELECT 1 FROM tasks
                   WHERE project_id=? AND item_id=? AND shot_id=?
                     AND status IN (?,?,?) LIMIT 1""",
                (project_id, selection["item_id"], selection["shot_id"], *READY_STATUSES),
            ).fetchone() is not None
            ready = accepted or selection["status"] in ("fulfilled", "waived")
            coverage.append({
                "itemId": selection["item_id"],
                "itemName": item_names.get(selection["item_id"], ""),
                "shotId": selection["shot_id"],
                "shotName": selection["shot_name"],
                "type": selection["type"],
                "ready": ready,
                "source": selection["source"] if ready else "ai",
                "reason": selection["reason"],
            })
        missing = [entry["shotName"] for entry in coverage if not entry["ready"]]
        return {
            "complete": not missing,
            "coverage": coverage,
            "missingShotNames": missing,
        }
    finally:
        db.close()
