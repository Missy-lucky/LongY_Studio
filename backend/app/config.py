"""应用配置：所有运行数据默认限制在项目 storage/ 目录内。"""
from pathlib import Path
from pydantic import ConfigDict
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[2]


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
