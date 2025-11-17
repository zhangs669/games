"""应用配置与环境变量管理。"""

from functools import lru_cache
from pathlib import Path
from typing import Optional

from pydantic import BaseSettings, Field


class Settings(BaseSettings):
    """集中管理应用配置，方便未来扩展。"""

    database_url: str = Field(
        default=f"sqlite:///{Path(__file__).resolve().parent.parent / 'rss.sqlite3'}"
    )
    feed_http_timeout: float = Field(default=20.0, ge=1.0, le=120.0)
    user_agent: str = Field(
        default="RSSPodcaster/1.0 (+https://example.com; contact=admin@example.com)"
    )
    allow_origin: Optional[str] = Field(
        default="*",
        description="如需限制前端来源，可在部署时设置该值。",
    )

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    """提供带缓存的配置实例。"""

    return Settings()

