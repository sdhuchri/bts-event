"""Konfigurasi aplikasi dari environment variables."""
from functools import lru_cache

from pydantic import field_validator
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

    # Harga LLM (untuk kolom biaya di tabel tracing). Isi sesuai harga model
    # Bedrock yang dipakai, dalam USD per 1.000 token. 0 = biaya tidak dihitung
    # (kolom biaya tampil "—"). Diterapkan saat baca, jadi ubah harga →
    # biaya historis ikut terhitung ulang.
    llm_price_input_per_1k: float = 0.0
    llm_price_output_per_1k: float = 0.0
    llm_currency: str = "USD"

    # Database
    database_url: str = (
        "postgresql+asyncpg://nalarx:nalarx_secret@host.docker.internal:5432/bts_event"
    )

    # API publik untuk konsumer eksternal (native mobile app) — X-API-Key.
    # Bisa lebih dari satu key (dipisah koma) untuk rotasi / multi-app.
    ext_api_keys: str = ""

    # WhatsApp gateway (Baileys) + OTP
    wa_gateway_url: str = "http://wa-gateway:3000"
    wa_gateway_api_key: str = ""
    otp_length: int = 6
    otp_expiry_minutes: int = 5
    otp_max_attempts: int = 5
    otp_resend_cooldown_seconds: int = 60
    # Window (menit) verified-OTP masih valid untuk menyimpan record.
    otp_verify_window_minutes: int = 30

    # CORS
    cors_origins: str = "http://localhost:3002,http://127.0.0.1:3002"

    @field_validator("database_url")
    @classmethod
    def _normalize_db_url(cls, v: str) -> str:
        """Railway/Heroku memberi `postgres://` atau `postgresql://`.
        SQLAlchemy async butuh driver `postgresql+asyncpg://`."""
        if v.startswith("postgres://"):
            v = "postgresql://" + v[len("postgres://") :]
        if v.startswith("postgresql://"):
            v = "postgresql+asyncpg://" + v[len("postgresql://") :]
        # asyncpg tidak paham query param libpq seperti ?sslmode=...
        if "+asyncpg" in v and "sslmode=" in v:
            from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

            parts = urlsplit(v)
            q = [(k, val) for k, val in parse_qsl(parts.query) if k != "sslmode"]
            v = urlunsplit(parts._replace(query=urlencode(q)))
        return v

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def ext_api_keys_list(self) -> list[str]:
        return [k.strip() for k in self.ext_api_keys.split(",") if k.strip()]

    @property
    def max_file_size_bytes(self) -> int:
        return self.max_file_size_mb * 1024 * 1024

    @property
    def bedrock_configured(self) -> bool:
        return bool(self.aws_access_key_id and self.aws_secret_access_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
