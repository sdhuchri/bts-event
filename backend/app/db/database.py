"""Async SQLAlchemy engine + session factory."""
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings

settings = get_settings()

engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_pre_ping=True,
    # asyncpg: gagal-cepat (5s) kalau host DB tak terjangkau, supaya startup
    # tidak menggantung dan healthcheck Railway tetap lolos.
    connect_args={"timeout": 5},
)

SessionLocal = async_sessionmaker(
    bind=engine, class_=AsyncSession, expire_on_commit=False
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session


async def init_db() -> None:
    """Buat tabel jika belum ada + migrasi ringan (cukup untuk prototype)."""
    from sqlalchemy import text

    from app.db import models  # noqa: F401  pastikan model ter-import

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Migrasi idempotent: tambah kolom no_hp untuk tabel lama yang sudah ada.
        await conn.execute(
            text("ALTER TABLE ktp_records ADD COLUMN IF NOT EXISTS no_hp VARCHAR(32)")
        )
