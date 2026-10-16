"""Resolve the default garment references for incomplete model outfits."""
from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from typing import Iterable

from ..config import PROJECT_ROOT

MANIFEST_PATH = PROJECT_ROOT / "asset-library" / "default-garments" / "manifest.json"
UPPER_BASE_CATEGORIES = frozenset({
    "top", "inner", "shirt", "tshirt", "hoodie", "sweater", "dress",
})
OUTER_ONLY_CATEGORIES = frozenset({"coat", "vest", "blazer"})
LOWER_BASE_CATEGORIES = frozenset({
    "pants", "skirt", "shorts", "jeans", "halfSkirt", "dress",
})


@dataclass(frozen=True)
class OutfitFallback:
    id: str
    role: str
    name: str
    path: str
    sha256: str
    reason: str

    @property
    def prompt_line(self) -> str:
        return (
            f"- 默认补位素材：{self.name}（{self.reason}；仅作健康运动内搭，"
            "不得遮挡或改变售卖商品）"
        )


@lru_cache(maxsize=1)
def _manifest_by_role() -> dict[str, dict[str, str]]:
    data = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    if data.get("schema") != "longy.default-garments.v1":
        raise RuntimeError("默认补位服饰清单版本无效")
    items = data.get("items")
    if not isinstance(items, list):
        raise RuntimeError("默认补位服饰清单缺少 items")
    by_role = {item.get("role"): item for item in items if isinstance(item, dict)}
    if set(by_role) != {"upper-base", "lower-base"}:
        raise RuntimeError("默认补位服饰必须且只能包含 upper-base 与 lower-base")
    return by_role


def default_garment_records() -> tuple[dict[str, str], ...]:
    """Return defensive copies in the same order used for outfit resolution."""
    manifest = _manifest_by_role()
    return tuple(dict(manifest[role]) for role in ("upper-base", "lower-base"))


def resolve_outfit_fallbacks(category_ids: Iterable[str]) -> list[OutfitFallback]:
    """Return missing base layers in stable upper-then-lower order."""
    categories = set(category_ids)
    manifest = _manifest_by_role()
    resolved: list[OutfitFallback] = []

    def add(role: str, reason: str) -> None:
        item = manifest[role]
        resolved.append(OutfitFallback(
            id=item["id"],
            role=role,
            name=item["name"],
            path=item["path"],
            sha256=item["sha256"],
            reason=reason,
        ))

    if not categories & UPPER_BASE_CATEGORIES:
        reason = (
            "仅上传外搭，缺少上身基础层"
            if categories & OUTER_ONLY_CATEGORIES else "未上传上身基础层"
        )
        add("upper-base", reason)
    if not categories & LOWER_BASE_CATEGORIES:
        add("lower-base", "未上传下装")
    return resolved
