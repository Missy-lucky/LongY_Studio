"""Perceptual consistency QC for garment identity and locked model identity.

The module deliberately combines several independent signals instead of trusting a
single pixel metric:

- garment: HSV distribution, perceptual hash, and ORB structure matches
- model: MediaPipe face geometry, face-crop appearance, and body proportions
- output: pixel gates plus Laplacian / high-frequency detail measurements
"""
from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from PIL import Image

from ..config import PROJECT_ROOT
from .image_qc import inspect_image

QC_SCHEMA = "longy.consistency-qc.v1"
FACE_MODEL_PATH = PROJECT_ROOT / "asset-library" / "qc-models" / "face_landmarker.task"
POSE_MODEL_PATH = PROJECT_ROOT / "asset-library" / "qc-models" / "pose_landmarker_heavy.task"
_FACE_LOCK = threading.Lock()
_POSE_LOCK = threading.Lock()
_FACE_LANDMARKER: Any | None = None
_POSE_LANDMARKER: Any | None = None

FACE_POINTS = [10, 33, 61, 133, 152, 199, 234, 291, 454, 13]
GARMENT_THRESHOLD = 0.48
MODEL_THRESHOLD = 0.68


def _load_image(path: Path) -> np.ndarray:
    image = cv2.imdecode(np.fromfile(path, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError(f"cannot decode image: {path}")
    return image


def _face_landmarker() -> Any | None:
    global _FACE_LANDMARKER
    if not FACE_MODEL_PATH.is_file():
        return None
    with _FACE_LOCK:
        if _FACE_LANDMARKER is not None:
            return _FACE_LANDMARKER
        from mediapipe import Image as MpImage, ImageFormat
        from mediapipe.tasks import python as mp_python
        from mediapipe.tasks.python import vision as mp_vision

        _FACE_LANDMARKER = mp_vision.FaceLandmarker.create_from_options(
            mp_vision.FaceLandmarkerOptions(
                base_options=mp_python.BaseOptions(model_asset_path=str(FACE_MODEL_PATH)),
                running_mode=mp_vision.RunningMode.IMAGE,
                num_faces=1,
            )
        )
        return _FACE_LANDMARKER


def _pose_landmarker() -> Any | None:
    global _POSE_LANDMARKER
    if not POSE_MODEL_PATH.is_file():
        return None
    with _POSE_LOCK:
        if _POSE_LANDMARKER is not None:
            return _POSE_LANDMARKER
        from mediapipe import Image as MpImage, ImageFormat
        from mediapipe.tasks import python as mp_python
        from mediapipe.tasks.python import vision as mp_vision

        _POSE_LANDMARKER = mp_vision.PoseLandmarker.create_from_options(
            mp_vision.PoseLandmarkerOptions(
                base_options=mp_python.BaseOptions(model_asset_path=str(POSE_MODEL_PATH)),
                running_mode=mp_vision.RunningMode.IMAGE,
                num_poses=1,
            )
        )
        return _POSE_LANDMARKER


def _histogram_similarity(left: np.ndarray, right: np.ndarray) -> float:
    left_hsv = cv2.cvtColor(left, cv2.COLOR_BGR2HSV)
    right_hsv = cv2.cvtColor(right, cv2.COLOR_BGR2HSV)
    score = 0.0
    for channel, bins in ((0, 32), (1, 24)):
        hist_left = cv2.calcHist([left_hsv], [channel], None, [bins], [0, 256 if channel == 0 else 180])
        hist_right = cv2.calcHist([right_hsv], [channel], None, [bins], [0, 256 if channel == 0 else 180])
        cv2.normalize(hist_left, hist_left)
        cv2.normalize(hist_right, hist_right)
        score += max(0.0, cv2.compareHist(hist_left, hist_right, cv2.HISTCMP_CORREL))
    return round(score / 2, 4)


def _perceptual_hash_similarity(left: np.ndarray, right: np.ndarray) -> float:
    def phash(image: np.ndarray) -> tuple[np.ndarray, int]:
        gray = Image.fromarray(cv2.cvtColor(image, cv2.COLOR_BGR2RGB)).convert("L").resize((32, 32))
        matrix = np.asarray(gray, dtype=np.float32)
        frequencies = np.fft.rfft2(matrix)[:8, :8]
        flat = frequencies.flatten()
        median = float(np.median(np.abs(flat[1:]))) if flat.size > 1 else 0.0
        return (flat > median).astype(np.uint8), int(np.prod(flat.shape))

    left_hash, size = phash(left)
    right_hash, _ = phash(right)
    distance = int(np.count_nonzero(left_hash != right_hash))
    return round(max(0.0, 1 - distance / max(1, size)), 4)


def _structure_similarity(left: np.ndarray, right: np.ndarray) -> tuple[float, int]:
    orb = cv2.ORB_create(nfeatures=1200, fastThreshold=8)
    left_gray = cv2.cvtColor(left, cv2.COLOR_BGR2GRAY)
    right_gray = cv2.cvtColor(right, cv2.COLOR_BGR2GRAY)
    kp1, des1 = orb.detectAndCompute(left_gray, None)
    kp2, des2 = orb.detectAndCompute(right_gray, None)
    if des1 is None or des2 is None or not kp1 or not kp2:
        return 0.0, 0
    matcher = cv2.BFMatcher(cv2.NORM_HAMMING)
    matches = matcher.knnMatch(des1, des2, k=2)
    good = []
    for pair in matches:
        if len(pair) == 2 and pair[0].distance < 0.78 * pair[1].distance:
            good.append(pair[0])
    inliers = 0
    if len(good) >= 8:
        src = np.float32([kp1[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
        dst = np.float32([kp2[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)
        _, mask = cv2.findHomography(src, dst, cv2.RANSAC, 4.0)
        inliers = int(np.count_nonzero(mask)) if mask is not None else 0
    denominator = max(24, min(len(kp1), len(kp2), 160))
    score = min(1.0, (len(good) * 0.65 + inliers * 0.35) / denominator)
    return round(score, 4), inliers


def garment_consistency(reference: Path, output: Path) -> dict[str, Any]:
    ref = _load_image(reference)
    generated = _load_image(output)
    color = _histogram_similarity(ref, generated)
    perceptual = _perceptual_hash_similarity(ref, generated)
    structure, inliers = _structure_similarity(ref, generated)
    # Color is the most stable signal after garment-to-flat transformation. ORB is
    # intentionally weighted lower because layout transformation reduces keypoint matches.
    score = color * 0.48 + perceptual * 0.24 + structure * 0.28
    return {
        "score": round(min(1.0, max(0.0, score)), 4),
        "passed": bool(score >= GARMENT_THRESHOLD),
        "threshold": GARMENT_THRESHOLD,
        "colorSimilarity": color,
        "perceptualSimilarity": perceptual,
        "structureSimilarity": structure,
        "structureInliers": inliers,
    }


def _detect_face(image: np.ndarray) -> tuple[Any, dict[str, Any]] | None:
    landmarker = _face_landmarker()
    if landmarker is None:
        return None
    from mediapipe import Image as MpImage, ImageFormat

    height, width = image.shape[:2]
    # Full-body images occasionally miss a small face. Try progressively tighter
    # upper-body crops, then translate landmarks back to full-image coordinates.
    crop_heights = [height, int(height * 0.58), int(height * 0.42), int(height * 0.32)]
    for crop_height in crop_heights:
        crop = image[:crop_height]
        rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
        result = landmarker.detect(MpImage(image_format=ImageFormat.SRGB, data=rgb))
        if not result.face_landmarks:
            continue
        landmarks = result.face_landmarks[0]
        crop_h, crop_w = crop.shape[:2]
        points = np.array(
            [[lm.x * crop_w, lm.y * crop_h] for lm in landmarks],
            dtype=np.float32,
        )
        min_x, min_y = np.min(points, axis=0)
        max_x, max_y = np.max(points, axis=0)
        return landmarks, {
            "points": points,
            "box": (float(min_x), float(min_y), float(max_x - min_x), float(max_y - min_y)),
        }
    return None


def _face_geometry_vector(points: np.ndarray) -> np.ndarray:
    selected = points[FACE_POINTS]
    eye_distance = max(1.0, float(np.linalg.norm(points[33] - points[133])))
    face_height = max(1.0, float(np.linalg.norm(points[10] - points[152])))
    values: list[float] = [eye_distance / face_height]
    anchors = [10, 33, 133, 152, 234, 454, 13]
    for index, left in enumerate(anchors):
        for right in anchors[index + 1:]:
            values.append(float(np.linalg.norm(points[left] - points[right])) / eye_distance)
    return np.asarray(values, dtype=np.float32)


def _crop_face(image: np.ndarray, box: tuple[float, float, float, float]) -> np.ndarray:
    h, w = image.shape[:2]
    x, y, bw, bh = box
    x1 = max(0, int(x - bw * 0.18))
    y1 = max(0, int(y - bh * 0.25))
    x2 = min(w, int(x + bw * 1.18))
    y2 = min(h, int(y + bh * 1.25))
    if x2 <= x1 or y2 <= y1:
        return image
    return image[y1:y2, x1:x2]


def _pose_metrics(image: np.ndarray) -> dict[str, float] | None:
    landmarker = _pose_landmarker()
    if landmarker is None:
        return None
    from mediapipe import Image as MpImage, ImageFormat

    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    result = landmarker.detect(MpImage(image_format=ImageFormat.SRGB, data=rgb))
    if not result.pose_landmarks:
        return None
    lm = result.pose_landmarks[0]
    required = [11, 12, 23, 24, 25, 26, 27, 28]
    if any(lm[i].visibility < 0.4 for i in required):
        return None
    h, w = image.shape[:2]
    point = lambda i: np.array([lm[i].x * w, lm[i].y * h])
    shoulder_mid = (point(11) + point(12)) / 2
    hip_mid = (point(23) + point(24)) / 2
    ankle_mid = (point(27) + point(28)) / 2
    torso = float(hip_mid[1] - shoulder_mid[1])
    legs = float(ankle_mid[1] - hip_mid[1])
    shoulder_width = float(np.linalg.norm(point(11) - point(12)))
    hip_width = float(np.linalg.norm(point(23) - point(24)))
    if torso <= 0 or legs <= 0:
        return None
    return {
        "legTorsoRatio": round(legs / torso, 3),
        "legShare": round(legs / (legs + torso), 3),
        "shoulderHipRatio": round(shoulder_width / hip_width, 3) if hip_width else 0.0,
    }


def model_consistency(reference: Path, output: Path) -> dict[str, Any]:
    ref = _load_image(reference)
    generated = _load_image(output)
    ref_face = _detect_face(ref)
    output_face = _detect_face(generated)
    reasons: list[str] = []
    face_geometry = None
    face_appearance = None

    if ref_face is None or output_face is None:
        reasons.append("face_not_detected")
    else:
        ref_vector = _face_geometry_vector(ref_face[1]["points"])
        out_vector = _face_geometry_vector(output_face[1]["points"])
        difference = float(np.mean(np.abs(ref_vector - out_vector)))
        face_geometry = round(max(0.0, min(1.0, 1 - difference / 0.24)), 4)
        if face_geometry < 0.62:
            reasons.append("face_geometry_changed")

        ref_crop = _crop_face(ref, ref_face[1]["box"])
        out_crop = _crop_face(generated, output_face[1]["box"])
        color = _histogram_similarity(ref_crop, out_crop)
        structure, _ = _structure_similarity(ref_crop, out_crop)
        face_appearance = round(color * 0.30 + structure * 0.70, 4)
        if face_appearance < 0.52:
            reasons.append("face_appearance_changed")

    ref_pose = _pose_metrics(ref)
    out_pose = _pose_metrics(generated)
    pose_score = None
    if ref_pose is None or out_pose is None:
        reasons.append("body_landmarks_not_detected")
    else:
        differences = [
            abs(ref_pose[key] - out_pose[key]) / max(abs(ref_pose[key]), 0.1)
            for key in ref_pose
        ]
        average_difference = float(np.mean(differences))
        pose_score = round(max(0.0, min(1.0, 1 - average_difference / 0.30)), 4)
        if pose_score < 0.50:
            reasons.append("body_proportion_changed")

    # Identity is weighted more heavily than body pose; pose can legitimately vary
    # between locked-reference and generated catalogue shots, while face identity cannot.
    components = {
        "geometry": (face_geometry, 0.45),
        "appearance": (face_appearance, 0.40),
        "pose": (pose_score, 0.15),
    }
    available = [(value, weight) for value, weight in components.values() if value is not None]
    if available:
        total_weight = sum(weight for _, weight in available)
        score = sum(value * weight for value, weight in available) / total_weight
    else:
        score = 0.30
    if score < MODEL_THRESHOLD:
        reasons.append("model_identity_score_below_threshold")
    if reasons:
        score = min(score, MODEL_THRESHOLD - 0.01)
    score = round(min(1.0, max(0.0, score)), 4)
    return {
        "score": score,
        "passed": bool(score >= MODEL_THRESHOLD and not reasons),
        "threshold": MODEL_THRESHOLD,
        "faceGeometrySimilarity": face_geometry,
        "faceAppearanceSimilarity": face_appearance,
        "bodyProportionSimilarity": pose_score,
        "referencePose": ref_pose,
        "outputPose": out_pose,
        "reasons": reasons,
    }


def detail_metrics(output: Path) -> dict[str, Any]:
    image = _load_image(output)
    scale = 1024 / max(1, image.shape[1])
    normalized = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    gray = cv2.cvtColor(normalized, cv2.COLOR_BGR2GRAY)
    laplacian = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    edges = float(np.count_nonzero(cv2.Canny(gray, 40, 120))) / gray.size
    blur = cv2.GaussianBlur(gray, (0, 0), 2.0)
    high_frequency = float(np.mean(np.abs(gray.astype(np.float32) - blur.astype(np.float32)))) / 255
    return {
        "normalizedWidth": int(normalized.shape[1]),
        "laplacianVariance": round(laplacian, 3),
        "edgeDensity": round(edges, 5),
        "highFrequencyEnergy": round(high_frequency, 5),
        "sourceWidth": int(image.shape[1]),
        "sourceHeight": int(image.shape[0]),
    }


def lightweight_model_qc() -> dict[str, Any]:
    """Fast report for mock output without loading MediaPipe models."""
    return {
        "score": 0.35,
        "passed": False,
        "threshold": MODEL_THRESHOLD,
        "faceGeometrySimilarity": None,
        "faceAppearanceSimilarity": None,
        "bodyProportionSimilarity": None,
        "referencePose": None,
        "outputPose": None,
        "reasons": ["face_not_detected"],
        "lightweight": True,
    }


def run_consistency_qc(
    output: Path,
    task_type: str,
    garment_reference: Path | None = None,
    model_reference: Path | None = None,
    *,
    enforce: bool = True,
    deep_model_qc: bool = True,
) -> dict[str, Any]:
    report: dict[str, Any] = {
        "schema": QC_SCHEMA,
        "taskType": task_type,
        "output": str(output),
        "enforced": enforce,
        "reasons": [],
    }
    try:
        report["pixel"] = inspect_image(output, expected_size=None)
    except Exception as exc:
        report["pixel"] = {"passed": False, "error": str(exc)}
        report["reasons"].append("pixel_qc_failed")

    if not deep_model_qc:
        # Mock placeholder output is not a garment photograph. Skip ORB matching and
        # keep the report as a lightweight pixel/detail record for UI integration.
        report["garment"] = {
            "score": 1.0,
            "passed": True,
            "threshold": GARMENT_THRESHOLD,
            "colorSimilarity": None,
            "perceptualSimilarity": None,
            "structureSimilarity": None,
            "structureInliers": None,
            "reasons": [],
            "lightweight": True,
        }
    elif garment_reference and garment_reference.is_file():
        report["garment"] = garment_consistency(garment_reference, output)
        if not report["garment"]["passed"]:
            report["reasons"].append("garment_consistency_failed")
    else:
        report["garment"] = {"score": None, "passed": False, "reasons": ["reference_missing"]}

    if task_type == "model":
        if not deep_model_qc:
            # Mock placeholders do not contain a real face. MediaPipe inference is
            # intentionally skipped to keep local UI tests responsive and lightweight.
            report["model"] = lightweight_model_qc()
            report["reasons"].append("model_identity_failed")
        elif model_reference and model_reference.is_file():
            report["model"] = model_consistency(model_reference, output)
            if not report["model"]["passed"]:
                report["reasons"].append("model_identity_failed")
        else:
            report["model"] = {"score": None, "passed": False, "reasons": ["reference_missing"]}
            report["reasons"].append("model_identity_failed")

    try:
        report["detail"] = detail_metrics(output)
    except Exception as exc:
        report["detail"] = {"error": str(exc)}

    scores = [report["garment"]["score"]]
    if task_type == "model":
        scores.append(report["model"]["score"])
    valid_scores = [score for score in scores if score is not None]
    report["score"] = round(float(np.mean(valid_scores)), 4) if valid_scores else 0.0
    report["passed"] = bool(
        report["pixel"].get("passed", False)
        and report["garment"].get("passed", False)
        and (task_type != "model" or report["model"].get("passed", False))
    )
    if not enforce:
        report["enforced"] = False
        report["blockingFailures"] = report["reasons"]
        report["passed"] = True
    return report


def save_qc_report(report: dict[str, Any], output: Path) -> Path:
    path = output.with_suffix(".qc.json")
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return path
