"""Static project-quality checks for naming, structure, and rule assets."""
from __future__ import annotations

import ast
import json
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
ERRORS: list[str] = []
WARNINGS: list[str] = []

SNAKE_CASE = re.compile(r"^[a-z][a-z0-9]*(?:_[a-z0-9]+)*\.py$")
KEBAB_CASE = re.compile(r"^[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.ts$")
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
        "__pycache__", "asset-library", "backend", "database", "desktop", "docs",
        "frontend", "Model", "scripts", "shared", "storage", "temp", "tests", "tools",
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
        elif not KEBAB_CASE.fullmatch(path.name):
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


def check_tracked_runtime_files() -> None:
    tracked = [Path(line) for line in __import__("subprocess").check_output(
        ["git", "ls-files"], cwd=ROOT, text=True, encoding="utf-8", errors="replace"
    ).splitlines()]
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
