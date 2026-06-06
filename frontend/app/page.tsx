"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import CameraCapture from "@/components/CameraCapture";
import ImagePreview from "@/components/ImagePreview";
import KtpForm, { type KtpSubmit } from "@/components/KtpForm";
import LiveCamera from "@/components/LiveCamera";
import ScanningOverlay from "@/components/ScanningOverlay";
import Toast, { type ToastState } from "@/components/Toast";
import { ApiError, ocrKtp, saveRecord } from "@/lib/api";
import type { Confidence, KtpData } from "@/lib/types";

type Stage = "capture" | "camera" | "preview" | "result";

export default function HomePage() {
  const [stage, setStage] = useState<Stage>("capture");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ocr, setOcr] = useState<{ data: KtpData; confidence: Confidence } | null>(
    null
  );
  const [toast, setToast] = useState<ToastState | null>(null);

  // Bersihkan object URL agar tidak leak memory.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const reset = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl("");
    setOcr(null);
    setStage("capture");
  }, [previewUrl]);

  const runOcr = useCallback(async (f: File) => {
    setLoading(true);
    try {
      const res = await ocrKtp(f);
      setOcr({ data: res.data, confidence: res.confidence });
      setStage("result");
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : "Gagal terhubung ke server OCR.";
      setToast({ kind: "error", message: msg });
      setStage("preview"); // biar bisa diperiksa & diproses ulang / ambil ulang
    } finally {
      setLoading(false);
    }
  }, []);

  // Upload dari galeri → tampilkan preview untuk dikonfirmasi dulu.
  const selectFile = useCallback(
    (f: File) => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setFile(f);
      setPreviewUrl(URL.createObjectURL(f));
      setStage("preview");
    },
    [previewUrl]
  );

  // Hasil kamera (auto/manual) → langsung OCR dengan animasi scanning.
  const captureFromCamera = useCallback(
    (f: File) => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setFile(f);
      setPreviewUrl(URL.createObjectURL(f));
      setStage("preview");
      runOcr(f);
    },
    [previewUrl, runOcr]
  );

  const process = useCallback(() => {
    if (file) runOcr(file);
  }, [file, runOcr]);

  const save = useCallback(
    async (data: KtpSubmit) => {
      setSaving(true);
      try {
        await saveRecord({ ...data, confidence: ocr?.confidence ?? null });
        setToast({ kind: "success", message: "Data berhasil disimpan." });
        reset();
      } catch (err) {
        const msg =
          err instanceof ApiError ? err.message : "Gagal menyimpan data.";
        setToast({ kind: "error", message: msg });
      } finally {
        setSaving(false);
      }
    },
    [ocr, reset]
  );

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-5">
      <Toast toast={toast} onClose={() => setToast(null)} />

      <header className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">OCR KTP</h1>
          <p className="text-sm text-slate-500">Event BTS · prototype</p>
        </div>
        <Link
          href="/records"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700"
        >
          Tersimpan
        </Link>
      </header>

      {stage === "capture" && (
        <section className="flex flex-1 flex-col">
          <div className="mb-6 rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center">
            <p className="text-base font-semibold text-slate-800">
              Scan KTP Anda
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Pastikan seluruh kartu terlihat jelas, tidak buram & tidak silau.
            </p>
          </div>
          <CameraCapture
            onOpenCamera={() => setStage("camera")}
            onSelect={selectFile}
          />
        </section>
      )}

      {stage === "camera" && (
        <LiveCamera
          onCapture={captureFromCamera}
          onCancel={() => setStage("capture")}
        />
      )}

      {/* Animasi "membaca KTP" saat OCR berjalan (kamera & upload). */}
      {loading && previewUrl && <ScanningOverlay src={previewUrl} />}

      {stage === "preview" && previewUrl && (
        <section className="flex flex-1 flex-col">
          <ImagePreview
            src={previewUrl}
            onRetake={reset}
            onProcess={process}
            loading={loading}
          />
        </section>
      )}

      {stage === "result" && ocr && (
        <section className="flex flex-1 flex-col">
          <KtpForm
            initial={ocr.data}
            previewUrl={previewUrl}
            confidence={ocr.confidence}
            saving={saving}
            onSave={save}
            onReset={reset}
          />
        </section>
      )}
    </main>
  );
}
