# OCR KTP — Event BTS

Web app prototype untuk scan KTP → OCR via **AWS Bedrock** → form koreksi → simpan ke **Postgres**. Mobile-first, dijalankan dengan **Docker**.

> Spec lengkap: [SPEC_KTP_OCR.md](SPEC_KTP_OCR.md)

## Arsitektur

> 📐 Diagram lengkap (komponen + sequence, Mermaid): [docs/architecture.md](docs/architecture.md)

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

> 📱 **API publik untuk native mobile app** (verifikasi & kirim ulang OTP, proteksi
> `X-API-Key`): lihat [docs/public-api.md](docs/public-api.md).

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

## Deploy ke Railway

Repo ini monorepo → di Railway dibuat **3 service dalam 1 project**: `backend`,
`frontend`, dan **PostgreSQL**. Tiap service kode memakai Dockerfile + `railway.json`
di sub-foldernya (cukup set **Root Directory** di Railway).

### 1. Project + Postgres
1. [railway.app](https://railway.app) → **New Project** → *Empty Project*.
2. **+ New → Database → Add PostgreSQL**.

### 2. Service Backend
1. **+ New → GitHub Repo** → pilih `sdhuchri/bts-event`.
2. Service **Settings → Root Directory** = `backend`
   (Railway otomatis pakai `backend/Dockerfile` + `backend/railway.json`).
3. **Variables**:
   | Key | Value |
   |---|---|
   | `AWS_REGION` | `ap-southeast-3` |
   | `BEDROCK_MODEL_ID` | inference profile **vision** (mis. `apac.anthropic.claude-3-5-sonnet-20241022-v2:0`) |
   | `AWS_ACCESS_KEY_ID` | (key kamu) |
   | `AWS_SECRET_ACCESS_KEY` | (secret kamu) |
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` ← **reference** ke service Postgres |
   | `CORS_ORIGINS` | (isi setelah frontend punya domain) |
   | `MAX_FILE_SIZE_MB` | `5` (opsional) |
   | `MAX_IMAGE_DIMENSION` | `1600` (opsional) |
4. **Settings → Networking → Generate Domain**. Catat URL backend, mis.
   `https://bts-backend-xxxx.up.railway.app`.

> `DATABASE_URL` Railway berformat `postgresql://...`; app otomatis menormalkan ke
> `postgresql+asyncpg://...`. Tabel dibuat otomatis saat start (tanpa migrasi).

### 3. Service Frontend
1. **+ New → GitHub Repo** → repo yang sama.
2. **Settings → Root Directory** = `frontend`.
3. **Variables**:
   | Key | Value |
   |---|---|
   | `NEXT_PUBLIC_API_BASE_URL` | URL backend dari langkah 2 |

   > ⚠️ Variabel `NEXT_PUBLIC_*` **di-bake saat build**. Kalau URL backend berubah,
   > **redeploy** frontend. Railway meneruskannya sebagai build-arg ke Dockerfile.
4. **Settings → Networking → Generate Domain**. Catat URL frontend.

### 4. Tutup loop CORS
1. Balik ke service **Backend → Variables** → set
   `CORS_ORIGINS` = URL frontend (mis. `https://bts-frontend-xxxx.up.railway.app`).
2. **Redeploy** backend.

### 5. Selesai
- Buka URL frontend. Railway memakai **HTTPS**, jadi **kamera live jalan di HP**.
- Backend health: `<backend-url>/api/v1/health` · Swagger: `<backend-url>/docs`.

> **Urutan deploy** mengatasi saling-ketergantungan: backend dulu (dapat URL) →
> frontend pakai URL itu → set `CORS_ORIGINS` backend ke URL frontend → redeploy.

## Verifikasi OTP WhatsApp (Baileys)

> 📄 Opsi & alternatif provider WhatsApp (selain Baileys) + cara menukarnya:
> [docs/whatsapp-alternatives.md](docs/whatsapp-alternatives.md)

Sebelum menyimpan, nomor HP diverifikasi via **OTP yang dikirim ke WhatsApp**.
Service `wa-gateway` (Node + [Baileys](https://github.com/WhiskeySockets/Baileys))
memegang koneksi WhatsApp; FastAPI yang generate/simpan/verifikasi OTP.

```
Frontend ─► FastAPI (OTP: generate/verif, Postgres) ─► wa-gateway (Baileys) ─► WhatsApp
```

> ⚠️ **Baileys = WhatsApp Web tidak resmi** → melanggar ToS, **risiko nomor diban**.
> Hanya untuk DEMO/prototype, jangan untuk produksi/skala besar.

### Multi-nomor pengirim (failover + load-spread)
`wa-gateway` mendukung **beberapa nomor pengirim** via env `WA_SESSIONS`
(mis. `WA_SESSIONS=wa1,wa2,wa3`). Saat kirim OTP, gateway memilih nomor yang
**connected** secara **round-robin** dan **failover** ke nomor lain bila gagal.
Menyebar beban ini juga menurunkan risiko ke-flag/ban per nomor.

### Tautkan WhatsApp (scan QR) — lokal
1. `docker compose up --build`
2. Buka **http://localhost:8090/qr?key=bts-wa-secret-key** → tampil **daftar nomor**
   (`wa1`, `wa2`, …) dengan status & link **Scan** per nomor.
3. Di HP: WhatsApp → **Perangkat Tertaut** → **Tautkan Perangkat** → scan QR tiap nomor.
4. Tiap sesi tersimpan di volume `wa_auth` (subfolder per nomor) → tak perlu scan
   ulang tiap restart. Cukup minimal 1 nomor connected agar OTP bisa terkirim.

Alur user: isi No HP → **Kirim OTP** → terima kode di WA → **Verifikasi** → **Simpan**.

Pengaman: kadaluarsa `OTP_EXPIRY_MINUTES` (default 5), maks `OTP_MAX_ATTEMPTS`
percobaan, cooldown kirim ulang `OTP_RESEND_COOLDOWN_SECONDS`. Backend menolak
simpan record bila nomor belum punya OTP terverifikasi.

### Catatan deploy Railway (service ke-4)
- Tambah service **GitHub Repo**, Root Directory = `wa-gateway`.
- **Wajib pasang Volume** di mount path `/app/auth` (Settings → Volumes) agar sesi
  WhatsApp persisten — tanpa ini, QR harus di-scan ulang tiap redeploy.
- Variables wa-gateway: `WA_API_KEY=<secret>`, `WA_AUTH_DIR=/app/auth`, `PORT=3000`
  (port tetap agar private networking deterministik), dan `WA_SESSIONS=wa1,wa2,...`
  (daftar nomor pengirim).
- Backend Variables: `WA_GATEWAY_URL=http://${{wa-gateway.RAILWAY_PRIVATE_DOMAIN}}:3000`
  & `WA_GATEWAY_API_KEY=<secret sama dgn WA_API_KEY>`, lalu redeploy backend.
- Scan QR: generate domain (publik) sementara untuk `wa-gateway`, buka
  `https://<domain>/qr?key=<WA_API_KEY>`, scan. Setelah connect, domain publik
  boleh dihapus (backend tetap akses via private networking).

