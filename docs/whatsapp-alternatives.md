# Integrasi WhatsApp — Opsi & Alternatif

Dokumen ini merangkum pilihan untuk mengirim OTP/pesan WhatsApp di project ini,
beserta kelebihan/kekurangan dan **cara menukar provider** tanpa mengubah alur OTP.

> Status sekarang: **Baileys** (tidak resmi) lewat service `wa-gateway`.
> Lihat juga: [README — Verifikasi OTP WhatsApp](../README.md#verifikasi-otp-whatsapp-baileys)

---

## 0. Arsitektur saat ini (kenapa gampang diganti)

```
Frontend ─► FastAPI (OTP: generate/simpan/verifikasi, Postgres) ─► wa-gateway (Baileys) ─► WhatsApp
                       │
                       └ panggil "kirim pesan" via _send_wa()
```

Logika OTP ada di **backend** (`app/services/otp.py`). Provider WhatsApp hanya
bertugas **mengirim pesan**. Jadi mengganti provider = mengganti **satu titik**:
fungsi `_send_wa()` (atau isi service `wa-gateway`). Ada 2 model:

- **Self-managed OTP** (sekarang): kita yang generate/simpan/cek kode; provider
  cuma kirim teks. Cocok untuk semua gateway.
- **Verify API** (mis. Twilio Verify): provider yang generate & cek OTP. Kode kita
  jadi paling sedikit; tabel `otp_codes` bisa dilepas.

---

## 1. Kenapa cari alternatif?

Baileys memakai protokol **WhatsApp Web tidak resmi** → melanggar ToS. Untuk OTP ke
**nomor asing & volume banyak**, WhatsApp aktif membatasi:
- `device_removed` / error **401** → perangkat tertaut dicabut.
- ack error **463** + `RESTRICT_ALL_COMPANIONS` → akun dilarang "reach out" (kirim ke
  non-kontak) selama timelock.

Kita sudah mengalami keduanya. Jadi Baileys **layak untuk demo**, **berisiko untuk produksi**.

---

## 2. Kategori & opsi

### A. Library tidak resmi (WhatsApp Web) — GRATIS, RISIKO BAN
Menautkan nomor via scan QR. Gratis, tanpa approval, **tapi melanggar ToS → risiko
ban/restriction**. Tidak untuk produksi/OTP massal.

| Library | Bahasa | Catatan |
|---|---|---|
| **Baileys** (`@whiskeysockets/baileys`) | Node | Ringan (WebSocket, tanpa browser). **Yang dipakai sekarang.** |
| **whatsapp-web.js** | Node | Pakai Puppeteer/Chromium → boros RAM, lebih berat. |
| **wppconnect** | Node | Mirip, fitur banyak. |
| **venom-bot** | Node | Berbasis browser juga. |
| **whatsmeow** | Go | Stabil & ringan; dipakai banyak gateway lokal di belakang layar. |

> Semua di atas punya **profil risiko sama** seperti Baileys.

### B. WhatsApp Cloud API (RESMI — Meta) — ANDAL
API resmi dari Meta. Legal untuk OTP, tidak kena ban/463.
- Perlu: akun **Meta Business**, **WhatsApp Business Account (WABA)**, nomor terdaftar,
  dan **template pesan disetujui** (kategori *Authentication* untuk OTP).
- Biaya: model per-conversation; pesan **authentication berbayar** per pesan di banyak
  region (cek harga terbaru Meta). Ada kuota gratis terbatas.
- Effort setup: **tinggi** (verifikasi bisnis + approval template butuh waktu).

### C. BSP / Provider di atas Cloud API — MUDAH + ANDAL (berbayar)
"Pembungkus" Cloud API yang mempermudah onboarding, billing, tooling.
- **Twilio**, **Vonage (Nexmo)**, **Bird (MessageBird)**, **360dialog**,
  **Infobip**, **Gupshup**.
- Tetap butuh template approval (karena di atas Cloud API), tapi prosesnya dibantu.

### D. OTP "Verify" API — PALING SEDIKIT KODE (berbayar)
Provider mengelola **seluruh siklus OTP** (generate, kirim, expiry, retry, verifikasi).
Kita cukup panggil 2 endpoint: *start* & *check*.
- **Twilio Verify** — channel **WhatsApp + SMS + call + email**, ada **fallback** otomatis.
- **Vonage Verify**, **Infobip 2FA**.
- Kelebihan: tak perlu tabel `otp_codes`/logika sendiri; multi-channel; anti-fraud bawaan.
- Cocok banget untuk use-case kita (OTP ke nomor asing).

### E. Gateway lokal Indonesia — MURAH, SUPPORT LOKAL (cek legalitas)
REST sederhana, bayar **IDR**, dokumentasi Bahasa Indonesia.
- **Fonnte**, **Wablas**, **Watzap.id**, **Zenziva**, **Qiscus**, **Mekari Qontak**.
- ⚠️ **Penting:** sebagian memakai metode **tidak resmi** (mirip Baileys → risiko ban
  sama), sebagian **BSP resmi** (di atas Cloud API). Tanyakan/pastikan sebelum pakai
  untuk produksi.

---

## 3. Tabel perbandingan ringkas

| Opsi | Resmi | Risiko ban | Biaya | Setup | OTP ke nomor asing/massal |
|---|---|---|---|---|---|
| Baileys / lib unofficial | ❌ | **Tinggi** | Gratis | Rendah | ⚠️ Tidak andal |
| WhatsApp Cloud API | ✅ | Tidak | $ (per pesan auth) | **Tinggi** | ✅ |
| BSP (Twilio/Vonage/dll) | ✅ | Tidak | $$ | Sedang | ✅ |
| Verify API (Twilio Verify) | ✅ | Tidak | $ /verifikasi | **Rendah** | ✅ (+ fallback SMS) |
| Gateway lokal (Fonnte dll) | ⚠️ tergantung | Sedang–Tinggi* | Rp (murah) | Rendah | ⚠️ cek dulu |

\* Tinggi jika gateway-nya pakai metode tidak resmi.

---

## 4. Cara mengganti provider di project ini

### Opsi 1 — Ganti "tukang kirim" saja (self-managed OTP tetap)
Cocok untuk: Cloud API, BSP, atau gateway lokal yang menyediakan endpoint "kirim pesan".

- Ubah `backend/app/services/otp.py` → fungsi **`_send_wa(no_hp, message)`**:
  panggil API provider (mis. `POST` ke Cloud API / Fonnte) alih-alih `wa-gateway`.
- Logika `request_otp` / `verify_otp` / tabel `otp_codes` **tidak berubah**.
- `wa-gateway` (Baileys) bisa dipensiunkan atau dijadikan cadangan.

Contoh env yang biasanya dibutuhkan:
```
# WhatsApp Cloud API
WA_CLOUD_TOKEN=...
WA_CLOUD_PHONE_NUMBER_ID=...
WA_CLOUD_TEMPLATE=otp_event   # nama template Authentication yg disetujui

# atau Fonnte (lokal)
FONNTE_TOKEN=...
```

### Opsi 2 — Pindah ke Verify API (paling ringkas)
Cocok untuk: **Twilio Verify**.

- `POST /api/v1/otp/request` → panggil Twilio Verify **start** (`channel=whatsapp`).
- `POST /api/v1/otp/verify` → panggil Twilio Verify **check**.
- Hapus tabel `otp_codes` & logika hash/expiry (dikelola Twilio).
- Frontend **tidak berubah** (tetap kirim `no_hp` & `code`).

Env:
```
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_VERIFY_SERVICE_SID=...
```

---

## 5. Rekomendasi untuk Event BTS

| Skenario | Rekomendasi |
|---|---|
| Demo internal / uji coba | **Baileys** (sekarang) — sadar risiko, pakai nomor "bakar" sehat |
| Hari-H event (OTP ke peserta, volume) | **Twilio Verify** (tercepat + fallback SMS) atau **WhatsApp Cloud API** (langsung Meta) |
| Hemat & lokal, volume kecil–sedang | **Gateway lokal BSP resmi** (pastikan resmi, bukan unofficial) |

**Hindari:** nomor WhatsApp pribadi untuk blast OTP; library unofficial untuk skala produksi.

---

## 6. Referensi
- Baileys — https://github.com/WhiskeySockets/Baileys
- WhatsApp Cloud API — https://developers.facebook.com/docs/whatsapp/cloud-api
- Twilio Verify (WhatsApp) — https://www.twilio.com/docs/verify/whatsapp
- Vonage Verify — https://developer.vonage.com/en/verify/overview
- whatsapp-web.js — https://wwebjs.dev
- whatsmeow (Go) — https://github.com/tulir/whatsmeow
