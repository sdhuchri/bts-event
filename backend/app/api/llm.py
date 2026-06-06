"""Router tracing pemakaian LLM (Bedrock): ringkasan + daftar panggilan."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.services import llm_usage

router = APIRouter(prefix="/api/v1/llm", tags=["llm"])


@router.get("/usage")
async def get_usage(
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Ringkasan agregat + daftar panggilan LLM terbaru (default 100)."""
    return {
        "summary": await llm_usage.summary(db),
        "items": await llm_usage.list_usage(db, limit=limit),
    }
