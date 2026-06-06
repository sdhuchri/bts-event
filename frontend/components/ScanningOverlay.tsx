"use client";

/**
 * Overlay full-screen saat OCR sedang berjalan: menampilkan foto KTP yang
 * baru diambil dengan animasi "scanning" (pita hijau menyapu + garis scan)
 * ala scanner dokumen, supaya proses terasa hidup, bukan sekadar spinner.
 */
export default function ScanningOverlay({
  src,
  label = "Membaca KTP…",
}: {
  src: string;
  label?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/90 p-6 backdrop-blur-sm">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-emerald-400/40 shadow-2xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt="KTP sedang diproses"
          className="block w-full bg-black object-contain"
          style={{ maxHeight: "60vh" }}
        />
        {/* Pita gradien menyapu + garis scan tajam */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="ktp-sweep" />
          <div className="ktp-scanline" />
        </div>
        {/* Sudut bracket (frame dokumen) */}
        <Corners />
      </div>

      <div className="mt-6 flex items-center gap-3 text-white">
        <Spinner />
        <span className="text-base font-semibold">{label}</span>
      </div>
      <p className="mt-1 text-sm text-white/60">AI sedang membaca NIK &amp; Nama</p>
    </div>
  );
}

function Corners() {
  const base =
    "absolute h-7 w-7 border-emerald-400/90";
  return (
    <div className="pointer-events-none absolute inset-3">
      <span className={`${base} left-0 top-0 rounded-tl-lg border-l-2 border-t-2`} />
      <span className={`${base} right-0 top-0 rounded-tr-lg border-r-2 border-t-2`} />
      <span className={`${base} bottom-0 left-0 rounded-bl-lg border-b-2 border-l-2`} />
      <span className={`${base} bottom-0 right-0 rounded-br-lg border-b-2 border-r-2`} />
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin" width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
        className="opacity-25"
      />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}
