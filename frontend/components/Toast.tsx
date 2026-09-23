"use client";

import Icon from "./Icon";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type ToastKind = "loading" | "success" | "error" | "info";

export type ToastItem = {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
  href?: string;
  hrefLabel?: string;
};

type ToastApi = {
  show: (t: Omit<ToastItem, "id">) => number;
  update: (id: number, patch: Partial<Omit<ToastItem, "id">>) => void;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

const AUTO_DISMISS_MS: Record<ToastKind, number | null> = {
  loading: null,
  info: 5000,
  success: 6500,
  error: 10000,
};

function ToastIcon({ kind }: { kind: ToastKind }) {
  if (kind === "loading") return <span className="spinner text-accent-400" style={{ width: 18, height: 18 }} />;
  const tone =
    kind === "success" ? "bg-emerald-500/15 text-emerald-300" : kind === "error" ? "bg-rose-500/15 text-rose-300" : "bg-accent-500/15 text-accent-300";
  return (
    <span className={`grid h-[22px] w-[22px] place-items-center rounded-full text-[13px] ${tone}`}>
      <Icon name={kind === "success" ? "check" : kind === "error" ? "x" : "sparkle"} />
    </span>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const clearTimer = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
  }, []);

  const dismiss = useCallback(
    (id: number) => {
      clearTimer(id);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    },
    [clearTimer]
  );

  const schedule = useCallback(
    (id: number, kind: ToastKind) => {
      clearTimer(id);
      const ms = AUTO_DISMISS_MS[kind];
      if (ms) timers.current.set(id, setTimeout(() => dismiss(id), ms));
    },
    [clearTimer, dismiss]
  );

  const show = useCallback(
    (t: Omit<ToastItem, "id">) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev.slice(-4), { ...t, id }]);
      schedule(id, t.kind);
      return id;
    },
    [schedule]
  );

  const update = useCallback(
    (id: number, patch: Partial<Omit<ToastItem, "id">>) => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      if (patch.kind) schedule(id, patch.kind);
    },
    [schedule]
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((t) => clearTimeout(t));
      map.clear();
    };
  }, []);

  const api = useMemo(() => ({ show, update, dismiss }), [show, update, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="fixed z-[80] bottom-4 right-4 left-4 sm:left-auto sm:w-[380px] flex flex-col gap-3 pointer-events-none"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="toast glass pointer-events-auto p-4 flex gap-3 items-start shadow-glow-lg"
            style={{ borderRadius: "1rem" }}
          >
            <div className="pt-0.5">
              <ToastIcon kind={t.kind} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white leading-snug">{t.title}</p>
              {t.message && <p className="text-xs text-zinc-400 mt-1 leading-relaxed break-words">{t.message}</p>}
              {t.href && (
                <a
                  href={t.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block mt-1.5 text-xs font-medium text-accent-400 hover:text-accent-300 underline underline-offset-2"
                >
                  {t.hrefLabel || "View on explorer"}
                </a>
              )}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="-mt-1 px-1 text-zinc-400 hover:text-white"
              aria-label="Dismiss notification"
            >
              <Icon name="x" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
