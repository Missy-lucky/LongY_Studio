"""LongY Studio 统一启动入口。

用法：
    python main.py              # 启动完整桌面端：FastAPI + Vite + Electron
    python main.py --web        # 启动浏览器开发模式：FastAPI + Vite
    python main.py --backend    # 只启动 FastAPI 后端
    python main.py --no-backend # 只启动前端/桌面端，假定后端已运行
"""
from __future__ import annotations

import argparse
import atexit
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request

PROJECT_ROOT = Path(__file__).resolve().parent
BACKEND_DIR = PROJECT_ROOT / "backend"
FRONTEND_DIR = PROJECT_ROOT / "frontend"
TEMP_DIR = PROJECT_ROOT / "temp"
STORAGE_DIR = PROJECT_ROOT / "storage"
BACKEND_PYTHON = BACKEND_DIR / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def build_env(port: int) -> dict[str, str]:
    env = os.environ.copy()
    env["LONGY_DATA_DIR"] = str(STORAGE_DIR)
    env["LONGY_MAX_CONCURRENCY"] = env.get("LONGY_MAX_CONCURRENCY", "2")
    env["PYTHONPYCACHEPREFIX"] = str(TEMP_DIR / "cache" / "python")
    env["npm_config_cache"] = str(TEMP_DIR / "cache" / "npm")
    env["NODE_ENV"] = "development"
    env["LONGY_BACKEND_PORT"] = str(port)
    return env


def ensure_dirs() -> None:
    for path in (
        TEMP_DIR / "cache" / "python",
        TEMP_DIR / "cache" / "npm",
        STORAGE_DIR / "logs",
        STORAGE_DIR / "sqlite",
        STORAGE_DIR / "projects",
        STORAGE_DIR / "exports",
    ):
        path.mkdir(parents=True, exist_ok=True)


def backend_dependencies_ok() -> bool:
    if not BACKEND_PYTHON.exists():
        return False
    check = subprocess.run(
        [
            str(BACKEND_PYTHON),
            "-c",
            "import cv2, fastapi, mediapipe, numpy, PIL, pillow_heif, uvicorn; "
            "from mediapipe.tasks.python import vision",
        ],
        cwd=BACKEND_DIR,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return check.returncode == 0


def ensure_backend_env() -> None:
    created = False
    if not BACKEND_PYTHON.exists():
        print("首次运行：创建 Python 虚拟环境...")
        subprocess.run([sys.executable, "-m", "venv", str(BACKEND_DIR / ".venv")], check=True)
        created = True
    if not backend_dependencies_ok():
        print("同步后端依赖...")
        reinstall_args = [] if created else ["--upgrade", "--force-reinstall"]
        subprocess.run(
            [
                str(BACKEND_PYTHON),
                "-m",
                "pip",
                "install",
                *reinstall_args,
                "-r",
                str(BACKEND_DIR / "requirements.txt"),
            ],
            check=True,
        )



def ensure_frontend_env() -> None:
    if (FRONTEND_DIR / "node_modules").exists():
        return
    npm = shutil.which("npm")
    if npm is None:
        raise RuntimeError("未找到 npm，请先安装 Node.js。")
    print("首次运行：安装前端依赖...")
    subprocess.run([npm, "install"], cwd=FRONTEND_DIR, check=True)

def health_ok(port: int) -> bool:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=1.5) as response:
            return response.status == 200
    except (urllib.error.URLError, TimeoutError, OSError):
        return False


def start_backend(port: int, env: dict[str, str]) -> subprocess.Popen | None:
    if health_ok(port):
        print(f"后端已运行：http://127.0.0.1:{port}/api/health")
        return None

    print(f"启动 FastAPI 后端：http://127.0.0.1:{port}/api/health")
    process = subprocess.Popen(
        [
            str(BACKEND_PYTHON),
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
        ],
        cwd=BACKEND_DIR,
        env=env,
    )

    for _ in range(60):
        if process.poll() is not None:
            raise RuntimeError(f"后端进程异常退出，退出码：{process.returncode}")
        if health_ok(port):
            print("后端已就绪。")
            return process
        time.sleep(0.5)

    process.terminate()
    raise RuntimeError("后端启动超时。")


def stop_backend(process: subprocess.Popen | None) -> None:
    if process is None or process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()


def run_frontend(mode: str, env: dict[str, str]) -> int:
    npm = shutil.which("npm")
    if npm is None:
        raise RuntimeError("未找到 npm，请先安装 Node.js。")

    script = "desktop" if mode == "desktop" else "dev"
    print(f"启动前端：npm run {script}")
    return subprocess.run([npm, "run", script], cwd=FRONTEND_DIR, env=env).returncode


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="LongY Studio 启动器")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--web", action="store_true", help="启动浏览器开发模式")
    group.add_argument("--backend", action="store_true", help="只启动 FastAPI 后端")
    group.add_argument("--desktop", action="store_true", help="启动 Electron 桌面端（默认）")
    parser.add_argument("--no-backend", action="store_true", help="不启动后端，假定 8600 已运行")
    parser.add_argument("--port", type=int, default=8600, help="后端端口，默认 8600")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    mode = "backend" if args.backend else ("web" if args.web else "desktop")
    ensure_dirs()

    backend_process: subprocess.Popen | None = None
    atexit.register(lambda: stop_backend(backend_process))
    env = build_env(args.port)

    try:
        if not args.no_backend:
            ensure_backend_env()
            backend_process = start_backend(args.port, env)
        if mode == "backend":
            assert backend_process is not None
            return backend_process.wait()
        ensure_frontend_env()
        return run_frontend(mode, env)
    except KeyboardInterrupt:
        print("\n已停止 LongY Studio。")
        return 130
    finally:
        stop_backend(backend_process)


if __name__ == "__main__":
    raise SystemExit(main())
