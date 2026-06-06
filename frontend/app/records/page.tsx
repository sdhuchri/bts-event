"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Toast, { type ToastState } from "@/components/Toast";
import { ApiError, deleteRecord, listRecords } from "@/lib/api";
import type { KtpRecord } from "@/lib/types";

export default function RecordsPage() {
  const [records, setRecords] = useState<KtpRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<ToastState | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRecords(await listRecords());
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "Gagal memuat data tersimpan.";
      setToast({ kind: "error", message: msg });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (id: string) => {
    if (!confirm("Hapus record ini?")) return;
    try {
      await deleteRecord(id);
      setRecords((prev) => prev.filter((r) => r.id !== id));
      setToast({ kind: "success", message: "Record dihapus." });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Gagal menghapus.";
      setToast({ kind: "error", message: msg });
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-5">
      <Toast toast={toast} onClose={() => setToast(null)} />

      <header className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Data Tersimpan</h1>
          <p className="text-sm text-slate-500">{records.length} record</p>
        </div>
        <Link
          href="/"
          className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white"
        >
          + Scan Baru
        </Link>
      </header>

      {loading ? (
        <p className="text-sm text-slate-500">Memuat…</p>
      ) : records.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Belum ada data tersimpan.
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {records.map((r) => (
            <li
              key={r.id}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">
                    {r.nama || "(tanpa nama)"}
                  </p>
                  <p className="font-mono text-sm text-slate-600">
                    {r.nik || "—"}
                  </p>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    📱 {r.no_hp || "—"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => remove(r.id)}
                  className="shrink-0 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 active:scale-[0.99]"
                >
                  Hapus
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
