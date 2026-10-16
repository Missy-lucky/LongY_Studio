"""Build/check the fixed garment-authenticity evaluation set from 总览.xlsx evidence."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "asset-library" / "qc-rules" / "reference-workbook.json"
OUTPUT = ROOT / "asset-library" / "evaluation" / "garment-authenticity-v1.json"


def _spread(records: list[dict], count: int) -> list[dict]:
    if len(records) <= count:
        return records
    return [records[round(index * (len(records) - 1) / (count - 1))] for index in range(count)]


def _pointer(record: dict) -> dict:
    return {
        "workbook": "总览.xlsx",
        "sheet": record["sheet"],
        "anchor": record["anchor"],
        "mediaPart": record["mediaPart"],
        "sha256": record["sha256"],
        "classification": record["classification"],
    }


def build() -> dict:
    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    records = registry["records"]
    approved = _spread([item for item in records if item["classification"] == "approved_reference"], 16)
    rejected = _spread([item for item in records if item["classification"] == "rejected_output"], 16)
    by_cell = {(item["sheet"], "".join(filter(str.isdigit, item["anchor"]))): item for item in records if item["classification"] == "source_context"}

    cases = []
    for index, record in enumerate(approved, 1):
        cases.append({
            "id": f"approved-{index:02d}",
            "expectedDecision": "accept",
            "taskType": "catalogue-reference",
            "candidate": _pointer(record),
            "reference": None,
            "requiredChecks": ["color", "logo", "silhouette", "fasteners"],
            "note": "工作簿示例图中的固定正样本；用作构图与商品真实性人工基准。",
        })
    for index, record in enumerate(rejected, 1):
        row = "".join(filter(str.isdigit, record["anchor"]))
        source = by_cell.get((record["sheet"], row))
        cases.append({
            "id": f"rejected-{index:02d}",
            "expectedDecision": "reject",
            "taskType": "flat",
            "candidate": _pointer(record),
            "reference": _pointer(source) if source else None,
            "defectEvidenceAnchors": record.get("defectEvidenceAnchors", []),
            "requiredChecks": ["color", "logo", "silhouette", "fasteners"],
            "note": "工作簿明确标记的问题输出；不得进入正向参考库。",
        })
    digest_payload = json.dumps(cases, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return {
        "schema": "longy.garment-evaluation.v1",
        "version": 1,
        "name": "服饰商品真实性固定评测集 v1",
        "sourceRegistry": "asset-library/qc-rules/reference-workbook.json",
        "caseCount": len(cases),
        "classBalance": {"accept": len(approved), "reject": len(rejected)},
        "suiteSha256": hashlib.sha256(digest_payload).hexdigest(),
        "cases": cases,
    }


def validate(manifest: dict) -> list[str]:
    errors: list[str] = []
    cases = manifest.get("cases", [])
    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    evidence = {
        (record["sheet"], record["anchor"], record["mediaPart"]): record
        for record in registry["records"]
    }
    if not 20 <= len(cases) <= 50:
        errors.append(f"caseCount must be 20..50, got {len(cases)}")
    if len({case.get("id") for case in cases}) != len(cases):
        errors.append("case ids are not unique")
    for case in cases:
        for field in ("candidate", "reference"):
            pointer = case.get(field)
            if not pointer:
                continue
            key = (pointer["sheet"], pointer["anchor"], pointer["mediaPart"])
            record = evidence.get(key)
            if record is None:
                errors.append(f"{case['id']}:{field} evidence pointer missing from registry")
                continue
            if record["sha256"] != pointer["sha256"]:
                errors.append(f"{case['id']}:{field} hash mismatch")
            if record["classification"] != pointer["classification"]:
                errors.append(f"{case['id']}:{field} classification mismatch")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    expected = build()
    if args.check:
        actual = json.loads(OUTPUT.read_text(encoding="utf-8"))
        errors = validate(actual)
        if actual != expected:
            errors.append("manifest is stale; rebuild it")
        if errors:
            raise SystemExit("\n".join(errors))
        print(f"validated {actual['caseCount']} fixed evaluation cases ({actual['suiteSha256'][:12]})")
        return 0
    errors = validate(expected)
    if errors:
        raise SystemExit("\n".join(errors))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(expected, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {expected['caseCount']} cases to {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
