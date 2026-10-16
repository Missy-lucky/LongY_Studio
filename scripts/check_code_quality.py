"""Static project-quality checks for naming, structure, and rule assets."""
from __future__ import annotations

import ast
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
ERRORS: list[str] = []
WARNINGS: list[str] = []

SNAKE_CASE = re.compile(r"^[a-z][a-z0-9]*(?:_[a-z0-9]+)*\.py$")
KEBAB_CASE = re.compile(r"^[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.ts$")
DTS_CASE = re.compile(r"^[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.d\.ts$")
TEST_CASE = re.compile(r"^[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.test\.ts$")
HOOK_CASE = re.compile(r"^use[A-Z][A-Za-z0-9]*\.ts$")
PASCAL_CASE = re.compile(r"^[A-Z][A-Za-z0-9]*\.tsx$")
SECRET = re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b")
PERSONAL_PATH = re.compile(r"[A-Z]:\\Users\\20574")
TASK_TYPES = {"flat", "partial", "detail", "model"}
PRIORITIES = {"P0", "P1", "P2"}


def error(message: str) -> None:
    ERRORS.append(message)


def warn(message: str) -> None:
    WARNINGS.append(message)


def check_python() -> None:
    for path in (ROOT / "backend" / "app").rglob("*.py"):
        relative = path.relative_to(ROOT)
        if path.name != "__init__.py" and not SNAKE_CASE.fullmatch(path.name):
            error(f"Python filename must be snake_case: {relative}")
        try:
            ast.parse(path.read_text(encoding="utf-8-sig"), filename=str(path))
        except SyntaxError as exc:
            error(f"Python syntax error in {relative}: {exc}")
        line_count = len(path.read_text(encoding="utf-8-sig").splitlines())
        if line_count > 500:
            warn(f"Large Python file ({line_count} lines): {relative}")


def check_project_root() -> None:
    allowed_directories = {
        ".pytest_cache", "__pycache__", "asset-library", "backend", "database", "desktop", "docs",
        "frontend", "scripts", "shared", "storage", "temp", "tests", "tools",
    }
    allowed_files = {
        ".git", ".gitignore", ".gitattributes", "README.md", "pytest.ini",
        "main.py", "pyproject.toml", "Start-LongY-Studio.cmd",
        "Start-LongY-Studio-Desktop.cmd",
    }
    for path in ROOT.iterdir():
        if path.name in allowed_directories or path.name in allowed_files:
            continue
        error(f"Unexpected root entry; put it in an existing layer: {path.name}")


def check_frontend() -> None:
    source = ROOT / "frontend" / "src"
    for path in source.rglob("*.ts"):
        relative = path.relative_to(ROOT)
        line_count = len(path.read_text(encoding="utf-8-sig").splitlines())
        if line_count > 500:
            warn(f"Large TypeScript file ({line_count} lines): {relative}")
        if path.parent.name == "hooks":
            if not HOOK_CASE.fullmatch(path.name):
                error(f"Hook filename must be useXxx.ts: {relative}")
        elif TEST_CASE.fullmatch(path.name):
            pass
        elif not KEBAB_CASE.fullmatch(path.name) and not DTS_CASE.fullmatch(path.name):
            error(f"Non-component TypeScript filename must be kebab-case: {relative}")
    for path in source.rglob("*.tsx"):
        relative = path.relative_to(ROOT)
        if path.parent.name == "components" or path.parent.parent.name == "components":
            if not PASCAL_CASE.fullmatch(path.name):
                error(f"React component filename must be PascalCase: {relative}")
        elif path.name == "main.tsx":
            pass
        elif not PASCAL_CASE.fullmatch(path.name):
            error(f"React file outside component convention needs review: {relative}")
        line_count = len(path.read_text(encoding="utf-8-sig").splitlines())
        if line_count > 500:
            warn(f"Large React file ({line_count} lines): {relative}")


def check_source_text() -> None:
    paths = [
        *(ROOT / "backend").rglob("*.py"),
        *(ROOT / "frontend" / "src").rglob("*.ts"),
        *(ROOT / "frontend" / "src").rglob("*.tsx"),
        *(ROOT / "desktop").rglob("*.cjs"),
    ]
    for path in paths:
        text = path.read_text(encoding="utf-8-sig", errors="replace")
        relative = path.relative_to(ROOT)
        if SECRET.search(text):
            error(f"Possible API key in source: {relative}")
        if PERSONAL_PATH.search(text):
            error(f"Personal absolute path in source: {relative}")


def read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError) as exc:
        error(f"Invalid JSON {path.relative_to(ROOT)}: {exc}")
        return None


