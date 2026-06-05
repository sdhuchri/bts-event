"use client";

import { useRef } from "react";

/**
 * Pilihan input gambar KTP:
 *  - "Ambil Foto KTP" -> buka kamera live di dalam app (onOpenCamera).
 *  - "Upload dari Galeri" -> pilih file gambar.
 */
export default function CameraCapture({
  onOpenCamera,
  onSelect,
}: {
  onOpenCamera: () => void;
  onSelect: (file: File) => void;
}) {
  const uploadRef = useRef<HTMLInputElement>(null);

  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onSelect(file);
    e.target.value = ""; // reset agar bisa pilih file sama lagi
  };

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={uploadRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handle}
      />

      <button
        type="button"
        onClick={onOpenCamera}
        className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-base font-semibold text-white active:scale-[0.99] transition"
      >
        <CameraIcon />
        Ambil Foto KTP
      </button>

      <button
        type="button"
        onClick={() => uploadRef.current?.click()}
        className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 text-base font-semibold text-slate-800 active:scale-[0.99] transition"
      >
        <UploadIcon />
        Upload dari Galeri
      </button>
    </div>
  );
}

function CameraIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}
