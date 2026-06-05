# OCR KTP — Event BTS

Web app prototype untuk scan KTP → OCR via **AWS Bedrock** → form koreksi → simpan ke **Postgres**. Mobile-first, dijalankan dengan **Docker**.

> Spec lengkap: [SPEC_KTP_OCR.md](SPEC_KTP_OCR.md)

## Arsitektur

```
Browser (HP/desktop)
   │  foto / upload KTP
   ▼
Frontend  Next.js 16 (App Router, Tailwind)   :3002
   │  POST /api/v1/ocr/ktp (multipart)
   ▼
Backend   FastAPI                              :8000
   │  Bedrock Converse (vision) ── OCR ──► JSON 17 field
   │  CRUD record
   ▼
Postgres  instance bersama "nalarx-dashboard"  :5432  (DB: bts_event)
```

- **Frontend**: port **3002** (port 3000 sudah dipakai project lain).
- **Backend**: port **8000**.
- **Postgres**: TIDAK membuat instance baru — memakai container `nalarx-dashboard`
  yang sudah running di host port `5432`, database terpisah **`bts_event`**.
  Backend mengaksesnya via `host.docker.internal:5432`.

## Prasyarat

1. Docker + Docker Compose.
2. Postgres `nalarx-dashboard` running di `:5432` dan database `bts_event` sudah ada.
   Cek / buat:
   ```bash
   docker exec nalarx-dashboard psql -U nalarx -d postgres -c "CREATE DATABASE bts_event OWNER nalarx;"
   ```
3. AWS credentials dengan akses Bedrock vision model di `ap-southeast-3`.

## Setup

Isi kredensial AWS di [backend/.env](backend/.env):

```env
AWS_ACCESS_KEY_ID=AKIA....
AWS_SECRET_ACCESS_KEY=....
BEDROCK_MODEL_ID=apac.anthropic.claude-3-5-sonnet-20241022-v2:0   # sesuaikan inference profile yg aktif
```

> Tanpa credential, alur app tetap jalan tapi endpoint OCR membalas `BEDROCK_ERROR`.

## Menjalankan

```bash
docker compose up --build
```

- Frontend: http://localhost:3002
- Backend docs (Swagger): http://localhost:8000/docs
- Health: http://localhost:8000/api/v1/health

Hentikan:
```bash
docker compose down
```

## API (ringkas)

| Method | Endpoint | Fungsi |
|---|---|---|
| POST | `/api/v1/ocr/ktp` | OCR gambar KTP (`multipart file` atau JSON `{image_base64}`) |
| POST | `/api/v1/records` | Simpan hasil OCR yang sudah dikoreksi |
| GET | `/api/v1/records` | List record tersimpan |
| GET | `/api/v1/records/{id}` | Detail record |
| PUT | `/api/v1/records/{id}` | Update record |
| DELETE | `/api/v1/records/{id}` | Hapus record |
| GET | `/api/v1/health` | Health check |

Kode error: `INVALID_FILE`, `FILE_TOO_LARGE`, `OCR_FAILED`, `BEDROCK_ERROR`, `RATE_LIMITED`.

## Catatan privasi

KTP = data pribadi sensitif. Untuk prototype event ini hasil OCR **disimpan** ke DB
(sesuai permintaan). Saat tidak lagi dibutuhkan, hapus via tombol **Hapus** di
halaman *Tersimpan* atau `DELETE /api/v1/records/{id}`. Jangan ekspos demo ke
publik tanpa HTTPS.

## Struktur

```
bts-event/
├── docker-compose.yml
├── backend/            # FastAPI + Bedrock + SQLAlchemy
│   └── app/{api,services,schemas,db,core}
└── frontend/           # Next.js App Router + Tailwind
    └── {app,components,lib}
```
