"""Structured care-label cards: validate facts, then render deterministic text/icons."""
from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field, model_validator

from ..config import settings
from ..database import get_db, utc_now
from ..services.care_card_renderer import CARE_LABELS, render_care_card
from ..services.care_label_extractor import CareLabelExtractionError, extract_care_label
from ..utils.case import camelize

router = APIRouter()
CareInstruction = Literal[
    "hand_wash", "machine_wash_gentle", "do_not_wash", "max_30",
    "dry_clean", "do_not_dry_clean", "do_not_bleach", "do_not_iron",
    "low_iron", "line_dry", "do_not_tumble",
]


class CompositionPart(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    percent: float = Field(gt=0, le=100)


class CareCardIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    source_asset_id: str | None = Field(default=None, alias="sourceAssetId")
    brand: str = Field(default="", max_length=80)
    product_name: str = Field(default="", max_length=80, alias="productName")
    composition: list[CompositionPart] = Field(min_length=1, max_length=8)
    instructions: list[CareInstruction] = Field(min_length=1, max_length=9)
    warnings: list[str] = Field(default_factory=list, max_length=3)

    @model_validator(mode="after")
    def validate_facts(self):
        for part in self.composition:
            part.name = part.name.strip()
            if not part.name:
                raise ValueError("面料成分名称不能为空")
        if len({part.name.casefold() for part in self.composition}) != len(self.composition):
            raise ValueError("面料成分名称不能重复")
        total = sum(part.percent for part in self.composition)
        if abs(total - 100) > 0.1:
            raise ValueError(f"面料成分合计必须为 100%，当前为 {total:g}%")
        if len(set(self.instructions)) != len(self.instructions):
            raise ValueError("洗护方式不能重复")
        instruction_set = set(self.instructions)
        conflicts = (
            ({"do_not_wash", "hand_wash"}, "不可水洗与建议手洗冲突"),
            ({"do_not_wash", "machine_wash_gentle"}, "不可水洗与轻柔机洗冲突"),
            ({"do_not_wash", "max_30"}, "不可水洗与最高水温标记冲突"),
            ({"do_not_dry_clean", "dry_clean"}, "可干洗与不可干洗冲突"),
            ({"do_not_iron", "low_iron"}, "不可熨烫与低温熨烫冲突"),
        )
        for pair, message in conflicts:
            if pair <= instruction_set:
                raise ValueError(message)
        self.warnings = [warning.strip() for warning in self.warnings if warning.strip()]
        if any(len(warning) > 40 for warning in self.warnings):
            raise ValueError("每条注意事项不能超过 40 个字符")
        return self


class CareExtractIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    source_asset_id: str = Field(alias="sourceAssetId")
    provider: Literal["openai", "volcengine-ark"]


def _validate_project_and_asset(db, project_id: str, source_asset_id: str | None):
    if not db.execute("SELECT 1 FROM projects WHERE id=?", (project_id,)).fetchone():
        raise HTTPException(404, "项目不存在")
    if source_asset_id and not db.execute(
        "SELECT 1 FROM assets WHERE id=? AND project_id=?", (source_asset_id, project_id)
    ).fetchone():
        raise HTTPException(400, "商标或水洗标素材不存在或不属于当前项目")


def _payload(body: CareCardIn) -> dict:
    return body.model_dump(by_alias=True)


def _card_view(row) -> dict:
    card = camelize(dict(row))
    card["data"] = json.loads(card.pop("dataJson"))
    return card


@router.get("")
def list_care_cards(project_id: str) -> dict:
    db = get_db()
    try:
        _validate_project_and_asset(db, project_id, None)
        rows = db.execute(
            "SELECT * FROM care_cards WHERE project_id=? ORDER BY updated_at DESC,id",
            (project_id,),
        ).fetchall()
        return {"careCards": [_card_view(row) for row in rows], "instructionLabels": CARE_LABELS}
    finally:
        db.close()


@router.post("")
def create_care_card(project_id: str, body: CareCardIn) -> dict:
    card_id = uuid.uuid4().hex[:12]
    relative = f"projects/{project_id}/care/{card_id}.png"
    output = settings.data_dir / relative
    now = utc_now()
    data = _payload(body)
    db = get_db()
    try:
        _validate_project_and_asset(db, project_id, body.source_asset_id)
        render_care_card(data, output)
        db.execute(
            """INSERT INTO care_cards(
                   id,project_id,source_asset_id,brand,product_name,data_json,file_path,created_at,updated_at
               ) VALUES(?,?,?,?,?,?,?,?,?)""",
            (
                card_id, project_id, body.source_asset_id, body.brand, body.product_name,
                json.dumps(data, ensure_ascii=False), relative, now, now,
            ),
        )
        db.execute(
            "INSERT INTO events(time,project_id,task_id,type,message) VALUES(?,?,?,?,?)",
            (now, project_id, card_id, "care.render", "洗护与成分图已生成"),
        )
        db.commit()
        row = db.execute("SELECT * FROM care_cards WHERE id=?", (card_id,)).fetchone()
        return {"careCard": _card_view(row)}
    except Exception:
        if not db.execute("SELECT 1 FROM care_cards WHERE id=?", (card_id,)).fetchone():
            output.unlink(missing_ok=True)
        raise
    finally:
        db.close()


@router.post("/extract")
def extract_care_card_draft(project_id: str, body: CareExtractIn) -> dict:
    db = get_db()
    try:
        _validate_project_and_asset(db, project_id, body.source_asset_id)
        row = db.execute(
            "SELECT file_path FROM assets WHERE id=? AND project_id=?",
            (body.source_asset_id, project_id),
        ).fetchone()
    finally:
        db.close()
    root = settings.data_dir.resolve()
    image_path = (root / row["file_path"]).resolve()
    if not image_path.is_relative_to(root) or not image_path.is_file():
        raise HTTPException(404, "商标或水洗标素材文件不存在")
    try:
        result = extract_care_label(image_path, body.provider)
    except CareLabelExtractionError as exc:
        status = 400 if exc.code in {"PROVIDER_UNSUPPORTED", "API_KEY_MISSING", "AUTHENTICATION_FAILED"} else 502
        raise HTTPException(status, {"code": exc.code, "message": exc.message, "suggestion": exc.suggestion}) from exc
    db = get_db()
    try:
        db.execute(
            "INSERT INTO events(time,project_id,task_id,type,message,payload) VALUES(?,?,?,?,?,?)",
            (
                utc_now(), project_id, body.source_asset_id, "care.extract",
                f"水洗标识别草稿已生成（{result['provider']}）",
                json.dumps({"model": result["model"]}, ensure_ascii=False),
            ),
        )
        db.commit()
    finally:
        db.close()
    return {**result, "requiresConfirmation": True}


@router.put("/{card_id}")
def update_care_card(project_id: str, card_id: str, body: CareCardIn) -> dict:
    db = get_db()
    try:
        _validate_project_and_asset(db, project_id, body.source_asset_id)
        row = db.execute(
            "SELECT file_path FROM care_cards WHERE id=? AND project_id=?",
            (card_id, project_id),
        ).fetchone()
        if not row:
            raise HTTPException(404, "洗护图不存在")
        output = settings.data_dir / row["file_path"]
        data = _payload(body)
        render_care_card(data, output)
        now = utc_now()
        db.execute(
            """UPDATE care_cards SET source_asset_id=?,brand=?,product_name=?,data_json=?,updated_at=?
               WHERE id=? AND project_id=?""",
            (
                body.source_asset_id, body.brand, body.product_name,
                json.dumps(data, ensure_ascii=False), now, card_id, project_id,
            ),
        )
        db.commit()
        updated = db.execute("SELECT * FROM care_cards WHERE id=?", (card_id,)).fetchone()
        return {"careCard": _card_view(updated)}
    finally:
        db.close()


@router.get("/{card_id}/file")
def care_card_file(project_id: str, card_id: str) -> FileResponse:
    db = get_db()
    try:
        row = db.execute(
            "SELECT file_path FROM care_cards WHERE id=? AND project_id=?",
            (card_id, project_id),
        ).fetchone()
    finally:
        db.close()
    if not row:
        raise HTTPException(404, "洗护图不存在")
    root = settings.data_dir.resolve()
    path = (root / row["file_path"]).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise HTTPException(404, "洗护图文件不存在")
    return FileResponse(path)
