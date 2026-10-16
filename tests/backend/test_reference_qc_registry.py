import hashlib
import json
from pathlib import Path

from backend.app.services.reference_qc_registry import (
    blocked_reference_hashes,
    is_known_bad_reference,
    registry_summary,
)


ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "asset-library" / "qc-rules" / "reference-workbook.json"
EVALUATION = ROOT / "asset-library" / "evaluation" / "garment-authenticity-v1.json"


def test_reference_workbook_manifest_keeps_evidence_classes_separate():
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    summary = registry_summary()

    assert summary["total"] == 460
    assert summary["byClassification"] == {
        "source_context": 65,
        "rejected_output": 48,
        "defect_evidence": 43,
        "unfinished_source": 125,
        "approved_reference": 179,
    }
    assert summary["matchedKnownBadLocalFiles"] == 46
    assert all(
        record["allowedAsPositiveReference"]
        == (record["classification"] == "approved_reference")
        for record in manifest["records"]
    )


def test_matched_bad_source_hashes_are_kept_in_blocklist():
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    rejected = next(
        record
        for record in manifest["records"]
        if record["classification"] == "rejected_output"
        and record.get("matchedLibrarySha256")
    )
    digest = rejected["matchedLibrarySha256"][0]

    assert digest in blocked_reference_hashes()
    assert digest in rejected["matchedLibrarySha256"]
    assert is_known_bad_reference(digest)
    assert not is_known_bad_reference("0" * 64)


def test_production_reference_assets_do_not_use_known_bad_hashes():
    reference_roots = [
        ROOT / "asset-library" / "reference-templates",
        ROOT / "asset-library" / "reference-images",
    ]
    image_suffixes = {".png", ".jpg", ".jpeg", ".webp"}
    production_images = [
        path
        for reference_root in reference_roots
        for path in reference_root.rglob("*")
        if path.is_file() and path.suffix.lower() in image_suffixes
    ]

    assert production_images
    assert all(
        not is_known_bad_reference(hashlib.sha256(path.read_bytes()).hexdigest())
        for path in production_images
    )


def test_fixed_garment_evaluation_set_is_balanced_and_hash_locked():
    suite = json.loads(EVALUATION.read_text(encoding="utf-8"))
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    evidence = {
        (record["sheet"], record["anchor"], record["mediaPart"]): record
        for record in manifest["records"]
    }
    assert suite["caseCount"] == 32
    assert suite["classBalance"] == {"accept": 16, "reject": 16}
    assert len({case["id"] for case in suite["cases"]}) == 32
    assert all(case["requiredChecks"] == ["color", "logo", "silhouette", "fasteners"] for case in suite["cases"])
    for case in suite["cases"]:
        for pointer in (case["candidate"], case.get("reference")):
            if pointer:
                record = evidence[(pointer["sheet"], pointer["anchor"], pointer["mediaPart"])]
                assert record["sha256"] == pointer["sha256"]
                assert record["classification"] == pointer["classification"]
