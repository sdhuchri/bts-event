"""Logika OTP: generate, simpan, kirim via wa-gateway (Baileys), verifikasi."""
import hashlib
import logging
import re
import secrets
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import errors
from app.core.config import get_settings
from app.db.models import OtpCode

logger = logging.getLogger("bts.otp")
settings = get_settings()


def normalize_phone(raw: str) -> str:
    """Samakan format nomor -> '+62XXXXXXXX' agar konsisten antar request."""
    d = re.sub(r"\D", "", raw or "")
    if d.startswith("0"):
        d = "62" + d[1:]
    elif not d.startswith("62"):
        d = "62" + d
    return "+" + d


def _hash(no_hp: str, code: str) -> str:
    return hashlib.sha256(f"{no_hp}:{code}".encode()).hexdigest()


def _generate_code() -> str:
    return f"{secrets.randbelow(10 ** settings.otp_length):0{settings.otp_length}d}"


async def _send_wa(no_hp: str, message: str) -> None:
    """Kirim pesan teks lewat wa-gateway. Map error ke envelope API."""
    url = f"{settings.wa_gateway_url.rstrip('/')}/send"
    headers = {"x-api-key": settings.wa_gateway_api_key}
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                url, json={"to": no_hp, "message": message}, headers=headers
            )
    except httpx.HTTPError as exc:
        logger.error("wa-gateway tak terjangkau: %s", exc)
        raise errors.OcrError(
            "WA_ERROR", "Gagal terhubung ke WhatsApp gateway.", status_code=502
        ) from exc

    if resp.status_code == 503:
        raise errors.OcrError(
            "WA_NOT_CONNECTED",
            "WhatsApp gateway belum tertaut. Scan QR di /qr dulu.",
            status_code=503,
        )
    if resp.status_code != 200:
        logger.error("wa-gateway error %s: %s", resp.status_code, resp.text[:200])
        raise errors.OcrError("WA_ERROR", "Gagal mengirim pesan WhatsApp.", status_code=502)


async def request_otp(db: AsyncSession, raw_no_hp: str) -> dict:
    no_hp = normalize_phone(raw_no_hp)
    now = datetime.now(timezone.utc)

    # Cooldown kirim ulang.
    latest = (
        await db.execute(
            select(OtpCode)
            .where(OtpCode.no_hp == no_hp)
            .order_by(OtpCode.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if latest is not None:
        elapsed = (now - latest.created_at).total_seconds()
        wait = settings.otp_resend_cooldown_seconds - elapsed
        if wait > 0:
            raise errors.OcrError(
                "RATE_LIMITED",
                f"Tunggu {int(wait)} detik sebelum minta kode lagi.",
                status_code=429,
            )

    code = _generate_code()
    row = OtpCode(
        no_hp=no_hp,
        code_hash=_hash(no_hp, code),
        expires_at=now + timedelta(minutes=settings.otp_expiry_minutes),
    )
    db.add(row)
    await db.flush()  # simpan dulu, tapi commit hanya jika kirim sukses

    message = (
        f"*Event BTS* — Kode verifikasi kamu: *{code}*\n"
        f"Berlaku {settings.otp_expiry_minutes} menit. "
        "Jangan bagikan kode ini ke siapa pun."
    )
    await _send_wa(no_hp, message)

    await db.commit()
    return {"no_hp": no_hp, "expires_in": settings.otp_expiry_minutes * 60}


async def verify_otp(db: AsyncSession, raw_no_hp: str, code: str) -> dict:
    no_hp = normalize_phone(raw_no_hp)
    now = datetime.now(timezone.utc)

    row = (
        await db.execute(
            select(OtpCode)
            .where(OtpCode.no_hp == no_hp, OtpCode.verified.is_(False))
            .order_by(OtpCode.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    if row is None:
        raise errors.OcrError(
            "OTP_INVALID", "Kode tidak ditemukan. Minta kode baru.", status_code=400
        )
    if row.expires_at < now:
        raise errors.OcrError(
            "OTP_EXPIRED", "Kode kedaluwarsa. Minta kode baru.", status_code=400
        )
    if row.attempts >= settings.otp_max_attempts:
        raise errors.OcrError(
            "OTP_TOO_MANY",
            "Terlalu banyak percobaan. Minta kode baru.",
            status_code=429,
        )

    row.attempts += 1
    if _hash(no_hp, code.strip()) != row.code_hash:
        remaining = max(0, settings.otp_max_attempts - row.attempts)
        await db.commit()
        raise errors.OcrError(
            "OTP_INVALID", f"Kode salah. Sisa percobaan: {remaining}.", status_code=400
        )

    row.verified = True
    await db.commit()
    return {"no_hp": no_hp, "verified": True}


async def has_verified_otp(db: AsyncSession, no_hp: str) -> bool:
    """Cek ada OTP terverifikasi untuk nomor ini dalam window terakhir."""
    cutoff = datetime.now(timezone.utc) - timedelta(
        minutes=settings.otp_verify_window_minutes
    )
    row = (
        await db.execute(
            select(OtpCode.id)
            .where(
                OtpCode.no_hp == no_hp,
                OtpCode.verified.is_(True),
                OtpCode.created_at >= cutoff,
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    return row is not None
