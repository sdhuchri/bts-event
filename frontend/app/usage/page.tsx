"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Toast, { type ToastState } from "@/components/Toast";
import { ApiError, listLlmUsage } from "@/lib/api";
import type { LlmUsageItem, LlmUsageSummary } from "@/lib/types";

const fmt = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : n.toLocaleString("id-ID");

const fmtCost = (n: number | null, cur: string) =>
  n === null || n === undefined ? "—" : `${cur === "USD" ? "$" : cur + " "}${n.toFixed(4)}`;

const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

export default function UsagePage() {
  const [summary, setSummary] = useState<LlmUsageSummary | null>(null);
  const [items, setItems] = useState<LlmUsageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<ToastState | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listLlmUsage(200);
      setSummary(res.summary);
      setItems(res.items);
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "Gagal memuat data pemakaian LLM.";
      setToast({ kind: "error", message: msg });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const cur = summary?.currency ?? "USD";

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 py-5">
      <Toast toast={toast} onClose={() => setToast(null)} />

      <header className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Pemakaian LLM</h1>
          <p className="text-sm text-slate-500">Tracing token, latency &amp; biaya Bedrock</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
          >
            {loading ? "Memuat…" : "Refresh"}
          </button>
          <Link
            href="/"
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white"
          >
            + Scan
          </Link>
        </div>
      </header>

      {/* Kartu ringkasan */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card
          label="Total panggilan"
          value={fmt(summary?.total_calls)}
          sub={`${fmt(summary?.success_calls)} sukses · ${fmt(summary?.error_calls)} gagal`}
        />
        <Card
          label="Total token"
          value={fmt(summary?.total_tokens)}
          sub={`${fmt(summary?.input_tokens)} in · ${fmt(summary?.output_tokens)} out`}
        />
        <Card
          label="Rata-rata latency"
          value={summary?.avg_latency_ms != null ? `${fmt(summary.avg_latency_ms)} ms` : "—"}
          sub="end-to-end"
        />
        <Card
          label="Total biaya"
          value={fmtCost(summary?.cost_usd ?? null, cur)}
          sub={summary?.cost_usd == null ? "harga belum di-set" : cur}
        />
      </div>

      {/* Tabel */}
      {loading ? (
        <p className="text-sm text-slate-500">Memuat…</p>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Belum ada panggilan LLM tercatat.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <Th>Waktu</Th>
                <Th>Operasi</Th>
                <Th>Model</Th>
                <Th right>In</Th>
                <Th right>Out</Th>
                <Th right>Total</Th>
                <Th right>Latency</Th>
                <Th right>Biaya</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <Td className="whitespace-nowrap text-slate-600">{fmtTime(r.created_at)}</Td>
                  <Td className="font-medium text-slate-800">{r.operation}</Td>
                  <Td className="max-w-[180px] truncate font-mono text-xs text-slate-600" title={r.model_id}>
                    {r.model_id}
                  </Td>
                  <Td right className="tabular-nums text-slate-700">{fmt(r.input_tokens)}</Td>
                  <Td right className="tabular-nums text-slate-700">{fmt(r.output_tokens)}</Td>
                  <Td right className="tabular-nums font-semibold text-slate-900">{fmt(r.total_tokens)}</Td>
                  <Td right className="tabular-nums text-slate-700">
                    {r.latency_ms != null ? `${fmt(r.latency_ms)} ms` : "—"}
                  </Td>
                  <Td right className="tabular-nums text-slate-700">{fmtCost(r.cost_usd, cur)}</Td>
                  <Td>
                    {r.success ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                        OK
                      </span>
                    ) : (
                      <span
                        className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700"
                        title={r.error_code ?? "error"}
                      >
                        {r.error_code ?? "ERROR"}
                      </span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-slate-400">
        Biaya dihitung dari token × harga di config backend
        (<code>LLM_PRICE_INPUT_PER_1K</code> &amp; <code>LLM_PRICE_OUTPUT_PER_1K</code>).
        Jika kosong, kolom biaya tampil &quot;—&quot;.
      </p>
    </main>
  );
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-3 py-2.5 font-semibold ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function Td({
  children,
  right,
  className = "",
  title,
}: {
  children: React.ReactNode;
  right?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <td
      title={title}
      className={`px-3 py-2.5 ${right ? "text-right" : "text-left"} ${className}`}
    >
      {children}
    </td>
  );
}
