import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
os.environ["LONGY_DATA_DIR"] = str(ROOT / "temp" / "tests" / f"backend-data-{os.getpid()}")
os.environ.setdefault("LONGY_MAX_CONCURRENCY", "2")
os.environ.setdefault("LONGY_MOCK_FAILURE_RATE", "0")
