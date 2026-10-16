"""应用配置：开发态读取工程目录，打包态读取 PyInstaller 资源目录。"""
import sys
from pathlib import Path
from pydantic import ConfigDict
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parents[2])).resolve()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="LONGY_", extra="ignore")

    app_name: str = "LongY Studio Sidecar"
    data_dir: Path = PROJECT_ROOT / "storage"
    database_url: str = ""
    log_level: str = "INFO"
    max_concurrency: int = 2
    default_retry_limit: int = 2
    mock_failure_rate: float = 0.0


settings = Settings()
settings.data_dir.mkdir(parents=True, exist_ok=True)
for child in ("projects", "exports", "cache", "thumbnails", "logs", "sqlite"):
    (settings.data_dir / child).mkdir(exist_ok=True)
