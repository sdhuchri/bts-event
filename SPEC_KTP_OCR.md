# Spec Prototype — Web App OCR KTP (Event BTS)

## 1. Ringkasan

Web app untuk mengambil foto KTP, menjalankan OCR via LLM (AWS Bedrock), lalu menampilkan hasil ekstraksi dalam form yang bisa dikoreksi user. Status: **prototype**, dipakai pada event BTS. Harus **responsive** agar nyaman dipakai di mobile phone.

### Alur utama
```
[Web App] → [Foto / Upload KTP] → [Kirim ke Backend]
   → [OCR pakai LLM Bedrock] → [Form hasil OCR] → [User koreksi] → [Selesai]
```

## 2. Tech Stack

| Layer | Teknologi | Catatan |
|---|---|---|
| Frontend | Next.js 16.2+ (App Router) | Responsive, mobile-first |
| Backend | Python + FastAPI | Endpoint OCR |
| OCR / LLM | AWS Bedrock | Vision model (mis. Claude 3.5 Sonnet via Bedrock) |
| Region | ap-southeast-3 (Jakarta) | Sesuaikan dengan profil inference yang tersedia |

## 3. Cakupan (Scope)

### In-scope (prototype)
- Capture foto KTP via kamera device (mobile) atau upload file.
- Preview gambar sebelum kirim.
- OCR satu KTP per request.
- Form editable hasil OCR untuk koreksi manual.
- Responsive layout (mobile & desktop).

### Out-of-scope (untuk prototype)
- Autentikasi / login user.
- Penyimpanan permanen ke database.
- Validasi NIK terhadap Dukcapil.
- Multi-dokumen / batch.
- Audit log & enkripsi penyimpanan.

## 4. Field Output OCR (KTP)

Field yang diekstrak dari KTP Indonesia:

| Field | Tipe | Keterangan |
|---|---|---|
| `nik` | string | 16 digit |
| `nama` | string | |
| `tempat_lahir` | string | |
| `tanggal_lahir` | string (DD-MM-YYYY) | |
| `jenis_kelamin` | string | LAKI-LAKI / PEREMPUAN |
| `golongan_darah` | string | A/B/AB/O/- |
| `alamat` | string | |
| `rt_rw` | string | format RRR/RWW |
| `kelurahan_desa` | string | |
| `kecamatan` | string | |
| `agama` | string | |
| `status_perkawinan` | string | |
| `pekerjaan` | string | |
| `kewarganegaraan` | string | WNI/WNA |
| `berlaku_hingga` | string | SEUMUR HIDUP atau tanggal |
| `provinsi` | string | dari header KTP |
| `kabupaten_kota` | string | dari header KTP |

## 5. API Contract

### `POST /api/v1/ocr/ktp`

Request — `multipart/form-data`:
| Field | Tipe | Wajib |
|---|---|---|
| `file` | image (jpg/png/webp) | ya |

Atau JSON dengan base64:
```json
{
  "image_base64": "data:image/jpeg;base64,...."
}
```

Response — `200 OK`:
```json
{
  "success": true,
  "data": {
    "nik": "3201234567890001",
    "nama": "BUDI SANTOSO",
    "tempat_lahir": "BEKASI",
    "tanggal_lahir": "17-08-1990",
    "jenis_kelamin": "LAKI-LAKI",
    "golongan_darah": "O",
    "alamat": "JL. MELATI NO. 12",
    "rt_rw": "001/002",
    "kelurahan_desa": "MEKARSARI",
    "kecamatan": "TAMBUN SELATAN",
    "agama": "ISLAM",
    "status_perkawinan": "KAWIN",
    "pekerjaan": "KARYAWAN SWASTA",
    "kewarganegaraan": "WNI",
    "berlaku_hingga": "SEUMUR HIDUP",
    "provinsi": "JAWA BARAT",
    "kabupaten_kota": "KABUPATEN BEKASI"
  },
  "confidence": "high",
  "raw_text": "..."
}
```

Response — error:
```json
{
  "success": false,
  "error": {
    "code": "OCR_FAILED",
    "message": "Gambar tidak terbaca sebagai KTP"
  }
}
```

