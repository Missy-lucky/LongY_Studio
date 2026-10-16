"""Build a traceable QC registry from the image-only reference workbook.

The workbook is treated as read-only evidence.  Its layout has three explicit
sections: approved examples, known AI problems, and unfinished source material.
Within the known-problem sheet, column C contains generated outputs and column D
contains annotated defect crops; the remaining columns are source context.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import posixpath
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

import numpy as np
from PIL import Image


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_WORKBOOK = PROJECT_ROOT / "总览.xlsx"
DEFAULT_OUTPUT = PROJECT_ROOT / "asset-library" / "qc-rules" / "reference-workbook.json"

REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
DRAWING_NS = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
DRAW_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"
WPS_NS = "http://www.wps.cn/officeDocument/2017/etCustomData"


def _rels_path(part: str) -> str:
    return posixpath.join(posixpath.dirname(part), "_rels", f"{posixpath.basename(part)}.rels")


def _resolve(part: str, target: str) -> str:
    return posixpath.normpath(posixpath.join(posixpath.dirname(part), target))


def _relationships(archive: zipfile.ZipFile, part: str) -> dict[str, str]:
    path = _rels_path(part)
    if path not in archive.namelist():
        return {}
    root = ET.fromstring(archive.read(path))
    return {
        rel.attrib["Id"]: _resolve(part, rel.attrib["Target"])
        for rel in root.findall(f"{{{PKG_REL_NS}}}Relationship")
        if rel.attrib.get("TargetMode") != "External"
    }


def _cell_name(row: int, col: int) -> str:
    value = col + 1
    letters = ""
    while value:
        value, remainder = divmod(value - 1, 26)
        letters = chr(65 + remainder) + letters
    return f"{letters}{row + 1}"


def _column_name(col: int) -> str:
    return _cell_name(0, col)[:-1]


def _classification(sheet_name: str, col: int) -> tuple[str, bool, str]:
    if sheet_name == "示例图":
        return "approved_reference", True, "工作簿明确标记为示例图"
    if sheet_name == "AI有问题的":
        if _column_name(col) == "C":
            return "rejected_output", False, "问题表 C 列为对应生成结果"
        if _column_name(col) == "D":
            return "defect_evidence", False, "问题表 D 列为红框缺陷证据"
        return "source_context", False, "问题表中的原始商品素材，仅作问题对照"
    if sheet_name == "未做完的图":
        return "unfinished_source", False, "工作簿明确标记为未完成素材"
    return "unclassified", False, "未识别的工作表分区"


def _perceptual_hash(data: bytes) -> str:
    with Image.open(io.BytesIO(data)) as image:
        pixels = np.asarray(image.convert("L").resize((32, 32)), dtype=np.float32)
    indices = np.arange(32, dtype=np.float32)
    basis = np.cos(np.pi * (2 * indices[:, None] + 1) * indices[None, :] / 64)
    basis[:, 0] *= 1 / np.sqrt(2)
    basis *= np.sqrt(2 / 32)
    low_frequency = (basis.T @ pixels @ basis)[:8, :8]
    median = float(np.median(low_frequency.flatten()[1:]))
    bits = (low_frequency > median).flatten()
    return f"{sum(int(bit) << index for index, bit in enumerate(bits)):016x}"


def _hash_distance(left: str, right: str) -> int:
    return (int(left, 16) ^ int(right, 16)).bit_count()


def _file_hashes(folder: Path, perceptual: bool = False) -> list[dict[str, object]]:
    hashes: list[dict[str, object]] = []
    if not folder.is_dir():
        return hashes
    image_suffixes = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}
    for path in sorted(
        item for item in folder.iterdir()
        if item.is_file() and item.suffix.lower() in image_suffixes
    ):
        data = path.read_bytes()
        hashes.append(
            {
                "path": path.relative_to(PROJECT_ROOT).as_posix(),
                "sha256": hashlib.sha256(data).hexdigest(),
                "perceptualHash": _perceptual_hash(data) if perceptual else None,
            }
        )
    return hashes


def _sheet_parts(archive: zipfile.ZipFile) -> list[tuple[str, str]]:
    workbook_part = "xl/workbook.xml"
    workbook = ET.fromstring(archive.read(workbook_part))
    rels = _relationships(archive, workbook_part)
    return [
        (sheet.attrib["name"], rels[sheet.attrib[f"{{{REL_NS}}}id"]])
        for sheet in workbook.findall(f".//{{{MAIN_NS}}}sheet")
    ]


def _drawing_parts(archive: zipfile.ZipFile, sheet_part: str) -> list[str]:
    root = ET.fromstring(archive.read(sheet_part))
    rels = _relationships(archive, sheet_part)
    return [
        rels[node.attrib[f"{{{REL_NS}}}id"]]
        for node in root.findall(f".//{{{MAIN_NS}}}drawing")
    ]


def _drawing_records(
    archive: zipfile.ZipFile, sheet_name: str, drawing_part: str
) -> list[dict[str, object]]:
    root = ET.fromstring(archive.read(drawing_part))
    rels = _relationships(archive, drawing_part)
    records: list[dict[str, object]] = []
    anchors = (
        root.findall(f"{{{DRAWING_NS}}}oneCellAnchor")
        + root.findall(f"{{{DRAWING_NS}}}twoCellAnchor")
        + root.findall(f"{{{DRAWING_NS}}}absoluteAnchor")
    )
    for anchor in anchors:
        start = anchor.find(f"{{{DRAWING_NS}}}from")
        row_node = start.find(f"{{{DRAWING_NS}}}row") if start is not None else None
        col_node = start.find(f"{{{DRAWING_NS}}}col") if start is not None else None
        row = int(row_node.text or 0) if row_node is not None else 0
        col = int(col_node.text or 0) if col_node is not None else 0
        blip = anchor.find(f".//{{{DRAW_NS}}}blip")
        if blip is None:
            continue
        relationship_id = blip.attrib.get(f"{{{REL_NS}}}embed")
        media_part = rels.get(relationship_id or "")
        if not media_part:
            continue
        data = archive.read(media_part)
        classification, positive, rationale = _classification(sheet_name, col)
        records.append(
            {
                "sheet": sheet_name,
                "anchor": _cell_name(row, col),
                "classification": classification,
                "allowedAsPositiveReference": positive,
                "rationale": rationale,
                "mediaPart": media_part,
                "sha256": hashlib.sha256(data).hexdigest(),
                "perceptualHash": _perceptual_hash(data),
                "byteSize": len(data),
            }
        )
    return records


def _cell_image_parts(archive: zipfile.ZipFile) -> dict[str, str]:
    part = "xl/cellimages.xml"
    if part not in archive.namelist():
        return {}
    root = ET.fromstring(archive.read(part))
    rels = _relationships(archive, part)
    result: dict[str, str] = {}
    for cell_image in root.findall(f"{{{WPS_NS}}}cellImage"):
        properties = cell_image.find(f".//{{{DRAWING_NS}}}cNvPr")
        blip = cell_image.find(f".//{{{DRAW_NS}}}blip")
        if properties is None or blip is None:
            continue
        image_id = properties.attrib.get("name")
        relationship_id = blip.attrib.get(f"{{{REL_NS}}}embed")
        media_part = rels.get(relationship_id or "")
        if image_id and media_part:
            result[image_id] = media_part
    return result


def _cell_image_records(
    archive: zipfile.ZipFile,
    sheet_name: str,
    sheet_part: str,
    image_parts: dict[str, str],
) -> list[dict[str, object]]:
    root = ET.fromstring(archive.read(sheet_part))
    records: list[dict[str, object]] = []
    for cell in root.findall(f".//{{{MAIN_NS}}}c"):
        formula = cell.find(f"{{{MAIN_NS}}}f")
        if formula is None or not formula.text or "DISPIMG" not in formula.text:
            continue
        match = re.search(r'DISPIMG\("([^"]+)"', formula.text)
        if not match:
            continue
        image_id = match.group(1)
        media_part = image_parts.get(image_id)
        if not media_part:
            continue
        anchor = cell.attrib.get("r", "A1")
        column_letters = re.match(r"[A-Z]+", anchor)
        if column_letters is None:
            continue
        col = 0
        for letter in column_letters.group(0):
            col = col * 26 + ord(letter) - 64
        data = archive.read(media_part)
        classification, positive, rationale = _classification(sheet_name, col - 1)
        records.append(
            {
                "sheet": sheet_name,
                "anchor": anchor,
                "classification": classification,
                "allowedAsPositiveReference": positive,
                "rationale": rationale,
                "mediaPart": media_part,
                "sha256": hashlib.sha256(data).hexdigest(),
                "perceptualHash": _perceptual_hash(data),
                "byteSize": len(data),
            }
        )
    return records


def build_manifest(workbook: Path, output: Path, match_libraries: bool) -> dict[str, object]:
    with zipfile.ZipFile(workbook) as archive:
        image_parts = _cell_image_parts(archive)
        records: list[dict[str, object]] = []
        for sheet_name, sheet_part in _sheet_parts(archive):
            records.extend(_cell_image_records(archive, sheet_name, sheet_part, image_parts))
            for drawing_part in _drawing_parts(archive, sheet_part):
                records.extend(_drawing_records(archive, sheet_name, drawing_part))

    defect_anchors_by_row = {
        re.sub(r"^[A-Z]+", "", str(record["anchor"])): str(record["anchor"])
        for record in records
        if record["classification"] == "defect_evidence"
    }
    for record in records:
        if record["classification"] == "rejected_output":
            row = re.sub(r"^[A-Z]+", "", str(record["anchor"]))
            if row in defect_anchors_by_row:
                record["defectEvidenceAnchors"] = [defect_anchors_by_row[row]]

    if match_libraries:
        plan_views = _file_hashes(
            PROJECT_ROOT / "Model" / "work_library_plan_view", perceptual=True
        )
        for record in records:
            matches = [
                str(item["path"])
                for item in plan_views
                if item["sha256"] == record["sha256"]
            ]
            record["exactLibraryMatches"] = matches
            if record["classification"] == "rejected_output":
                ranked = sorted(
                    [
                        (
                            _hash_distance(
                                str(record["perceptualHash"]),
                                str(item["perceptualHash"]),
                            ),
                            item,
                        )
                        for item in plan_views
                        if item["perceptualHash"]
                    ],
                    key=lambda candidate: (candidate[0], str(candidate[1]["path"])),
                )
                best_distance, best = ranked[0]
                if best_distance <= 6:
                    record["matchedLibraryFiles"] = [best["path"]]
                    record["matchedLibrarySha256"] = [best["sha256"]]
                    record["perceptualHashDistance"] = best_distance

    counts: dict[str, int] = {}
    for record in records:
        key = str(record["classification"])
        counts[key] = counts.get(key, 0) + 1
    workbook_blocked_hashes = sorted(
        {
            str(record["sha256"])
            for record in records
            if record["classification"] in {"rejected_output", "defect_evidence"}
        }
    )
    matched_library_hashes = sorted(
        {
            str(digest)
            for record in records
            for digest in record.get("matchedLibrarySha256", [])
        }
    )
    manifest: dict[str, object] = {
        "schema": "longy.reference-qc-registry.v1",
        "source": workbook.name,
        "classificationRules": {
            "示例图": "approved_reference",
            "AI有问题的:C": "rejected_output",
            "AI有问题的:D": "defect_evidence",
            "AI有问题的:other": "source_context",
            "未做完的图": "unfinished_source",
        },
        "summary": {
            "total": len(records),
            "byClassification": counts,
            "matchedKnownBadLocalFiles": len(matched_library_hashes),
        },
        "blockedHashes": {
            "workbookProblemImages": workbook_blocked_hashes,
            "matchedLocalFiles": matched_library_hashes,
        },
        "records": records,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workbook", type=Path, default=DEFAULT_WORKBOOK)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--match-libraries", action="store_true")
    args = parser.parse_args()
    manifest = build_manifest(args.workbook.resolve(), args.output.resolve(), args.match_libraries)
    print(json.dumps(manifest["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()
