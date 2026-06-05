import type { KtpField } from "./types";

export interface FieldMeta {
  key: KtpField;
  label: string;
  placeholder?: string;
  /** Field alamat panjang -> pakai textarea. */
  multiline?: boolean;
  /** Pilihan dropdown bila ada. */
  options?: string[];
  /** inputMode untuk keyboard mobile. */
  inputMode?: "text" | "numeric";
}

export const KTP_FIELD_META: FieldMeta[] = [
  { key: "nik", label: "NIK", placeholder: "16 digit", inputMode: "numeric" },
  { key: "nama", label: "Nama" },
  { key: "tempat_lahir", label: "Tempat Lahir" },
  { key: "tanggal_lahir", label: "Tanggal Lahir", placeholder: "DD-MM-YYYY" },
  {
    key: "jenis_kelamin",
    label: "Jenis Kelamin",
    options: ["LAKI-LAKI", "PEREMPUAN"],
  },
  {
    key: "golongan_darah",
    label: "Golongan Darah",
    options: ["A", "B", "AB", "O", "-"],
  },
  { key: "alamat", label: "Alamat", multiline: true },
  { key: "rt_rw", label: "RT/RW", placeholder: "001/002" },
  { key: "kelurahan_desa", label: "Kelurahan/Desa" },
  { key: "kecamatan", label: "Kecamatan" },
  { key: "agama", label: "Agama" },
  { key: "status_perkawinan", label: "Status Perkawinan" },
  { key: "pekerjaan", label: "Pekerjaan" },
  {
    key: "kewarganegaraan",
    label: "Kewarganegaraan",
    options: ["WNI", "WNA"],
  },
  { key: "berlaku_hingga", label: "Berlaku Hingga", placeholder: "SEUMUR HIDUP" },
  { key: "provinsi", label: "Provinsi" },
  { key: "kabupaten_kota", label: "Kabupaten/Kota" },
];

export const EMPTY_KTP = Object.fromEntries(
  KTP_FIELD_META.map((f) => [f.key, ""])
) as Record<KtpField, string>;