Kode error: `INVALID_FILE`, `FILE_TOO_LARGE`, `OCR_FAILED`, `BEDROCK_ERROR`, `RATE_LIMITED`.

### `GET /api/v1/health`
Health check — `{ "status": "ok" }`.

## 6. Backend (FastAPI)

### Tanggung jawab
- Terima & validasi gambar (tipe, ukuran maks ~5MB).
- Resize/kompres bila perlu sebelum kirim ke Bedrock (hemat token).
- Susun prompt ke vision model Bedrock untuk ekstraksi terstruktur.
- Parse output model menjadi JSON sesuai skema field.
- Return ke FE.

### Struktur direktori usulan
```
backend/
├── app/
│   ├── main.py              # FastAPI app + CORS
│   ├── api/
│   │   └── ocr.py           # router endpoint OCR
│   ├── services/
│   │   └── bedrock_ocr.py   # logic panggil Bedrock + prompt
│   ├── schemas/
│   │   └── ktp.py           # Pydantic models
│   └── core/
│       └── config.py        # env: AWS region, model id, dll
├── requirements.txt
└── .env.example
```

### Pendekatan prompt Bedrock
- Kirim gambar + instruksi: ekstrak field KTP, **balas hanya JSON** sesuai skema (tanpa preamble / markdown).
- Set field kosong/null bila tidak terbaca, jangan mengarang.
- Parse aman: strip fence ```` ```json ````, lalu `json.loads` dengan try/except.

### Env yang dibutuhkan
```
AWS_REGION=ap-southeast-3
BEDROCK_MODEL_ID=...        # vision-capable model / inference profile
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
MAX_FILE_SIZE_MB=5
CORS_ORIGINS=http://localhost:3000
```

## 7. Frontend (Next.js 16.2+)

### Tanggung jawab
- Halaman capture: tombol buka kamera (`<input type="file" accept="image/*" capture="environment">`) + opsi upload.
- Preview foto + tombol "Ambil ulang" / "Proses OCR".
- Loading state saat OCR berjalan.
- Form editable terisi otomatis dari hasil OCR; semua field bisa dikoreksi.
- Tombol simpan/konfirmasi (untuk prototype: tampilkan/console / kirim balik).
- Error handling + toast.

### Struktur usulan (App Router)
```
frontend/
├── app/
│   ├── page.tsx             # halaman utama (capture)
│   ├── result/page.tsx      # form koreksi (opsional, bisa 1 halaman)
│   └── layout.tsx
├── components/
│   ├── CameraCapture.tsx
│   ├── ImagePreview.tsx
│   └── KtpForm.tsx
├── lib/
│   └── api.ts               # fetch ke backend
└── .env.local
```

### Responsive / mobile
- Mobile-first, layout 1 kolom di mobile, max-width container di desktop.
- Target tombol ≥ 44px, input nyaman untuk jempol.
- Gunakan `capture="environment"` agar langsung buka kamera belakang di HP.
- Form scrollable, sticky action button di bawah pada mobile.

### Env FE
```
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

## 8. Catatan Privasi (penting walau prototype)

KTP = data pribadi sensitif. Untuk prototype event:
- Jangan simpan gambar/data ke storage permanen kecuali memang diperlukan.
- Proses gambar in-memory, hapus setelah OCR selesai.
- Jika perlu logging, jangan log NIK/nama mentah.
- Pakai HTTPS saat demo ke publik.

## 9. Acceptance Criteria (prototype)

- [ ] User bisa ambil foto KTP via HP (kamera belakang) atau upload.
- [ ] Hasil OCR muncul terisi di form < ~10 detik (normal).
- [ ] Semua field bisa dikoreksi manual.
- [ ] Layout rapi di mobile (375px) & desktop.
- [ ] Error gambar buram/bukan KTP ditangani dengan pesan jelas.

## 10. Langkah Selanjutnya (di luar prototype)

- Validasi format (NIK 16 digit, tanggal valid).
- Image quality check sebelum kirim (blur/glare detection).
- Penyimpanan terenkripsi + retention policy.
- Rate limiting & auth.
