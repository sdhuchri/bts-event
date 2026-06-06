"""API publik untuk konsumer eksternal (native mobile app).

Semua endpoint di sini WAJIB header `X-API-Key` yang valid (lihat EXT_API_KEYS).
Berbeda dari router /api/v1/otp/* yang dipakai frontend browser (CORS-only).
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_api_key
from app.db.database import get_db
from app.services import otp as otp_service

router = APIRouter(
    prefix="/api/v1/ext",
    tags=["ext (mobile)"],
    dependencies=[Depends(require_api_key)],
)


class OtpRequestBody(BaseModel):
    no_hp: str = Field(min_length=8, max_length=20, description="Nomor HP, mis. +6281234567890")


class OtpVerifyBody(BaseModel):
    no_hp: str = Field(min_length=8, max_length=20)
    code: str = Field(min_length=4, max_length=8, description="Kode OTP dari WhatsApp")


@router.post("/otp/request")
async def ext_request_otp(
    body: OtpRequestBody, db: AsyncSession = Depends(get_db)
) -> dict:
    """Kirim / kirim ulang OTP ke WhatsApp nomor tsb (rate-limited)."""
    result = await otp_service.request_otp(db, body.no_hp)
    return {"success": True, **result}


@router.post("/otp/verify")
async def ext_verify_otp(
    body: OtpVerifyBody, db: AsyncSession = Depends(get_db)
) -> dict:
    """Verifikasi kode OTP. 200 + verified:true bila benar; 4xx bila salah/expired."""
    result = await otp_service.verify_otp(db, body.no_hp, body.code)
    return {"success": True, **result}
