"""Auth untuk API publik (konsumer eksternal / mobile) via X-API-Key."""
import hmac

from fastapi import Header

from app.core import errors
from app.core.config import get_settings

settings = get_settings()


def _valid_key(provided: str) -> bool:
    # Bandingkan konstan-waktu terhadap daftar key yang dikonfigurasi.
    return any(hmac.compare_digest(provided, k) for k in settings.ext_api_keys_list)


async def require_api_key(x_api_key: str | None = Header(default=None)) -> str:
    """Dependency: tolak request tanpa X-API-Key yang valid."""
    if not settings.ext_api_keys_list:
        raise errors.OcrError(
            "API_NOT_CONFIGURED",
            "API publik belum dikonfigurasi (EXT_API_KEYS kosong).",
            status_code=503,
        )
    if not x_api_key or not _valid_key(x_api_key):
        raise errors.OcrError(
            "UNAUTHORIZED", "X-API-Key tidak valid atau hilang.", status_code=401
        )
    return x_api_key
