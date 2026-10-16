import sqlite3

from backend.app.queue.worker import _garment_reference_paths
from backend.app.services.outfit_fallbacks import resolve_outfit_fallbacks


TOP_FALLBACK = "asset-library/default-garments/neutral-sports-camisole.png"
SHORTS_FALLBACK = "asset-library/default-garments/neutral-sports-shorts.png"


def _db(items: list[tuple[str, str, str, str]], assets: list[tuple[str, str, str, str]]):
    db = sqlite3.connect(":memory:")
    db.row_factory = sqlite3.Row
    db.executescript(
        """
        CREATE TABLE items(
          id TEXT PRIMARY KEY, project_id TEXT, category_id TEXT, created_at TEXT
        );
        CREATE TABLE assets(
          id TEXT PRIMARY KEY, item_id TEXT, file_path TEXT, created_at TEXT
        );
        """
    )
    db.executemany("INSERT INTO items VALUES(?,?,?,?)", items)
    db.executemany("INSERT INTO assets VALUES(?,?,?,?)", assets)
    return db


def test_model_display_uses_bounded_whole_outfit_with_primary_first():
    db = _db(
        [("top", "p1", "top", "1"), ("pants", "p1", "pants", "2"),
         ("other", "p2", "coat", "1")],
        [("t1", "top", "top-front.png", "1"), ("t2", "top", "top-back.png", "2"),
         ("t3", "top", "top-detail.png", "3"), ("p1", "pants", "pants-front.png", "1"),
         ("p2", "pants", "pants-back.png", "2"), ("o1", "other", "other.png", "1")],
    )
    task = {"item_id": "top", "project_id": "p1", "type": "model"}
    target, outfit = _garment_reference_paths(db, task)
    assert target == ["top-front.png", "top-back.png", "top-detail.png"]
    assert outfit == ["top-front.png", "top-back.png", "pants-front.png", "pants-back.png"]


def test_partial_top_adds_real_yoga_shorts_reference():
    db = _db(
        [("top", "p1", "top", "1")],
        [("t1", "top", "top.png", "1")],
    )
    task = {"item_id": "top", "project_id": "p1", "type": "partial"}
    target, references = _garment_reference_paths(db, task)
    assert target == ["top.png"]
    assert references == ["top.png", SHORTS_FALLBACK]


def test_model_pants_adds_crop_tank_but_not_shorts():
    db = _db(
        [("pants", "p1", "pants", "1")],
        [("p1", "pants", "pants.png", "1")],
    )
    task = {"item_id": "pants", "project_id": "p1", "type": "model"}
    _, references = _garment_reference_paths(db, task)
    assert references == ["pants.png", TOP_FALLBACK]


def test_outerwear_only_adds_both_base_layers():
    db = _db(
        [("coat", "p1", "coat", "1")],
        [("c1", "coat", "coat.png", "1")],
    )
    task = {"item_id": "coat", "project_id": "p1", "type": "model"}
    _, references = _garment_reference_paths(db, task)
    assert references == ["coat.png", TOP_FALLBACK, SHORTS_FALLBACK]


def test_flat_and_detail_never_receive_default_garments():
    db = _db(
        [("top", "p1", "top", "1")],
        [("t1", "top", "top.png", "1")],
    )
    for task_type in ("flat", "detail"):
        task = {"item_id": "top", "project_id": "p1", "type": task_type}
        target, references = _garment_reference_paths(db, task)
        assert target == references == ["top.png"]


def test_dress_counts_as_both_upper_and_lower_base():
    assert resolve_outfit_fallbacks(["dress"]) == []


def test_reference_budget_reserves_fallbacks_inside_ten_garment_slots():
    items = [("coat", "p1", "coat", "1")]
    assets = [(f"a{i}", "coat", f"coat-{i}.png", f"{i:02}") for i in range(12)]
    db = _db(items, assets)
    task = {"item_id": "coat", "project_id": "p1", "type": "partial"}
    target, references = _garment_reference_paths(db, task)
    assert len(target) == 12
    assert len(references) == 10
    assert references[-2:] == [TOP_FALLBACK, SHORTS_FALLBACK]


def test_seedream_budget_reserves_identity_and_style_inside_ten_total_slots():
    items = [("coat", "p1", "coat", "1")]
    assets = [(f"a{i}", "coat", f"coat-{i}.png", f"{i:02}") for i in range(12)]
    db = _db(items, assets)
    task = {
        "item_id": "coat", "project_id": "p1", "type": "partial",
        "provider": "volcengine-ark",
    }
    _, references = _garment_reference_paths(db, task)
    assert len(references) == 8
    assert references[-2:] == [TOP_FALLBACK, SHORTS_FALLBACK]
