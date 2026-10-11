"""把 asset-library/ 中的 JSON 规则导入 SQLite。JSON 是源头，数据库是运行索引。"""
import json
from functools import lru_cache
from pathlib import Path

from ..database import get_db, utc_now
from ..config import PROJECT_ROOT

LIBRARY_ROOT = PROJECT_ROOT / "asset-library"
SHOT_TEMPLATE_ROOT = LIBRARY_ROOT / "shot-templates"
SHOT_GROUPS = ("flat", "partial", "detail", "model")
REFERENCE_ROLES = {"garment", "model-identity", "style"}
SHOT_PRIORITIES = {"P0", "P1", "P2"}


def _read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _require_fields(data: dict, fields: tuple[str, ...], context: str) -> None:
    missing = [field for field in fields if field not in data]
    if missing:
        raise ValueError(f"{context} 缺少字段：{', '.join(missing)}")


def _validate_attribute(attribute: dict, context: str) -> None:
    _require_fields(attribute, ("key", "label", "type", "default"), context)
    if attribute["type"] != "boolean":
        raise ValueError(f"{context}.type 必须是 boolean")
    if not isinstance(attribute["key"], str) or not attribute["key"]:
        raise ValueError(f"{context}.key 必须是非空字符串")
    if not isinstance(attribute["default"], bool):
        raise ValueError(f"{context}.default 必须是布尔值")


def _validate_shot(shot: dict, group: str, context: str) -> None:
    _require_fields(
        shot,
        ("id", "name", "type", "required", "priority", "promptHints", "references"),
        context,
    )
    if shot["type"] != group:
        raise ValueError(f"{context}.type 必须等于镜头分组 {group}")
    if not isinstance(shot["id"], str) or not shot["id"]:
        raise ValueError(f"{context}.id 必须是非空字符串")
    if not isinstance(shot["name"], str) or not shot["name"]:
        raise ValueError(f"{context}.name 必须是非空字符串")
    if not isinstance(shot["required"], bool):
        raise ValueError(f"{context}.required 必须是布尔值")
    if shot["priority"] not in SHOT_PRIORITIES:
        raise ValueError(f"{context}.priority 必须是 P0/P1/P2")
    if not isinstance(shot["promptHints"], str):
        raise ValueError(f"{context}.promptHints 必须是字符串")
    references = shot["references"]
    if not isinstance(references, list) or not references:
        raise ValueError(f"{context}.references 必须是非空数组")
    invalid_references = set(references) - REFERENCE_ROLES
    if invalid_references:
        raise ValueError(f"{context}.references 含未知角色：{', '.join(sorted(invalid_references))}")


