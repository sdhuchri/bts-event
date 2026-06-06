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
