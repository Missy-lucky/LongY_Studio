"""Known-good and known-bad reference evidence derived from the audit workbook."""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from ..config import PROJECT_ROOT


REGISTRY_PATH = PROJECT_ROOT / "asset-library" / "qc-rules" / "reference-workbook.json"


@lru_cache(maxsize=1)
def load_reference_qc_registry() -> dict[str, Any]:
    if not REGISTRY_PATH.is_file():
        return {
            "schema": "longy.reference-qc-registry.v1",
            "summary": {"total": 0, "byClassification": {}},
            "blockedHashes": {"workbookProblemImages": [], "matchedLocalFiles": []},
            "records": [],
        }
    return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def blocked_reference_hashes() -> frozenset[str]:
    registry = load_reference_qc_registry()
    blocked = registry.get("blockedHashes", {})
    return frozenset(
        str(digest)
        for group in ("workbookProblemImages", "matchedLocalFiles")
        for digest in blocked.get(group, [])
    )


def is_known_bad_reference(digest: str) -> bool:
    """Return True only for exact bytes backed by reviewed negative evidence."""
    return digest.lower() in blocked_reference_hashes()


def registry_summary() -> dict[str, Any]:
    registry = load_reference_qc_registry()
    return dict(registry.get("summary", {}))
