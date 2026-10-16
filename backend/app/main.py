"""LongY Studio 本地服务入口。"""
from contextlib import asynccontextmanager
import os
from pathlib import Path
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from .database import init_db
from .services.library_loader import load_asset_library
from .routers import assets, care, exports, items, library, projects, provider_settings, references, tasks


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    load_asset_library()
    yield

app = FastAPI(title="LongY Studio Sidecar", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "tauri://localhost"],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)
app.include_router(library.router, prefix="/api/library", tags=["library"])
app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(provider_settings.router, prefix="/api/provider-settings", tags=["providers"])
app.include_router(references.router, prefix="/api/projects/{project_id}", tags=["references"])
app.include_router(care.router, prefix="/api/projects/{project_id}/care-cards", tags=["care"])
app.include_router(assets.router, prefix="/api/projects/{project_id}/assets", tags=["assets"])
app.include_router(items.router, prefix="/api/projects/{project_id}/items", tags=["items"])
app.include_router(tasks.router, prefix="/api/projects/{project_id}/tasks", tags=["tasks"])
app.include_router(exports.router, prefix="/api/projects/{project_id}/exports", tags=["exports"])


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "service": "longy-sidecar", "version": "0.1.0"}


@app.get("/api/providers")
def providers() -> dict:
    from .providers import list_providers
    return {"providers": list_providers()}


@app.websocket("/ws/events/{project_id}")
async def event_stream(ws: WebSocket, project_id: str) -> None:
    await ws.accept()
    await ws.send_json({"type": "connected", "projectId": project_id})
    try:
        while True:
            await ws.receive_text()
    except Exception:
        pass


# The packaged desktop app points this at resources/web. Keeping the mount
# opt-in preserves Vite's development proxy and makes the sidecar independently
# testable without coupling ordinary backend runs to a frontend build.
frontend_dir_value = os.getenv("LONGY_FRONTEND_DIR", "").strip()
if frontend_dir_value:
    frontend_dir = Path(frontend_dir_value).resolve()
    if frontend_dir.is_dir() and (frontend_dir / "index.html").is_file():
        app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
