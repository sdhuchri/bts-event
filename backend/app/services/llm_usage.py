"""Tracing pemakaian LLM (Bedrock): catat tiap panggilan + agregasi.

Token disimpan apa adanya; BIAYA dihitung saat dibaca berdasarkan harga di
config (USD per 1.000 token), supaya perubahan harga ikut terhitung ulang
untuk data historis.
"""
import logging

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.models import LlmUsage

logger = logging.getLogger("bts.llm")
settings = get_settings()


def cost_usd(input_tokens: int | None, output_tokens: int | None) -> float | None:
    """Hitung biaya dari token + harga config. None jika harga belum di-set."""
    pin = settings.llm_price_input_per_1k
    pout = settings.llm_price_output_per_1k
    if pin <= 0 and pout <= 0:
        return None
    cin = (input_tokens or 0) / 1000 * pin
    cout = (output_tokens or 0) / 1000 * pout
    return round(cin + cout, 6)


def cost_idr(usd: float | None) -> float | None:
    """Konversi biaya USD -> Rupiah dengan kurs di config."""
    if usd is None:
        return None
    return round(usd * settings.usd_to_idr, 2)


async def record_usage(
    db: AsyncSession,
    *,
    operation: str,
    model_id: str,
    success: bool,
    input_tokens: int | None = None,
    output_tokens: int | None = None,
    total_tokens: int | None = None,
    latency_ms: int | None = None,
    bedrock_latency_ms: int | None = None,
    error_code: str | None = None,
    confidence: str | None = None,
    image_bytes: int | None = None,
) -> None:
    """Simpan satu baris tracing. Best-effort: kegagalan logging TIDAK
    boleh menggagalkan request OCR utama."""
    if total_tokens is None and (input_tokens is not None or output_tokens is not None):
        total_tokens = (input_tokens or 0) + (output_tokens or 0)
    row = LlmUsage(
        operation=operation,
        model_id=model_id,
        success=success,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=total_tokens,
        latency_ms=latency_ms,
        bedrock_latency_ms=bedrock_latency_ms,
        error_code=error_code,
        confidence=confidence,
        image_bytes=image_bytes,
    )
    try:
        db.add(row)
        await db.commit()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Gagal mencatat llm_usage: %s", exc)
        await db.rollback()


def _to_dict(r: LlmUsage) -> dict:
    usd = cost_usd(r.input_tokens, r.output_tokens)
    return {
        "id": r.id,
        "created_at": r.created_at,
        "operation": r.operation,
        "model_id": r.model_id,
        "input_tokens": r.input_tokens,
        "output_tokens": r.output_tokens,
        "total_tokens": r.total_tokens,
        "latency_ms": r.latency_ms,
        "bedrock_latency_ms": r.bedrock_latency_ms,
        "success": r.success,
        "error_code": r.error_code,
        "confidence": r.confidence,
        "image_bytes": r.image_bytes,
        "cost_usd": usd,
        "cost_idr": cost_idr(usd),
    }


async def list_usage(db: AsyncSession, limit: int = 100) -> list[dict]:
    rows = (
        await db.execute(
            select(LlmUsage).order_by(LlmUsage.created_at.desc()).limit(limit)
        )
    ).scalars().all()
    return [_to_dict(r) for r in rows]


async def summary(db: AsyncSession) -> dict:
    """Agregat keseluruhan untuk kartu ringkasan."""
    row = (
        await db.execute(
            select(
                func.count(LlmUsage.id),
                func.count().filter(LlmUsage.success.is_(True)),
                func.coalesce(func.sum(LlmUsage.input_tokens), 0),
                func.coalesce(func.sum(LlmUsage.output_tokens), 0),
                func.coalesce(func.sum(LlmUsage.total_tokens), 0),
                func.avg(LlmUsage.latency_ms),
            )
        )
    ).one()
    total_calls, ok_calls, in_tok, out_tok, tot_tok, avg_lat = row
    usd = cost_usd(int(in_tok or 0), int(out_tok or 0))
    return {
        "total_calls": int(total_calls or 0),
        "success_calls": int(ok_calls or 0),
        "error_calls": int((total_calls or 0) - (ok_calls or 0)),
        "input_tokens": int(in_tok or 0),
        "output_tokens": int(out_tok or 0),
        "total_tokens": int(tot_tok or 0),
        "avg_latency_ms": round(float(avg_lat), 1) if avg_lat is not None else None,
        "cost_usd": usd,
        "cost_idr": cost_idr(usd),
        "currency": settings.llm_currency,
        "usd_to_idr": settings.usd_to_idr,
    }
