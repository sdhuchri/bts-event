"""Router OCR KTP."""
import base64
import binascii
import logging

from fastapi import APIRouter, File, Request, UploadFile

from app.core import errors
from app.core.config import get_settings
from app.schemas.ktp import OcrBase64Request, OcrSuccessResponse
from app.services.bedrock_ocr import run_ocr

logger = logging.getLogger("bts.api")
router = APIRouter(prefix="/api/v1", tags=["ocr"])
settings = get_settings()

_ALLOWED_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp"}


def _decode_base64(image_base64: str) -> bytes:
    # Buang prefix data URL bila ada: "data:image/jpeg;base64,...."
    payload = image_base64.split(",", 1)[1] if image_base64.startswith("data:") else image_base64
    try:
        return base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise errors.invalid_file("String base64 tidak valid.") from exc


def _guard_size(raw: bytes) -> None:
    if len(raw) == 0:
        raise errors.invalid_file("File kosong.")
    if len(raw) > settings.max_file_size_bytes:
        raise errors.file_too_large(
            f"Ukuran gambar melebihi batas {settings.max_file_size_mb}MB."
        )


@router.post("/ocr/ktp", response_model=OcrSuccessResponse)
async def ocr_ktp(
    request: Request,
    file: UploadFile | None = File(default=None),
) -> OcrSuccessResponse:
    """Terima gambar via multipart (`file`) ATAU JSON {image_base64}."""
    raw: bytes

    if file is not None:
        if file.content_type and file.content_type.lower() not in _ALLOWED_TYPES:
            raise errors.invalid_file(
                f"Tipe file '{file.content_type}' tidak didukung. Pakai jpg/png/webp."
            )
        raw = await file.read()
    else:
        # Tidak ada file -> coba JSON base64.
        if "application/json" not in (request.headers.get("content-type") or ""):
            raise errors.invalid_file("Sertakan 'file' (multipart) atau JSON {image_base64}.")
        try:
            body = await request.json()
        except Exception as exc:  # noqa: BLE001
            raise errors.invalid_file("Body JSON tidak valid.") from exc
        payload = OcrBase64Request(**body)
        raw = _decode_base64(payload.image_base64)

    _guard_size(raw)

    # run_ocr sinkron (boto3) -> jalankan di threadpool agar tidak blok event loop.
    from anyio import to_thread

    result = await to_thread.run_sync(run_ocr, raw)

    return OcrSuccessResponse(
        data=result.data,
        confidence=result.confidence,
        raw_text=result.raw_text,
    )
