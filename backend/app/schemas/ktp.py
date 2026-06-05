"""Pydantic models untuk data KTP dan envelope API."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

# Daftar field KTP yang diekstrak (urutan = urutan tampil di form).
KTP_FIELDS: tuple[str, ...] = (
    "nik",
    "nama",
    "tempat_lahir",
    "tanggal_lahir",
    "jenis_kelamin",
    "golongan_darah",
    "alamat",
    "rt_rw",
    "kelurahan_desa",
    "kecamatan",
    "agama",
    "status_perkawinan",
    "pekerjaan",
    "kewarganegaraan",
    "berlaku_hingga",
    "provinsi",
    "kabupaten_kota",
)

Confidence = Literal["high", "medium", "low"]


class KtpData(BaseModel):
    """17 field hasil ekstraksi KTP. Semua opsional (null = tidak terbaca)."""

    nik: str | None = None
    nama: str | None = None
    tempat_lahir: str | None = None
    tanggal_lahir: str | None = Field(default=None, description="DD-MM-YYYY")
    jenis_kelamin: str | None = Field(default=None, description="LAKI-LAKI / PEREMPUAN")
    golongan_darah: str | None = Field(default=None, description="A/B/AB/O/-")
    alamat: str | None = None
    rt_rw: str | None = Field(default=None, description="RRR/RWW")
    kelurahan_desa: str | None = None
    kecamatan: str | None = None
    agama: str | None = None
    status_perkawinan: str | None = None
    pekerjaan: str | None = None
    kewarganegaraan: str | None = Field(default=None, description="WNI/WNA")
    berlaku_hingga: str | None = Field(default=None, description="SEUMUR HIDUP / tanggal")
    provinsi: str | None = None
    kabupaten_kota: str | None = None


class OcrResult(BaseModel):
    """Hasil internal dari service OCR."""

    data: KtpData
    confidence: Confidence = "low"
    raw_text: str = ""


class OcrSuccessResponse(BaseModel):
    success: Literal[True] = True
    data: KtpData
    confidence: Confidence
    raw_text: str


class ApiError(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    success: Literal[False] = False
    error: ApiError


class OcrBase64Request(BaseModel):
    """Request alternatif: kirim gambar sebagai base64 (boleh dengan data URL prefix)."""

    image_base64: str


# ── Record (data tersimpan di DB) ──────────────────────────────────


class RecordCreate(KtpData):
    """Body untuk menyimpan hasil OCR yang sudah dikoreksi user."""

    confidence: Confidence | None = None
    raw_text: str | None = None


class RecordUpdate(KtpData):
    confidence: Confidence | None = None


class RecordOut(KtpData):
    id: str
    confidence: Confidence | None = None
    raw_text: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
