"use client";

export default function ImagePreview({
  src,
  onRetake,
  onProcess,
  loading,
}: {
  src: string;
  onRetake: () => void;
  onProcess: () => void;
  loading: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt="Preview KTP"
          className="w-full max-h-[60vh] object-contain bg-slate-50"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onRetake}
          disabled={loading}
          className="min-h-[52px] rounded-xl border border-slate-300 bg-white px-4 text-base font-semibold text-slate-800 disabled:opacity-50 active:scale-[0.99] transition"
        >
          Ambil Ulang
        </button>
        <button
          type="button"
          onClick={onProcess}
          disabled={loading}
          className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-base font-semibold text-white disabled:opacity-60 active:scale-[0.99] transition"
        >
          {loading ? (
            <>
              <Spinner /> Memproses…
            </>
          ) : (
            "Proses OCR"
          )}
        </button>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
