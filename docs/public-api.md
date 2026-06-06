# API Publik — untuk Native Mobile App

Endpoint terproteksi untuk aplikasi eksternal (native mobile) yang **mengonsumsi OTP**:
kirim/kirim-ulang OTP & verifikasi. Terpisah dari endpoint browser frontend.

- **Base URL (prod):** `https://bts-event-backend-production.up.railway.app`
- **Base URL (lokal):** `http://localhost:8000`
- **Auth:** header `X-API-Key: <key>` (nilai dari `EXT_API_KEYS` di backend)
- **Content-Type:** `application/json`

> Logika OTP dikelola backend (Postgres). App ini hanya GENERATE/kirim; verifikasi
> bisa dipicu dari mobile app lewat endpoint di bawah.

---

## Autentikasi

Semua endpoint `/api/v1/ext/*` wajib menyertakan header:
```
X-API-Key: 304aa48e... (key kamu)
```
Tanpa/ salah key → `401 UNAUTHORIZED`. Beberapa key bisa aktif sekaligus (rotasi),
dipisah koma di `EXT_API_KEYS`.

---

## Endpoint

### 1) Kirim / kirim ulang OTP
`POST /api/v1/ext/otp/request`

Request:
```json
{ "no_hp": "+6281234567890" }
```
Response `200`:
```json
{ "success": true, "no_hp": "+6281234567890", "expires_in": 300 }
```
- `expires_in` = detik masa berlaku OTP.
- Nomor dinormalkan otomatis (`0812…`/`62812…`/`+62812…` → `+62812…`).
- **Cooldown** kirim ulang (default 60 dtk) → jika terlalu cepat: `429 RATE_LIMITED`.

### 2) Verifikasi OTP
`POST /api/v1/ext/otp/verify`

Request:
```json
{ "no_hp": "+6281234567890", "code": "123456" }
```
Response `200` (benar):
```json
{ "success": true, "no_hp": "+6281234567890", "verified": true }
```
Gagal → `4xx` dengan envelope error (lihat di bawah).

---

## Format error
```json
{ "success": false, "error": { "code": "OTP_INVALID", "message": "Kode salah. Sisa percobaan: 3." } }
```

| HTTP | code | Arti |
|---|---|---|
| 401 | `UNAUTHORIZED` | `X-API-Key` hilang/salah |
| 503 | `API_NOT_CONFIGURED` | `EXT_API_KEYS` belum di-set di server |
| 429 | `RATE_LIMITED` | Minta OTP terlalu sering (cooldown) |
| 400 | `OTP_INVALID` | Kode salah / tidak ditemukan |
| 400 | `OTP_EXPIRED` | Kode kedaluwarsa |
| 429 | `OTP_TOO_MANY` | Melebihi batas percobaan |
| 503 | `WA_NOT_CONNECTED` | wa-gateway belum tertaut WhatsApp |
| 502 | `WA_ERROR` | Gagal kirim via WhatsApp gateway |
| 422 | (validasi) | Body tidak sesuai |

---

## Aturan & rate-limit OTP
- Masa berlaku OTP: **5 menit** (`OTP_EXPIRY_MINUTES`)
- Cooldown kirim ulang: **60 detik** (`OTP_RESEND_COOLDOWN_SECONDS`)
- Maks percobaan verifikasi: **5x** (`OTP_MAX_ATTEMPTS`)

---

## Contoh (curl)
```bash
# Kirim OTP
curl -X POST https://bts-event-backend-production.up.railway.app/api/v1/ext/otp/request \
  -H "X-API-Key: <KEY>" -H "Content-Type: application/json" \
  -d '{"no_hp":"+6281234567890"}'

# Verifikasi
curl -X POST https://bts-event-backend-production.up.railway.app/api/v1/ext/otp/verify \
  -H "X-API-Key: <KEY>" -H "Content-Type: application/json" \
  -d '{"no_hp":"+6281234567890","code":"123456"}'
```

---

## ⚠️ Catatan keamanan untuk native mobile
API key yang di-*bundle* di dalam aplikasi mobile **bisa diekstrak** (decompile).
Jadi `X-API-Key` di sini adalah **gerbang dasar (identifikasi app)**, bukan rahasia
mutlak. Lapisan pelindung utama:
1. **Rate-limit OTP** (cooldown + maks percobaan + expiry) — sudah aktif.
2. Selalu lewat **HTTPS** (Railway sudah HTTPS).
3. Untuk produksi serius, pertimbangkan:
   - **App Attestation**: Google **Play Integrity** / Apple **App Attest**.
   - **Certificate/TLS pinning** di app.
   - Rotasi `EXT_API_KEYS` berkala (multi-key sudah didukung).
   - (Opsional) batasi rate per-IP / per-nomor lebih ketat di gateway/reverse proxy.

> Catatan: CORS tidak berlaku untuk klien native (hanya browser), jadi mobile app
> bebas memanggil endpoint ini selama `X-API-Key` benar.

Lihat juga: [Alternatif provider WhatsApp](whatsapp-alternatives.md)