def validate_shot_template(data: dict, source: str) -> None:
    """启动前校验套图模板，避免任务规划期才发现资产损坏。"""
    _require_fields(
        data,
        (
            "schema", "id", "category", "categoryName", "version", "attributes",
            "shots", "conditionalShots", "defaults",
        ),
        source,
    )
    if data["schema"] != "longy.shot-template.v1":
        raise ValueError(f"{source}.schema 必须是 longy.shot-template.v1")
    if not isinstance(data["category"], str) or not data["category"]:
        raise ValueError(f"{source}.category 必须是非空字符串")

    attributes = data["attributes"]
    if not isinstance(attributes, list):
        raise ValueError(f"{source}.attributes 必须是数组")
    attribute_keys: set[str] = set()
    for index, attribute in enumerate(attributes):
        _validate_attribute(attribute, f"{source}.attributes[{index}]")
        attribute_keys.add(attribute["key"])
    if len(attribute_keys) != len(attributes):
        raise ValueError(f"{source}.attributes.key 存在重复")

    shots = data["shots"]
    if not isinstance(shots, dict):
        raise ValueError(f"{source}.shots 必须是对象")
    missing_groups = set(SHOT_GROUPS) - set(shots)
    if missing_groups:
        raise ValueError(f"{source}.shots 缺少分组：{', '.join(sorted(missing_groups))}")
    shot_ids: set[str] = set()
    for group in SHOT_GROUPS:
        if not isinstance(shots[group], list):
            raise ValueError(f"{source}.shots.{group} 必须是数组")
        for index, shot in enumerate(shots[group]):
            _validate_shot(shot, group, f"{source}.shots.{group}[{index}]")
            if shot["id"] in shot_ids:
                raise ValueError(f"{source} 镜头 ID 重复：{shot['id']}")
            shot_ids.add(shot["id"])

    conditional_shots = data["conditionalShots"]
    if not isinstance(conditional_shots, list):
        raise ValueError(f"{source}.conditionalShots 必须是数组")
    for rule_index, rule in enumerate(conditional_shots):
        rule_context = f"{source}.conditionalShots[{rule_index}]"
        _require_fields(rule, ("when", "add"), rule_context)
        condition = rule["when"]
        _require_fields(condition, ("attribute", "equals"), f"{rule_context}.when")
        if condition["attribute"] not in attribute_keys:
            raise ValueError(
                f"{rule_context}.when.attribute 未在 attributes 中声明：{condition['attribute']}"
            )
        if not isinstance(condition["equals"], bool):
            raise ValueError(f"{rule_context}.when.equals 必须是布尔值")
        if not isinstance(rule["add"], list) or not rule["add"]:
            raise ValueError(f"{rule_context}.add 必须是非空数组")
        for shot_index, shot in enumerate(rule["add"]):
            shot_context = f"{rule_context}.add[{shot_index}]"
            _validate_shot(shot, shot["type"], shot_context)
            if shot["id"] in shot_ids:
                raise ValueError(f"{source} 镜头 ID 重复：{shot['id']}")
            shot_ids.add(shot["id"])

    defaults = data["defaults"]
    if not isinstance(defaults, dict):
        raise ValueError(f"{source}.defaults 必须是对象")
    output_by_type = defaults.get("outputByType")
    if not isinstance(output_by_type, dict):
        raise ValueError(f"{source}.defaults.outputByType 必须是对象")
    missing_outputs = set(SHOT_GROUPS) - set(output_by_type)
    if missing_outputs:
        raise ValueError(
            f"{source}.defaults.outputByType 缺少类型：{', '.join(sorted(missing_outputs))}"
        )
    for task_type in SHOT_GROUPS:
        output = output_by_type[task_type]
        output_context = f"{source}.defaults.outputByType.{task_type}"
        _require_fields(output, ("width", "height"), output_context)
        if not isinstance(output["width"], int) or output["width"] <= 0:
            raise ValueError(f"{output_context}.width 必须是正整数")
        if not isinstance(output["height"], int) or output["height"] <= 0:
            raise ValueError(f"{output_context}.height 必须是正整数")


@lru_cache(maxsize=1)
def load_shot_templates() -> dict[str, dict]:
    """读取并按品类索引套图模板；模板保持 JSON 源头，不复制进 SQLite。"""
    templates: dict[str, dict] = {}
    paths = sorted(SHOT_TEMPLATE_ROOT.glob("*.json"))
    if not paths:
        raise ValueError(f"套图模板目录为空：{SHOT_TEMPLATE_ROOT}")
    for path in paths:
        data = _read(path)
        validate_shot_template(data, str(path))
        category = data["category"]
        if path.stem != category:
            raise ValueError(f"{path} 文件名必须等于 category：{category}")
        if category in templates:
            raise ValueError(f"套图模板品类重复：{category}")
        templates[category] = data
    return templates


def load_asset_library() -> dict:
    shot_templates = load_shot_templates()
    category_paths = {
        path.stem: path for path in (LIBRARY_ROOT / "categories").glob("*.json")
        if path.name not in {"manifest.json", "all.json"}
    }
    missing_templates = set(category_paths) - set(shot_templates)
    extra_templates = set(shot_templates) - set(category_paths)
    if missing_templates or extra_templates:
        details = []
        if missing_templates:
            details.append(f"缺失模板：{', '.join(sorted(missing_templates))}")
        if extra_templates:
            details.append(f"多余模板：{', '.join(sorted(extra_templates))}")
        raise ValueError("套图模板与品类文件未一一对应；" + "；".join(details))

    counts = {"categories": 0, "referenceSpecs": 0, "models": 0, "shotTemplates": len(shot_templates)}
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