def validate_shot(shot: dict[str, Any], category: str, seen_ids: set[str], references: set[str]) -> None:
    shot_id = shot.get("id")
    if not isinstance(shot_id, str) or not shot_id:
        error(f"{category}: shot id is required")
        return
    if shot_id in seen_ids:
        error(f"{category}: duplicate shot id {shot_id}")
    seen_ids.add(shot_id)
    if shot.get("type") not in TASK_TYPES:
        error(f"{category}:{shot_id}: invalid shot type {shot.get('type')}")
    if shot.get("priority") not in PRIORITIES:
        error(f"{category}:{shot_id}: invalid priority {shot.get('priority')}")
    if not isinstance(shot.get("promptHints"), str) or not shot.get("promptHints"):
        error(f"{category}:{shot_id}: promptHints is required")
    for reference in shot.get("references", []):
        if reference not in references:
            error(f"{category}:{shot_id}: unknown reference role {reference}")


def validate_assets() -> None:
    category_dir = ROOT / "asset-library" / "categories"
    shot_dir = ROOT / "asset-library" / "shot-templates"
    category_files = sorted(path for path in category_dir.glob("*.json") if path.name not in {"all.json", "manifest.json"})
    categories: dict[str, dict[str, Any]] = {}
    for path in category_files:
        data = read_json(path)
        if not isinstance(data, dict):
            continue
        category_id = data.get("id") or path.stem
        if path.stem != category_id:
            error(f"Category filename/id mismatch: {path.name} vs {category_id}")
        categories[category_id] = data

    all_data = read_json(category_dir / "all.json")
    if isinstance(all_data, list):
        all_ids = [item.get("id") for item in all_data if isinstance(item, dict)]
        if set(all_ids) != set(categories):
            error(f"categories/all.json mismatch; files={sorted(set(categories))}, all={sorted(set(all_ids))}")
        if len(all_ids) != len(set(all_ids)):
            error("categories/all.json contains duplicate ids")

    shot_files = sorted(shot_dir.glob("*.json"))
    shot_categories: set[str] = set()
    for path in shot_files:
        data = read_json(path)
        if not isinstance(data, dict):
            continue
        category = data.get("category")
        if path.stem != category:
            error(f"Shot template filename/category mismatch: {path.name} vs {category}")
        if category not in categories:
            error(f"Shot template references unknown category: {category}")
        shot_categories.add(category)
        if data.get("schema") != "longy.shot-template.v1":
            error(f"{category}: unsupported shot schema {data.get('schema')}")
        if data.get("categoryName") != categories.get(category, {}).get("name"):
            error(f"{category}: categoryName does not match category library")

        attributes = data.get("attributes", [])
        attribute_keys = {item.get("key") for item in attributes if isinstance(item, dict)}
        if len(attribute_keys) != len(attributes):
            error(f"{category}: duplicate or missing attribute keys")
        defaults = data.get("defaults", {})
        references = set(defaults.get("referenceRoles", {}))
        seen_ids: set[str] = set()
        for task_type, shots in data.get("shots", {}).items():
            if task_type not in TASK_TYPES:
                error(f"{category}: invalid shot group {task_type}")
            for shot in shots:
                validate_shot(shot, category, seen_ids, references)
        for conditional in data.get("conditionalShots", []):
            condition = conditional.get("when", {})
            if condition.get("attribute") not in attribute_keys:
                error(f"{category}: conditional attribute {condition.get('attribute')} is not declared")
            for shot in conditional.get("add", []):
                validate_shot(shot, category, seen_ids, references)

    if shot_categories != set(categories):
        error(
            "Shot templates do not cover categories exactly; "
            f"missing={sorted(set(categories) - shot_categories)}, extra={sorted(shot_categories - set(categories))}"
        )

    prompt_file = ROOT / "asset-library" / "prompt-templates" / "legacy-v2.json"
    prompt = read_json(prompt_file)
    if isinstance(prompt, dict):
        for key in ("flatBase", "flatRetouch", "modelBase", "negativePrompt", "qualityGates"):
            if key not in prompt:
                error(f"Prompt template legacy-v2.json missing {key}")

    calibration_file = ROOT / "asset-library" / "prompt-templates" / "example-calibration-v1.json"
    calibration = read_json(calibration_file)
    registry = read_json(ROOT / "asset-library" / "qc-rules" / "reference-workbook.json")
    if isinstance(calibration, dict):
        if calibration.get("schema") != "longy.prompt-calibration.v1":
            error("Prompt calibration schema must be longy.prompt-calibration.v1")
        safeguards = calibration.get("safeguards", {})
        if set(safeguards) != {"flat", "detail", "partial", "model"}:
            error("Prompt calibration safeguards must cover flat/detail/partial/model exactly")
        elif any(not isinstance(rules, list) or not rules for rules in safeguards.values()):
            error("Every prompt calibration task type must contain safeguards")
        if isinstance(registry, dict):
            counts = registry.get("summary", {}).get("byClassification", {})
            expected = {
                "approvedReference": counts.get("approved_reference"),
                "rejectedOutput": counts.get("rejected_output"),
                "defectEvidence": counts.get("defect_evidence"),
                "sourceContext": counts.get("source_context"),
                "unfinishedSource": counts.get("unfinished_source"),
            }
            if calibration.get("evidenceSummary") != expected:
                error("Prompt calibration evidenceSummary does not match reference workbook registry")

    model_root = ROOT / "asset-library" / "model-library"
    enabled_models: set[str] = set()
    for model_file in sorted(model_root.glob("*.json")):
        if model_file.name == "model-styles.json":
            continue
        model = read_json(model_file)
        if not isinstance(model, dict) or not model.get("enabled"):
            continue
        model_id = model.get("id")
        reference_path = model.get("referencePath")
        if not isinstance(model_id, str) or not model_id:
            error(f"Enabled model is missing id: {model_file.name}")
            continue
        enabled_models.add(model_id)
        reference = ROOT / reference_path if isinstance(reference_path, str) else None
        if reference is None or not reference.is_file():
            error(f"Enabled model reference does not exist: {model_id} -> {reference_path}")
            continue
        if not reference.with_name("model-card.jpg").is_file():
            error(f"Enabled model preview card does not exist: {model_id}")
    model_styles = read_json(model_root / "model-styles.json")
    if isinstance(model_styles, list):
        if any(
            not isinstance(item, dict) or not isinstance(item.get("modelId"), str)
            for item in model_styles
        ):
            error("Every model style must contain a string modelId")
        style_model_ids = {
            item["modelId"]
            for item in model_styles
            if isinstance(item, dict) and isinstance(item.get("modelId"), str)
        }
        if style_model_ids != enabled_models:
            error(
                "Model styles must cover enabled models exactly; "
                f"missing={sorted(enabled_models - style_model_ids)}, "
                f"extra={sorted(style_model_ids - enabled_models)}"
            )

    fallback_manifest = read_json(
        ROOT / "asset-library" / "default-garments" / "manifest.json"
    )
    if isinstance(fallback_manifest, dict):
        if fallback_manifest.get("schema") != "longy.default-garments.v1":
            error("Default garment manifest schema must be longy.default-garments.v1")
        fallback_items = fallback_manifest.get("items", [])
        roles = {
            item.get("role") for item in fallback_items if isinstance(item, dict)
        }
        if roles != {"upper-base", "lower-base"} or len(fallback_items) != 2:
            error("Default garment manifest must contain one upper-base and one lower-base")
        for item in fallback_items:
            if not isinstance(item, dict):
                error("Default garment manifest items must be objects")
                continue
            relative_path = item.get("path")
            path = ROOT / relative_path if isinstance(relative_path, str) else None
            if path is None or not path.is_file():
                error(f"Default garment file does not exist: {relative_path}")
                continue
            actual_hash = hashlib.sha256(path.read_bytes()).hexdigest()
            if item.get("sha256") != actual_hash:
                error(f"Default garment SHA-256 mismatch: {relative_path}")


def check_tracked_runtime_files() -> None:
    result = subprocess.run(
        ["git", "ls-files"], cwd=ROOT, text=True, encoding="utf-8", errors="replace",
        capture_output=True, check=False,
    )
    if result.returncode != 0:
        warn("Git tracked-file checks skipped because this workspace is not a Git repository")
        return
    tracked = [Path(line) for line in result.stdout.splitlines()]
    for path in tracked:
        normalized = path.as_posix()
        if normalized.startswith(("storage/projects/", "storage/exports/", "storage/cache/", "storage/logs/")):
            error(f"Runtime user data is tracked by Git: {normalized}")
        if normalized.startswith(("temp/", "frontend/node_modules/", "backend/.venv/")):
            error(f"Generated dependency path is tracked by Git: {normalized}")


def main() -> int:
    check_project_root()
    check_python()
    check_frontend()
    check_source_text()
    validate_assets()
    check_tracked_runtime_files()

    for message in WARNINGS:
        print(f"WARNING: {message}")
    for message in ERRORS:
        print(f"ERROR: {message}")
    print(f"Checked project structure: {len(ERRORS)} errors, {len(WARNINGS)} warnings")
    return 1 if ERRORS else 0


if __name__ == "__main__":
    sys.exit(main())
