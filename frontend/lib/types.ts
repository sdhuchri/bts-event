export type Confidence = "high" | "medium" | "low";

export interface KtpData {
  nik: string | null;
  nama: string | null;
  tempat_lahir: string | null;
  tanggal_lahir: string | null;
  jenis_kelamin: string | null;
  golongan_darah: string | null;
  alamat: string | null;
  rt_rw: string | null;
  kelurahan_desa: string | null;
  kecamatan: string | null;
  agama: string | null;
  status_perkawinan: string | null;
  pekerjaan: string | null;
  kewarganegaraan: string | null;
  berlaku_hingga: string | null;
  provinsi: string | null;
  kabupaten_kota: string | null;
}

export type KtpField = keyof KtpData;

export interface OcrSuccess {
  success: true;
  data: KtpData;
  confidence: Confidence;
  raw_text: string;
}

export interface ApiErrorBody {
  success: false;
  error: { code: string; message: string };
}

export interface KtpRecord extends KtpData {
  id: string;
  no_hp: string | null;
  confidence: Confidence | null;
  raw_text: string | null;
  created_at: string;
  updated_at: string;
}

export interface SaveRecordPayload {
  nik?: string | null;
  nama?: string | null;
  no_hp?: string | null;
  confidence?: Confidence | null;
}

// ── Tracing pemakaian LLM (Bedrock) ──────────────────────────────
export interface LlmUsageItem {
  id: string;
  created_at: string;
  operation: string;
  model_id: string;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  latency_ms: number | null;
  bedrock_latency_ms: number | null;
  success: boolean;
  error_code: string | null;
  confidence: Confidence | null;
  image_bytes: number | null;
  cost_usd: number | null;
}

export interface LlmUsageSummary {
  total_calls: number;
  success_calls: number;
  error_calls: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  avg_latency_ms: number | null;
  cost_usd: number | null;
  currency: string;
}

export interface LlmUsageResponse {
  summary: LlmUsageSummary;
  items: LlmUsageItem[];
}
