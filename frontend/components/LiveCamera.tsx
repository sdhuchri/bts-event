"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type CamState = "starting" | "ready" | "error";
type QualityLevel = "bad" | "good";

interface Quality {
  level: QualityLevel;
  msg: string;
}

/* ── Parameter analisis (boleh disetel) ──────────────────────────────
 * SHARP_MIN  : ambang "variance of Laplacian"; di bawah ini dianggap buram.
 * DARK_MIN   : kecerahan rata-rata minimum (0–255).
 * BRIGHT_MAX : kecerahan rata-rata maksimum (over-exposed).
 * GLARE_MAX  : fraksi piksel sangat terang (silau / pantulan).
 * AUTO_TICKS : jumlah frame "bagus" berturut-turut sebelum jepret otomatis.
 */
const ANALYZE_MS = 220;
const SHARP_MIN = 100;
const DARK_MIN = 55;
const BRIGHT_MAX = 222;
const GLARE_MAX = 0.06;
const AUTO_TICKS = 5;
const SAMPLE_W = 240; // lebar canvas analisis (kecil = cepat)
const KTP_RATIO = 1.585;

/**
 * Kamera live (getUserMedia) dengan deteksi kualitas real-time ala scanner
 * dokumen: memberi tahu kalau buram/gelap/silau, animasi garis scan, dan
 * AUTO-CAPTURE saat KTP sudah tajam & stabil. Shutter manual tetap tersedia.
 *
 * Analisis dilakukan client-side (canvas): variance of Laplacian untuk
 * ketajaman + rata-rata luminansi untuk kecerahan/silau. Tanpa library berat.
 *
 * Catatan: getUserMedia hanya jalan di secure context (HTTPS atau localhost).
 * Bila gagal, komponen jatuh ke fallback kamera OS lewat <input capture>.
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
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sharpEmaRef = useRef(0);
  const goodStreakRef = useRef(0);
  const capturedRef = useRef(false);

  const [state, setState] = useState<CamState>("starting");
  const [errorMsg, setErrorMsg] = useState("");
  const [facingMode, setFacingMode] = useState<"environment" | "user">(
    "environment"
  );
  const [auto, setAuto] = useState(true);
  const [quality, setQuality] = useState<Quality>({
    level: "bad",
    msg: "Posisikan KTP di dalam bingkai",
  });
  const [progress, setProgress] = useState(0); // 0..1 ring auto-capture

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(
    async (mode: "environment" | "user") => {
      setState("starting");
      capturedRef.current = false;
      goodStreakRef.current = 0;
      sharpEmaRef.current = 0;
      setProgress(0);
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

  // Capture full-res dari video → File JPEG.
  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || capturedRef.current) return;
    capturedRef.current = true;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      capturedRef.current = false;
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          capturedRef.current = false;
          return;
        }
        const file = new File([blob], "ktp.jpg", { type: "image/jpeg" });
        stop();
        onCapture(file);
      },
      "image/jpeg",
      0.92
    );
  }, [onCapture, stop]);

  // Loop analisis kualitas: jalan saat kamera ready.
  useEffect(() => {
    if (state !== "ready") return;

    if (!sampleCanvasRef.current) {
      sampleCanvasRef.current = document.createElement("canvas");
    }

    const analyze = () => {
      const video = videoRef.current;
      const canvas = sampleCanvasRef.current;
      if (!video || !canvas || !video.videoWidth || capturedRef.current) return;

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      // Crop tengah dengan rasio KTP (~80% area).
      let cropW = vw * 0.82;
      let cropH = cropW / KTP_RATIO;
      if (cropH > vh * 0.82) {
        cropH = vh * 0.82;
        cropW = cropH * KTP_RATIO;
      }
      const sx = (vw - cropW) / 2;
      const sy = (vh - cropH) / 2;

      const cw = SAMPLE_W;
      const ch = Math.round(SAMPLE_W / KTP_RATIO);
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(video, sx, sy, cropW, cropH, 0, 0, cw, ch);

      const { data } = ctx.getImageData(0, 0, cw, ch);
      const n = cw * ch;
      const gray = new Float32Array(n);
      let bSum = 0;
      let glare = 0;
      for (let i = 0, p = 0; i < n; i++, p += 4) {
        const g = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
        gray[i] = g;
        bSum += g;
        if (g > 245) glare++;
      }
      const brightness = bSum / n;
      const glareFrac = glare / n;

      // Variance of Laplacian (semakin tinggi = semakin tajam/fokus).
      let lSum = 0;
      let lSum2 = 0;
      let m = 0;
      for (let y = 1; y < ch - 1; y++) {
        for (let x = 1; x < cw - 1; x++) {
          const i = y * cw + x;
          const lap =
            4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - cw] - gray[i + cw];
          lSum += lap;
          lSum2 += lap * lap;
          m++;
        }
      }
      const lapMean = lSum / m;
      const sharpness = lSum2 / m - lapMean * lapMean;

      // Smoothing biar tidak loncat-loncat.
      sharpEmaRef.current = sharpEmaRef.current
        ? sharpEmaRef.current * 0.6 + sharpness * 0.4
        : sharpness;
      const sharp = sharpEmaRef.current;

      // Tentukan kualitas.
      let level: QualityLevel = "good";
      let msg = "KTP terbaca jelas — tahan…";
      if (brightness < DARK_MIN) {
        level = "bad";
        msg = "Terlalu gelap — cari tempat lebih terang";
      } else if (brightness > BRIGHT_MAX || glareFrac > GLARE_MAX) {
        level = "bad";
        msg = "Silau — kurangi pantulan cahaya";
      } else if (sharp < SHARP_MIN) {
        level = "bad";
        msg = "Buram — tahan stabil / dekatkan KTP";
      }

      setQuality({ level, msg });

      if (level === "good") {
        goodStreakRef.current += 1;
      } else {
        goodStreakRef.current = 0;
      }
      const p = Math.min(1, goodStreakRef.current / AUTO_TICKS);
      setProgress(auto ? p : 0);

      if (auto && goodStreakRef.current >= AUTO_TICKS) {
        capture();
      }
    };

    timerRef.current = setInterval(analyze, ANALYZE_MS);
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [state, auto, capture]);

  const switchCamera = () => {
    const next = facingMode === "environment" ? "user" : "environment";
    setFacingMode(next);
    start(next);
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

  const frameBorder =
    state === "ready"
      ? quality.level === "good"
        ? "border-emerald-400"
        : "border-white/90"
      : "border-white/90";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover"
        />

        {/* Bingkai panduan KTP + garis scan */}
        {state === "ready" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
            <div
              className={`relative w-full max-w-md overflow-hidden rounded-2xl border-2 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] transition-colors ${frameBorder}`}
              style={{ aspectRatio: "1.585 / 1" }}
            >
              <div className="ktp-scanline" />
            </div>
          </div>
        )}

        {/* Header: tutup + auto toggle + ganti kamera */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
          <button
            type="button"
            onClick={cancel}
            className="rounded-full bg-black/50 px-4 py-2 text-sm font-medium text-white backdrop-blur"
          >
            Tutup
          </button>
          {state === "ready" && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAuto((a) => !a)}
                aria-pressed={auto}
                className={`rounded-full px-3 py-2 text-sm font-semibold backdrop-blur transition ${
                  auto
                    ? "bg-emerald-500 text-white"
                    : "bg-black/50 text-white/80"
                }`}
              >
                Auto {auto ? "ON" : "OFF"}
              </button>
              <button
                type="button"
                onClick={switchCamera}
                className="rounded-full bg-black/50 p-2 text-white backdrop-blur"
                aria-label="Ganti kamera"
              >
                <SwitchIcon />
              </button>
            </div>
          )}
        </div>

        {/* Status kualitas */}
        {state === "ready" && (
          <div className="absolute inset-x-0 bottom-4 flex justify-center px-6">
            <span
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium backdrop-blur ${
                quality.level === "good"
                  ? "bg-emerald-500/90 text-white"
                  : "bg-black/60 text-white"
              }`}
            >
              <Dot ok={quality.level === "good"} />
              {quality.msg}
            </span>
          </div>
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

      {/* Shutter (manual selalu tersedia) + ring progress auto-capture */}
      {state === "ready" && (
        <div className="flex items-center justify-center bg-black py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={capture}
            aria-label="Ambil foto"
            className="relative h-[76px] w-[76px] active:scale-95 transition"
          >
            <ProgressRing progress={progress} />
            <span className="absolute inset-[6px] rounded-full border-2 border-black/10 bg-white" />
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

function ProgressRing({ progress }: { progress: number }) {
  const r = 35;
  const circ = 2 * Math.PI * r;
  return (
    <svg
      className="absolute inset-0 h-full w-full -rotate-90"
      viewBox="0 0 76 76"
    >
      <circle cx="38" cy="38" r={r} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="5" />
      <circle
        cx="38"
        cy="38"
        r={r}
        fill="none"
        stroke="#34d399"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - progress)}
        style={{ transition: "stroke-dashoffset 0.2s linear" }}
      />
    </svg>
  );
}

function Dot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`h-2 w-2 rounded-full ${ok ? "bg-white" : "bg-amber-400"}`}
    />
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
