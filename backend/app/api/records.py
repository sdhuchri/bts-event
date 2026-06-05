"""Router CRUD record KTP tersimpan (DB Postgres)."""
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.db.models import KtpRecord
from app.schemas.ktp import KTP_FIELDS, RecordCreate, RecordOut, RecordUpdate

logger = logging.getLogger("bts.api")
router = APIRouter(prefix="/api/v1/records", tags=["records"])


async def _get_or_404(db: AsyncSession, record_id: str) -> KtpRecord:
    obj = await db.get(KtpRecord, record_id)
    if obj is None:
        raise HTTPException(status_code=404, detail="Record tidak ditemukan.")
    return obj


@router.post("", response_model=RecordOut, status_code=201)
async def create_record(
    payload: RecordCreate, db: AsyncSession = Depends(get_db)
) -> KtpRecord:
    """Simpan hasil OCR yang sudah dikoreksi user."""
    data = payload.model_dump()
    obj = KtpRecord(**data)
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.get("", response_model=list[RecordOut])
async def list_records(
    limit: int = Query(default=50, le=200, ge=1),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> list[KtpRecord]:
    stmt = (
        select(KtpRecord)
        .order_by(KtpRecord.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.get("/{record_id}", response_model=RecordOut)
async def get_record(record_id: str, db: AsyncSession = Depends(get_db)) -> KtpRecord:
    return await _get_or_404(db, record_id)


@router.put("/{record_id}", response_model=RecordOut)
async def update_record(
    record_id: str, payload: RecordUpdate, db: AsyncSession = Depends(get_db)
) -> KtpRecord:
    obj = await _get_or_404(db, record_id)
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        # Hanya field KTP + confidence yang boleh di-update.
        if key in KTP_FIELDS or key == "confidence":
            setattr(obj, key, value)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/{record_id}", status_code=204)
async def delete_record(record_id: str, db: AsyncSession = Depends(get_db)) -> None:
    obj = await _get_or_404(db, record_id)
    await db.delete(obj)
    await db.commit()
