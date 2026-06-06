"""FastAPI app — OCR KTP (Event BTS)."""
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import ocr, otp, records
from app.core.config import get_settings
from app.core.errors import OcrError
from app.db.database import init_db

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("bts")
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # PENTING: jangan biarkan koneksi DB memblokir startup (healthcheck Railway).
    # Beri timeout ketat; kalau DB belum siap, app tetap up & /health tetap jalan.
    try:
        await asyncio.wait_for(init_db(), timeout=10)
        logger.info("DB siap (tabel ter-init).")
    except (Exception, asyncio.TimeoutError) as exc:  # noqa: BLE001
        # Prototype: jangan crash kalau DB belum siap; OCR tetap jalan.
        logger.error("Init DB dilewati (app tetap jalan): %s", exc)
    if not settings.bedrock_configured:
        logger.warning("AWS credentials BELUM di-set — endpoint OCR akan menolak request.")
    yield


app = FastAPI(
    title="OCR KTP — Event BTS",
    version="1.0.0",
    description="Prototype OCR KTP via AWS Bedrock.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(OcrError)
async def ocr_error_handler(_: Request, exc: OcrError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "error": {"code": exc.code, "message": exc.message}},
    )


@app.exception_handler(RequestValidationError)
async def validation_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={
            "success": False,
            "error": {"code": "INVALID_FILE", "message": "Request tidak valid.", "detail": exc.errors()},
        },
    )


@app.get("/api/v1/health", tags=["health"])
async def health() -> dict:
    return {"status": "ok"}


app.include_router(ocr.router)
app.include_router(otp.router)
app.include_router(records.router)
