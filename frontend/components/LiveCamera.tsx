"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type CamState = "starting" | "ready" | "error";

/**
 * Kamera live di dalam app (getUserMedia). Menampilkan feed kamera belakang +
 * bingkai panduan KTP + tombol shutter. Hasil jepret diteruskan via onCapture.
 *
 * Catatan: getUserMedia hanya jalan di secure context (HTTPS atau localhost).
 * Bila gagal (mis. dibuka via IP HP tanpa HTTPS, izin ditolak, tak ada kamera),
 * komponen menampilkan fallback ke kamera OS lewat <input capture>.
 */
export default function LiveCamera({
  onCapture,
  onCancel,
}: {
  onCapture: (file: File) => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fallbackRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<CamState>("starting");
  const [errorMsg, setErrorMsg] = useState("");
  const [facingMode, setFacingMode] = useState<"environment" | "user">(
    "environment"
  );

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(
    async (mode: "environment" | "user") => {
      setState("starting");
      stop();

      if (!navigator.mediaDevices?.getUserMedia) {
        setErrorMsg(
          "Browser tidak mendukung akses kamera, atau halaman tidak HTTPS."
        );
        setState("error");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setState("ready");
      } catch (err) {
        const name = err instanceof DOMException ? err.name : "";
        const msg =
          name === "NotAllowedError"
            ? "Izin kamera ditolak. Aktifkan izin kamera di browser."
            : name === "NotFoundError"
              ? "Kamera tidak ditemukan di perangkat ini."
              : "Tidak bisa membuka kamera. Coba upload atau pakai kamera HP.";
        setErrorMsg(msg);
        setState("error");
      }
    },
    [stop]
  );

  useEffect(() => {
    start(facingMode);
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchCamera = () => {
    const next = facingMode === "environment" ? "user" : "environment";
    setFacingMode(next);
    start(next);
  };

  const snap = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], "ktp.jpg", { type: "image/jpeg" });
        stop();
        onCapture(file);
      },
      "image/jpeg",
      0.92
    );
  };

  const handleFallback = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onCapture(file);
    e.target.value = "";
  };

  const cancel = () => {
    stop();
    onCancel();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Feed kamera */}
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover"
        />

        {/* Bingkai panduan KTP (rasio ~1.585:1) */}
        {state === "ready" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
            <div
              className="w-full max-w-md rounded-2xl border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
              style={{ aspectRatio: "1.585 / 1" }}
            />
          </div>
        )}

        {/* Header: tutup + ganti kamera */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
          <button
            type="button"
            onClick={cancel}
            className="rounded-full bg-black/50 px-4 py-2 text-sm font-medium text-white backdrop-blur"
          >
            Tutup
          </button>
          {state === "ready" && (
            <button
              type="button"
              onClick={switchCamera}
              className="rounded-full bg-black/50 p-2 text-white backdrop-blur"
              aria-label="Ganti kamera"
            >
              <SwitchIcon />
            </button>
          )}
        </div>

        {/* Hint */}
        {state === "ready" && (
          <p className="absolute inset-x-0 bottom-4 text-center text-sm text-white/90">
            Posisikan KTP di dalam bingkai
          </p>
        )}

        {/* Status memulai */}
        {state === "starting" && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
            Membuka kamera…
          </div>
        )}

        {/* Error + fallback */}
        {state === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
            <p className="text-sm text-white/90">{errorMsg}</p>
            <button
              type="button"
              onClick={() => fallbackRef.current?.click()}
              className="min-h-[48px] rounded-xl bg-white px-5 text-base font-semibold text-slate-900"
            >
              Pakai Kamera HP
            </button>
            <button
              type="button"
              onClick={cancel}
              className="text-sm text-white/70 underline"
            >
              Kembali
            </button>
          </div>
        )}
      </div>

      {/* Shutter */}
      {state === "ready" && (
        <div className="flex items-center justify-center bg-black py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={snap}
            aria-label="Ambil foto"
            className="h-[72px] w-[72px] rounded-full border-4 border-white bg-white/20 active:scale-95 transition"
          >
            <span className="block h-full w-full rounded-full border-2 border-black/10 bg-white" />
          </button>
        </div>
      )}

      {/* Input fallback ke kamera OS (capture environment) */}
      <input
        ref={fallbackRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFallback}
      />
    </div>
  );
}

function SwitchIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 7h3l2-2h8l2 2h3" />
      <path d="M21 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7" />
      <path d="m9 13 1.5-1.5M9 13l1.5 1.5M9 13h6m0 0-1.5-1.5M15 13l-1.5 1.5" />
    </svg>
  );
}
