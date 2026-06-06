"use client";

import { useState } from "react";
import type { Confidence, KtpData } from "@/lib/types";

const CONFIDENCE_STYLE: Record<Confidence, string> = {
  high: "bg-emerald-100 text-emerald-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-red-100 text-red-700",
};

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: "Keyakinan tinggi",
  medium: "Keyakinan sedang",
  low: "Keyakinan rendah — cek teliti",
};

export interface KtpSubmit {
  nik: string | null;
  nama: string | null;
  no_hp: string;
}

/** Ambil hanya digit; buang awalan 0 / kode negara 62 (akan diganti prefix +62). */
function normalizePhoneLocal(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("62")) d = d.slice(2);
  d = d.replace(/^0+/, "");
  return d.slice(0, 13);
}

/** Nomor HP Indonesia (tanpa prefix +62): mulai 8, total 9–13 digit. */
function isValidPhoneLocal(local: string): boolean {
  return /^8\d{8,12}$/.test(local);
}

export default function KtpForm({
  initial,
  previewUrl,
  confidence,
  saving,
  onSave,
  onReset,
}: {
  initial: KtpData;
  previewUrl: string;
  confidence: Confidence;
  saving: boolean;
  onSave: (data: KtpSubmit) => void;
  onReset: () => void;
}) {
  const [nik, setNik] = useState(initial.nik ?? "");
  const [nama, setNama] = useState(initial.nama ?? "");
  const [phone, setPhone] = useState("");
  const [touched, setTouched] = useState(false);

  const phoneValid = isValidPhoneLocal(phone);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!phoneValid) return;
    onSave({
      nik: nik.trim() || null,
      nama: nama.trim() || null,
      no_hp: `+62${phone}`,
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 pb-28">
      {/* Preview foto KTP */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewUrl}
          alt="Foto KTP"
          className="max-h-56 w-full bg-slate-50 object-contain"
        />
      </div>

      <span
        className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${CONFIDENCE_STYLE[confidence]}`}
      >
        {CONFIDENCE_LABEL[confidence]}
      </span>

      <p className="text-sm text-slate-500">
        Periksa &amp; koreksi data sebelum menyimpan.
      </p>

      {/* NIK */}
      <div className="flex flex-col gap-1">
        <label htmlFor="nik" className="text-sm font-medium text-slate-700">
          NIK
        </label>
        <input
          id="nik"
          type="text"
          inputMode="numeric"
          value={nik}
          onChange={(e) => setNik(e.target.value)}
          placeholder="16 digit"
          className="min-h-[48px] rounded-xl border border-slate-300 bg-white px-3 text-base outline-none focus:border-slate-900"
        />
      </div>

      {/* Nama */}
      <div className="flex flex-col gap-1">
        <label htmlFor="nama" className="text-sm font-medium text-slate-700">
          Nama
        </label>
        <input
          id="nama"
          type="text"
          value={nama}
          onChange={(e) => setNama(e.target.value)}
          placeholder="Nama sesuai KTP"
          className="min-h-[48px] rounded-xl border border-slate-300 bg-white px-3 text-base outline-none focus:border-slate-900"
        />
      </div>

      {/* No HP (+62) */}
      <div className="flex flex-col gap-1">
        <label htmlFor="no_hp" className="text-sm font-medium text-slate-700">
          Nomor HP
        </label>
        <div
          className={`flex items-stretch overflow-hidden rounded-xl border bg-white focus-within:border-slate-900 ${
            touched && !phoneValid ? "border-red-400" : "border-slate-300"
          }`}
        >
          <span className="flex items-center bg-slate-100 px-3 text-base font-medium text-slate-600">
            +62
          </span>
          <input
            id="no_hp"
            type="tel"
            inputMode="numeric"
            value={phone}
            onChange={(e) => setPhone(normalizePhoneLocal(e.target.value))}
            onBlur={() => setTouched(true)}
            placeholder="81234567890"
            className="min-h-[48px] flex-1 px-3 text-base outline-none"
          />
        </div>
        {touched && !phoneValid && (
          <span className="text-xs text-red-600">
            Masukkan nomor HP valid (mulai 8, mis. 81234567890).
          </span>
        )}
      </div>

      {/* Sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto flex max-w-md gap-3">
          <button
            type="button"
            onClick={onReset}
            disabled={saving}
            className="min-h-[52px] flex-1 rounded-xl border border-slate-300 bg-white px-4 text-base font-semibold text-slate-800 transition active:scale-[0.99] disabled:opacity-50"
          >
            Scan Baru
          </button>
          <button
            type="submit"
            disabled={saving}
            className="min-h-[52px] flex-[2] rounded-xl bg-slate-900 px-4 text-base font-semibold text-white transition active:scale-[0.99] disabled:opacity-60"
          >
            {saving ? "Menyimpan…" : "Simpan Data"}
          </button>
        </div>
      </div>
    </form>
  );
}
