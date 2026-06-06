"use client";

import { useEffect, useState } from "react";
import { ApiError, requestOtp, verifyOtp } from "@/lib/api";
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

function normalizePhoneLocal(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("62")) d = d.slice(2);
  d = d.replace(/^0+/, "");
  return d.slice(0, 13);
}

function isValidPhoneLocal(local: string): boolean {
  return /^8\d{8,12}$/.test(local);
}

const RESEND_COOLDOWN = 60;

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

  // OTP
  const [otpSent, setOtpSent] = useState(false);
  const [verified, setVerified] = useState(false);
  const [code, setCode] = useState("");
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [otpMsg, setOtpMsg] = useState<{ kind: "err" | "ok"; text: string } | null>(
    null
  );

  const phoneValid = isValidPhoneLocal(phone);
  const fullPhone = `+62${phone}`;

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const resetOtp = () => {
    setOtpSent(false);
    setVerified(false);
    setCode("");
    setCooldown(0);
    setOtpMsg(null);
  };

  const sendOtp = async () => {
    setTouched(true);
    if (!phoneValid || sendingOtp || cooldown > 0) return;
    setSendingOtp(true);
    setOtpMsg(null);
    try {
      await requestOtp(fullPhone);
      setOtpSent(true);
      setCooldown(RESEND_COOLDOWN);
      setOtpMsg({ kind: "ok", text: "Kode OTP dikirim ke WhatsApp kamu." });
    } catch (err) {
      setOtpMsg({
        kind: "err",
        text: err instanceof ApiError ? err.message : "Gagal mengirim OTP.",
      });
    } finally {
      setSendingOtp(false);
    }
  };

  const doVerify = async () => {
    if (code.length < 4 || verifying) return;
    setVerifying(true);
    setOtpMsg(null);
    try {
      await verifyOtp(fullPhone, code);
      setVerified(true);
      setOtpMsg({ kind: "ok", text: "Nomor terverifikasi ✓" });
    } catch (err) {
      setOtpMsg({
        kind: "err",
        text: err instanceof ApiError ? err.message : "Verifikasi gagal.",
      });
    } finally {
      setVerifying(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!verified) return;
    onSave({ nik: nik.trim() || null, nama: nama.trim() || null, no_hp: fullPhone });
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
        Periksa &amp; koreksi data, lalu verifikasi nomor HP.
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
          Nomor HP (WhatsApp)
        </label>
        <div className="flex gap-2">
          <div
            className={`flex flex-1 items-stretch overflow-hidden rounded-xl border bg-white focus-within:border-slate-900 ${
              touched && !phoneValid ? "border-red-400" : "border-slate-300"
            } ${otpSent ? "opacity-60" : ""}`}
          >
            <span className="flex items-center bg-slate-100 px-3 text-base font-medium text-slate-600">
              +62
            </span>
            <input
              id="no_hp"
              type="tel"
              inputMode="numeric"
              value={phone}
              disabled={otpSent}
              onChange={(e) => setPhone(normalizePhoneLocal(e.target.value))}
              onBlur={() => setTouched(true)}
              placeholder="81234567890"
              className="min-h-[48px] flex-1 px-3 text-base outline-none disabled:bg-slate-50"
            />
          </div>
          {!otpSent ? (
            <button
              type="button"
              onClick={sendOtp}
              disabled={!phoneValid || sendingOtp}
              className="min-h-[48px] whitespace-nowrap rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition active:scale-[0.99] disabled:opacity-50"
            >
              {sendingOtp ? "Mengirim…" : "Kirim OTP"}
            </button>
          ) : (
            <button
              type="button"
              onClick={resetOtp}
              disabled={verified}
              className="min-h-[48px] whitespace-nowrap rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 disabled:opacity-50"
            >
              Ubah
            </button>
          )}
        </div>
        {touched && !phoneValid && !otpSent && (
          <span className="text-xs text-red-600">
            Masukkan nomor HP valid (mulai 8, mis. 81234567890).
          </span>
        )}
      </div>

      {/* OTP input — muncul setelah kode dikirim */}
      {otpSent && !verified && (
        <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <label htmlFor="otp" className="text-sm font-medium text-slate-700">
            Masukkan kode OTP dari WhatsApp
          </label>
          <div className="flex gap-2">
            <input
              id="otp"
              type="text"
              inputMode="numeric"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="6 digit"
              className="min-h-[48px] flex-1 rounded-xl border border-slate-300 bg-white px-3 text-center text-lg tracking-[0.3em] outline-none focus:border-slate-900"
            />
            <button
              type="button"
              onClick={doVerify}
              disabled={code.length < 4 || verifying}
              className="min-h-[48px] rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white transition active:scale-[0.99] disabled:opacity-50"
            >
              {verifying ? "Cek…" : "Verifikasi"}
            </button>
          </div>
          <button
            type="button"
            onClick={sendOtp}
            disabled={cooldown > 0 || sendingOtp}
            className="w-fit text-xs font-medium text-emerald-700 disabled:text-slate-400"
          >
            {cooldown > 0 ? `Kirim ulang dalam ${cooldown}s` : "Kirim ulang kode"}
          </button>
        </div>
      )}

      {/* Status verifikasi */}
      {verified && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
          <span>✓</span> Nomor {fullPhone} terverifikasi
        </div>
      )}

      {otpMsg && (
        <span
          className={`text-xs ${otpMsg.kind === "err" ? "text-red-600" : "text-emerald-700"}`}
        >
          {otpMsg.text}
        </span>
      )}

      {/* Sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto flex max-w-md flex-col gap-1">
          {!verified && (
            <p className="text-center text-xs text-slate-500">
              Verifikasi nomor HP via OTP untuk menyimpan.
            </p>
          )}
          <div className="flex gap-3">
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
              disabled={saving || !verified}
              className="min-h-[52px] flex-[2] rounded-xl bg-slate-900 px-4 text-base font-semibold text-white transition active:scale-[0.99] disabled:opacity-50"
            >
              {saving ? "Menyimpan…" : "Simpan Data"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
