"use client";

import { useEffect } from "react";

export type ToastKind = "error" | "success" | "info";

export interface ToastState {
  kind: ToastKind;
  message: string;
}

const STYLES: Record<ToastKind, string> = {
  error: "bg-red-600",
  success: "bg-emerald-600",
  info: "bg-slate-800",
};

export default function Toast({
  toast,
  onClose,
}: {
  toast: ToastState | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [toast, onClose]);

  if (!toast) return null;

  return (
    <div className="fixed inset-x-0 top-3 z-50 flex justify-center px-4">
      <div
        role="alert"
        className={`${STYLES[toast.kind]} max-w-md w-full rounded-xl px-4 py-3 text-sm text-white shadow-lg`}
        onClick={onClose}
      >
        {toast.message}
      </div>
    </div>
  );
}
