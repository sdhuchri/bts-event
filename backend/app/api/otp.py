"""Router OTP WhatsApp."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.services import otp as otp_service

router = APIRouter(prefix="/api/v1/otp", tags=["otp"])


class OtpRequestBody(BaseModel):
    no_hp: str = Field(min_length=8, max_length=20)


class OtpVerifyBody(BaseModel):
    no_hp: str = Field(min_length=8, max_length=20)
    code: str = Field(min_length=4, max_length=8)


@router.post("/request")
async def request_otp(body: OtpRequestBody, db: AsyncSession = Depends(get_db)) -> dict:
    result = await otp_service.request_otp(db, body.no_hp)
    return {"success": True, **result}


@router.post("/verify")
async def verify_otp(body: OtpVerifyBody, db: AsyncSession = Depends(get_db)) -> dict:
    result = await otp_service.verify_otp(db, body.no_hp, body.code)
    return {"success": True, **result}
