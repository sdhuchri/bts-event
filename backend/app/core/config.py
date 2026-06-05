"""Konfigurasi aplikasi dari environment variables."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # AWS Bedrock
    aws_region: str = "ap-southeast-3"
    bedrock_model_id: str = "apac.anthropic.claude-3-5-sonnet-20241022-v2:0"
    aws_access_key_id: str | None = None
    aws_secret_access_key: str | None = None
    aws_session_token: str | None = None

    # Upload / OCR
    max_file_size_mb: int = 5
    max_image_dimension: int = 1600

    # Database
    database_url: str = (
        "postgresql+asyncpg://nalarx:nalarx_secret@host.docker.internal:5432/bts_event"
    )

    # CORS
    cors_origins: str = "http://localhost:3002,http://127.0.0.1:3002"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def max_file_size_bytes(self) -> int:
        return self.max_file_size_mb * 1024 * 1024

    @property
    def bedrock_configured(self) -> bool:
        return bool(self.aws_access_key_id and self.aws_secret_access_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
