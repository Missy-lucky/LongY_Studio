"""Frozen desktop sidecar entrypoint."""
from __future__ import annotations

import os

import uvicorn

from app.main import app


def main() -> None:
    port = int(os.getenv("LONGY_BACKEND_PORT", "8600"))
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=port,
        log_level=os.getenv("LONGY_LOG_LEVEL", "info").lower(),
        access_log=False,
    )


if __name__ == "__main__":
    main()
