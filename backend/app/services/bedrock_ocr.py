"""Logic OCR KTP: olah gambar + panggil AWS Bedrock (Converse API) + parse JSON."""
import io
import json
import logging
import re
from functools import lru_cache

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from PIL import Image, UnidentifiedImageError

from app.core import errors
from app.core.config import get_settings
from app.schemas.ktp import KTP_FIELDS, KtpData, OcrResult

logger = logging.getLogger("bts.ocr")
settings = get_settings()

_VALID_CONFIDENCE = {"high", "medium", "low"}

# Prompt: minta model balas JSON saja, jangan mengarang, null kalau tak terbaca.
_PROMPT = (
    "Kamu adalah mesin OCR untuk KTP (Kartu Tanda Penduduk) Indonesia. "
    "Ekstrak data dari gambar KTP berikut menjadi JSON.\n\n"
    "Aturan ketat:\n"
    "1. Balas HANYA satu objek JSON valid. Tanpa teks pembuka/penutup, tanpa markdown, tanpa code fence.\n"
    "2. Jika sebuah field tidak terbaca atau tidak ada, isi dengan null. JANGAN mengarang/menebak.\n"
    "3. Pertahankan huruf KAPITAL sebagaimana tertulis di KTP.\n"
    "4. Format tanggal_lahir: DD-MM-YYYY.\n"
    "5. rt_rw format: 'RRR/RWW' (contoh '001/002').\n"
    "6. jenis_kelamin: 'LAKI-LAKI' atau 'PEREMPUAN'.\n"
    "7. kewarganegaraan: 'WNI' atau 'WNA'.\n"
    "8. provinsi & kabupaten_kota diambil dari teks header KTP (paling atas).\n"
    "9. Jika gambar jelas BUKAN KTP Indonesia, balas: {\"error\": \"NOT_KTP\"}.\n\n"
    "Sertakan juga field 'confidence' dengan nilai 'high' | 'medium' | 'low' "
    "yang menggambarkan keyakinan keterbacaan keseluruhan.\n\n"
    "Skema field yang harus ada (gunakan null bila kosong):\n"
    + json.dumps(
        {f: None for f in KTP_FIELDS} | {"confidence": "high|medium|low"},
        ensure_ascii=False,
        indent=2,
    )
)


def preprocess_image(raw: bytes) -> tuple[bytes, str]:
    """Validasi + resize/kompres gambar. Return (jpeg_bytes, format='jpeg')."""
    try:
        img = Image.open(io.BytesIO(raw))
        img.load()
    except (UnidentifiedImageError, OSError) as exc:
        raise errors.invalid_file("Gambar tidak bisa dibaca / format tidak didukung.") from exc

    # Buang alpha/mode aneh -> RGB agar aman disimpan sebagai JPEG.
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")

    # Resize agar sisi terpanjang <= MAX_IMAGE_DIMENSION (hemat token).
    max_dim = settings.max_image_dimension
    if max(img.size) > max_dim:
        ratio = max_dim / max(img.size)
        new_size = (round(img.width * ratio), round(img.height * ratio))
        img = img.resize(new_size, Image.Resampling.LANCZOS)

    out = io.BytesIO()
    img.save(out, format="JPEG", quality=85, optimize=True)
    return out.getvalue(), "jpeg"


def _strip_json(text: str) -> str:
    """Buang code fence ```json ... ``` dan ambil objek JSON pertama."""
    t = text.strip()
    t = re.sub(r"^```(?:json)?\s*", "", t)
    t = re.sub(r"\s*```$", "", t)
    # Ambil dari kurung kurawal pertama sampai terakhir (jaga-jaga ada preamble).
    start, end = t.find("{"), t.rfind("}")
    if start != -1 and end != -1 and end > start:
        t = t[start : end + 1]
    return t.strip()


def _parse_response(text: str) -> OcrResult:
    cleaned = _strip_json(text)
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        logger.warning("OCR JSON parse gagal: %s", exc)
        raise errors.ocr_failed(
            "Hasil OCR tidak bisa diparse. Coba foto ulang lebih jelas."
        ) from exc

    if not isinstance(parsed, dict):
        raise errors.ocr_failed("Format hasil OCR tidak sesuai.")

    if parsed.get("error") == "NOT_KTP":
        raise errors.ocr_failed("Gambar terbaca bukan sebagai KTP.")

    confidence = str(parsed.get("confidence", "low")).lower()
    if confidence not in _VALID_CONFIDENCE:
        confidence = "low"

    # Ambil hanya field yang dikenal, normalisasi string kosong -> None.
    cleaned_fields: dict[str, str | None] = {}
    for field in KTP_FIELDS:
        value = parsed.get(field)
        if value is None:
            cleaned_fields[field] = None
        else:
            s = str(value).strip()
            cleaned_fields[field] = s or None

    return OcrResult(
        data=KtpData(**cleaned_fields),
        confidence=confidence,  # type: ignore[arg-type]
        raw_text=text,
    )


@lru_cache(maxsize=1)
def _bedrock_client():
    # Tanpa argumen -> client dibuat SEKALI lalu dipakai ulang (boto3 client
    # thread-safe, aman di-share antar request OCR yang jalan paralel di
    # threadpool). Hemat CPU saat ramai; tak ada state per-request di sini.
    cfg = Config(
        region_name=settings.aws_region,
        retries={"max_attempts": 2, "mode": "standard"},
        read_timeout=60,
        connect_timeout=10,
    )
    kwargs: dict = {"config": cfg}
    if settings.bedrock_configured:
        kwargs.update(
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
        )
        if settings.aws_session_token:
            kwargs["aws_session_token"] = settings.aws_session_token
    return boto3.client("bedrock-runtime", **kwargs)


def run_ocr(raw_image: bytes) -> OcrResult:
    """Jalankan OCR KTP penuh: preprocess -> Bedrock Converse -> parse."""
    if not settings.bedrock_configured:
        raise errors.bedrock_error(
            "AWS credentials belum di-set. Isi AWS_ACCESS_KEY_ID & "
            "AWS_SECRET_ACCESS_KEY di backend/.env."
        )

    image_bytes, img_format = preprocess_image(raw_image)
    client = _bedrock_client()

    try:
        response = client.converse(
            modelId=settings.bedrock_model_id,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"image": {"format": img_format, "source": {"bytes": image_bytes}}},
                        {"text": _PROMPT},
                    ],
                }
            ],
            inferenceConfig={"maxTokens": 2048, "temperature": 0.0},
        )
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "")
        logger.error("Bedrock ClientError: %s", code)
        if code in ("ThrottlingException", "TooManyRequestsException"):
            raise errors.rate_limited() from exc
        raise errors.bedrock_error(f"Bedrock error: {code or 'unknown'}") from exc
    except BotoCoreError as exc:
        logger.error("Bedrock BotoCoreError: %s", exc)
        raise errors.bedrock_error("Gagal terhubung ke Bedrock.") from exc

    try:
        text = response["output"]["message"]["content"][0]["text"]
    except (KeyError, IndexError, TypeError) as exc:
        logger.error("Bentuk respons Bedrock tak terduga: %s", exc)
        raise errors.bedrock_error("Respons Bedrock tidak sesuai.") from exc

    return _parse_response(text)
