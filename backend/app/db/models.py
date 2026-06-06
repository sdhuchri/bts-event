"""ORM model untuk record KTP tersimpan."""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class KtpRecord(Base):
    __tablename__ = "ktp_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)

    # 17 field KTP — semua nullable (boleh kosong).
    nik: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    nama: Mapped[str | None] = mapped_column(String(255), nullable=True)
    tempat_lahir: Mapped[str | None] = mapped_column(String(255), nullable=True)
    tanggal_lahir: Mapped[str | None] = mapped_column(String(32), nullable=True)
    jenis_kelamin: Mapped[str | None] = mapped_column(String(32), nullable=True)
    golongan_darah: Mapped[str | None] = mapped_column(String(8), nullable=True)
    alamat: Mapped[str | None] = mapped_column(Text, nullable=True)
    rt_rw: Mapped[str | None] = mapped_column(String(32), nullable=True)
    kelurahan_desa: Mapped[str | None] = mapped_column(String(255), nullable=True)
    kecamatan: Mapped[str | None] = mapped_column(String(255), nullable=True)
    agama: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status_perkawinan: Mapped[str | None] = mapped_column(String(64), nullable=True)
    pekerjaan: Mapped[str | None] = mapped_column(String(255), nullable=True)
    kewarganegaraan: Mapped[str | None] = mapped_column(String(16), nullable=True)
    berlaku_hingga: Mapped[str | None] = mapped_column(String(64), nullable=True)
    provinsi: Mapped[str | None] = mapped_column(String(255), nullable=True)
    kabupaten_kota: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Input manual (bukan dari KTP): nomor HP format +62xxxxxxxx.
    no_hp: Mapped[str | None] = mapped_column(String(32), nullable=True)

    confidence: Mapped[str | None] = mapped_column(String(16), nullable=True)
    raw_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class OtpCode(Base):
    __tablename__ = "otp_codes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    no_hp: Mapped[str] = mapped_column(String(32), index=True)
    code_hash: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(default=0)
    verified: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class LlmUsage(Base):
    """Satu baris per panggilan LLM (Bedrock) — untuk tracing token, latency,
    biaya, dan status. Token disimpan apa adanya; biaya dihitung saat dibaca."""

    __tablename__ = "llm_usage"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    operation: Mapped[str] = mapped_column(String(48), index=True)  # mis. "ocr_ktp"
    model_id: Mapped[str] = mapped_column(String(128))

    input_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # latency_ms = end-to-end yang kita ukur; bedrock_latency_ms = laporan Bedrock.
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    bedrock_latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    success: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    error_code: Mapped[str | None] = mapped_column(String(48), nullable=True)
    confidence: Mapped[str | None] = mapped_column(String(16), nullable=True)
    image_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
