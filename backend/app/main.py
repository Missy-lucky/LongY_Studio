"""LongY Studio 本地服务入口。"""
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from .database import init_db
from .services.library_loader import load_asset_library
from .routers import assets, exports, items, library, projects, tasks


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
