import type {
  ApiErrorBody,
  KtpRecord,
  OcrSuccess,
  SaveRecordPayload,
} from "./types";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

async function parseError(res: Response): Promise<never> {
  let body: ApiErrorBody | null = null;
  try {
    body = (await res.json()) as ApiErrorBody;
  } catch {
    /* ignore */
  }
  const code = body?.error?.code ?? "UNKNOWN";
  const message =
    body?.error?.message ?? `Request gagal (HTTP ${res.status}).`;
  throw new ApiError(code, message);
}

/** Kirim gambar KTP untuk OCR (multipart). */
export async function ocrKtp(file: File | Blob): Promise<OcrSuccess> {
  const form = new FormData();
  form.append("file", file, "ktp.jpg");

  const res = await fetch(`${BASE_URL}/api/v1/ocr/ktp`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as OcrSuccess;
}

/** Simpan hasil OCR yang sudah dikoreksi. */
export async function saveRecord(data: SaveRecordPayload): Promise<KtpRecord> {
  const res = await fetch(`${BASE_URL}/api/v1/records`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as KtpRecord;
}

/** Minta OTP dikirim ke WhatsApp nomor tsb. */
export async function requestOtp(
  no_hp: string
): Promise<{ expires_in: number }> {
  const res = await fetch(`${BASE_URL}/api/v1/otp/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ no_hp }),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as { expires_in: number };
}

/** Verifikasi kode OTP. Throw ApiError bila salah/kedaluwarsa. */
export async function verifyOtp(no_hp: string, code: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/v1/otp/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ no_hp, code }),
  });
  if (!res.ok) await parseError(res);
}

export async function listRecords(): Promise<KtpRecord[]> {
  const res = await fetch(`${BASE_URL}/api/v1/records`, { cache: "no-store" });
  if (!res.ok) await parseError(res);
  return (await res.json()) as KtpRecord[];
}

export async function deleteRecord(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/v1/records/${id}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 204) await parseError(res);
}
