# Arsitektur — OCR KTP + OTP WhatsApp (Event BTS)

Ringkasan komponen, alur, dan urutan proses. Diagram pakai **Mermaid** (ter-render
otomatis di GitHub).

> Dokumen terkait: [API publik untuk mobile](public-api.md) ·
> [Alternatif provider WhatsApp](whatsapp-alternatives.md)

---

## Komponen

| Komponen | Teknologi | Peran |
|---|---|---|
| **frontend** | Next.js 16 | App panitia: kamera/scan KTP + form (NIK, Nama, No HP), kirim OTP |
| **backend** | FastAPI | Otak sistem: OCR, logika OTP, simpan data, **+ API publik `/api/v1/ext`** |
| **AWS Bedrock** | Vision LLM | OCR: foto KTP → JSON 17 field |
| **wa service** | Node + Baileys | Pengirim pesan WhatsApp (companion device) |
| **wa nasabah** | WhatsApp | WhatsApp milik nasabah yang menerima OTP |
| **db** | PostgreSQL | `ktp_records` (data peserta) + `otp_codes` (kode OTP) |
| **bsya (mobile apps)** | Native mobile | Konsumer eksternal: verifikasi & kirim ulang OTP via API publik |

---

## Diagram komponen

```mermaid
flowchart LR
    FE["frontend<br/>(panitia)"]
    BE["backend — FastAPI<br/>+ API publik /api/v1/ext"]
    AI["AWS Bedrock<br/>AI Model"]
    WA["wa service<br/>(Baileys)"]
    WN["wa nasabah<br/>(WhatsApp)"]
    DB[("db<br/>bts_event")]
    MB["bsya<br/>(mobile apps)"]

    FE -->|"1. foto KTP"| BE
    BE -->|"4. hasil OCR → form"| FE
    BE <-->|"2–3. OCR (vision)"| AI
    BE -->|"6/11. simpan & cek"| DB
    BE -->|"7. minta kirim OTP"| WA
    WA -->|"8. OTP"| WN
    MB <-->|"10/13. verify + resend<br/>X-API-Key"| BE

    classDef ext fill:#f5f5f5,stroke:#999,stroke-dasharray:4 3;
    class AI,WA,WN,MB ext;
```

> **Penting:** `bsya` (mobile) **tidak mengakses `db` langsung**. Mobile memanggil
> **API publik di backend** (`/api/v1/ext/*` + `X-API-Key`), lalu **backend** yang
> query `db`. Jadi alurnya `bsya → backend (API publik) → db` — demi keamanan
> (API key, validasi, rate-limit).

---

## Urutan proses (sequence)

```mermaid
sequenceDiagram
    actor P as Panitia
    participant FE as frontend
    participant BE as backend
    participant AI as AWS Bedrock
    participant DB as db
    participant WA as wa service
    participant WN as wa nasabah
    actor N as Nasabah
    participant MB as bsya (mobile)

    Note over P,WN: FASE 1 — Daftar peserta + kirim OTP (panitia)
    P->>FE: scan / upload KTP
    FE->>BE: 1. POST foto KTP
    BE->>AI: 2. kirim gambar (OCR)
    AI-->>BE: 3. hasil JSON 17 field
    BE-->>FE: 4. data OCR → form
    P->>FE: koreksi NIK/Nama + isi No HP + "Kirim OTP"
    FE->>BE: 5. POST kirim OTP + simpan
    BE->>DB: 6. simpan record + simpan OTP
    BE->>WA: 7. minta kirim OTP
    WA->>WN: 8. kirim OTP (WhatsApp)
    WN-->>N: terima kode OTP

    Note over N,DB: FASE 2 — Verifikasi OTP (nasabah, via bsya)
    N->>MB: 9. input kode OTP
    MB->>BE: 10. verify OTP (/api/v1/ext + X-API-Key)
    BE->>DB: 11. cek kode (hash / expiry / attempts)
    DB-->>BE: 12. valid / tidak
    BE-->>MB: 13. verified ✅
```

### Urutan ringkas
**Fase 1 (panitia):** `frontend → backend → Bedrock → (form) → backend → db (simpan) → wa service → WhatsApp nasabah`

**Fase 2 (nasabah/bsya):** `bsya → backend (API publik) → db (cek) → verified ✅`

---

## Keamanan antar-jalur

| Jalur | Proteksi |
|---|---|
| frontend → backend | CORS allowlist (origin frontend) |
| backend → wa service | `x-api-key` internal (`WA_GATEWAY_API_KEY`) + private network |
| **bsya → backend** (`/ext`) | **`X-API-Key`** (`EXT_API_KEYS`) + HTTPS |
| OTP | kode di-hash, expiry 5 mnt, cooldown 60 dtk, maks 5 percobaan |

---

## Deployment (Railway)

| Service | Root dir | Catatan |
|---|---|---|
| frontend | `frontend` | `NEXT_PUBLIC_API_BASE_URL` → backend |
| backend | `backend` | env: AWS, `DATABASE_URL`, CORS, `WA_*`, `EXT_API_KEYS` |
| wa service | `wa-gateway` | **Volume `/app/auth`** (sesi WA), scan QR di `/qr` |
| Postgres | — | `${{Postgres.DATABASE_URL}}` |

backend ↔ wa service lewat **private networking** (`*.railway.internal:3000`);
publik (frontend & bsya) lewat **HTTPS**.
