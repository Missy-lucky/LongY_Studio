import os
import shutil
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "temp" / "tests" / "backend-data"

# Set the data directory before application modules are imported. All backend
# test modules share one isolated SQLite database and one session lifecycle.
os.environ["LONGY_DATA_DIR"] = str(DATA_DIR)
os.environ.setdefault("LONGY_MAX_CONCURRENCY", "2")
os.environ.setdefault("LONGY_MOCK_FAILURE_RATE", "0")


@pytest.fixture(scope="session", autouse=True)
def isolated_backend_data():
    if DATA_DIR.exists():
        shutil.rmtree(DATA_DIR)
    (DATA_DIR / "sqlite").mkdir(parents=True, exist_ok=True)
    yield
    shutil.rmtree(DATA_DIR, ignore_errors=True)
