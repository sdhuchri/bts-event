"use client";

import { useMemo, useState } from "react";
import { KTP_FIELD_META } from "@/lib/fields";
import type { Confidence, KtpData, KtpField } from "@/lib/types";

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

function toForm(data: KtpData): Record<KtpField, string> {
  const out = {} as Record<KtpField, string>;
  for (const { key } of KTP_FIELD_META) out[key] = data[key] ?? "";
  return out;
}

export default function KtpForm({
  initial,
  confidence,
  saving,
  onSave,
  onReset,
}: {
  initial: KtpData;
  confidence: Confidence;
  saving: boolean;
  onSave: (data: KtpData) => void;
  onReset: () => void;
}) {
  const [form, setForm] = useState<Record<KtpField, string>>(() =>
    toForm(initial)
  );

  const filledCount = useMemo(
    () => Object.values(form).filter((v) => v.trim() !== "").length,
    [form]
  );

  const update = (key: KtpField, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {} as KtpData;
    for (const { key } of KTP_FIELD_META) {
      const v = form[key].trim();
      data[key] = v === "" ? null : v;
    }
    onSave(data);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 pb-28">
      <div className="flex items-center justify-between gap-2">
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${CONFIDENCE_STYLE[confidence]}`}
        >
          {CONFIDENCE_LABEL[confidence]}
        </span>
        <span className="text-xs text-slate-500">{filledCount}/17 terisi</span>
      </div>

      <p className="text-sm text-slate-500">
        Periksa &amp; koreksi setiap field sebelum menyimpan.
      </p>

      <div className="flex flex-col gap-3">
        {KTP_FIELD_META.map((meta) => {
          const id = `f-${meta.key}`;
          return (
            <div key={meta.key} className="flex flex-col gap-1">
              <label htmlFor={id} className="text-sm font-medium text-slate-700">
                {meta.label}
              </label>

              {meta.options ? (
                <select
                  id={id}
                  value={form[meta.key]}
                  onChange={(e) => update(meta.key, e.target.value)}
                  className="min-h-[48px] rounded-xl border border-slate-300 bg-white px-3 text-base outline-none focus:border-slate-900"
                >
                  <option value="">— pilih —</option>
                  {meta.options.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                  {/* Jika nilai OCR tak ada di opsi, tetap tampilkan. */}
                  {form[meta.key] &&
                    !meta.options.includes(form[meta.key]) && (
                      <option value={form[meta.key]}>{form[meta.key]}</option>
                    )}
                </select>
              ) : meta.multiline ? (
                <textarea
                  id={id}
                  value={form[meta.key]}
                  onChange={(e) => update(meta.key, e.target.value)}
                  placeholder={meta.placeholder}
                  rows={2}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-base outline-none focus:border-slate-900"
                />
              ) : (
                <input
                  id={id}
                  type="text"
                  inputMode={meta.inputMode}
                  value={form[meta.key]}
                  onChange={(e) => update(meta.key, e.target.value)}
                  placeholder={meta.placeholder}
                  className="min-h-[48px] rounded-xl border border-slate-300 bg-white px-3 text-base outline-none focus:border-slate-900"
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Sticky action bar di bawah (mobile-friendly). */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-md gap-3">
          <button
            type="button"
            onClick={onReset}
            disabled={saving}
            className="min-h-[52px] flex-1 rounded-xl border border-slate-300 bg-white px-4 text-base font-semibold text-slate-800 disabled:opacity-50 active:scale-[0.99] transition"
          >
            Scan Baru
          </button>
          <button
            type="submit"
            disabled={saving}
            className="min-h-[52px] flex-[2] rounded-xl bg-slate-900 px-4 text-base font-semibold text-white disabled:opacity-60 active:scale-[0.99] transition"
          >
            {saving ? "Menyimpan…" : "Simpan Data"}
          </button>
        </div>
      </div>
    </form>
  );
}
