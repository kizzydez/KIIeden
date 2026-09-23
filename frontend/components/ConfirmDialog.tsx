"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type ConfirmOptions = {
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
};

type Ask = (options: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = createContext<Ask>(async () => false);

/// Ask the person to confirm an important action:
///   if (!(await confirm({ title: "End the mint?", confirmLabel: "End mint", tone: "danger" }))) return;
export const useConfirm = () => useContext(ConfirmContext);

type Pending = { options: ConfirmOptions; resolve: (v: boolean) => void };

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const ask = useCallback<Ask>((options) => new Promise<boolean>((resolve) => setPending({ options, resolve })), []);
  const value = useMemo(() => ask, [ask]);

  const close = useCallback(
    (result: boolean) => {
      pending?.resolve(result);
      setPending(null);
    },
    [pending]
  );

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {pending && <Dialog options={pending.options} onClose={close} />}
    </ConfirmContext.Provider>
  );
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function Dialog({ options, onClose }: { options: ConfirmOptions; onClose: (v: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = "confirm-title";
  const bodyId = "confirm-body";

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const scrollY = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancelRef.current?.focus(); // the safe choice is focused first

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose(false);
        return;
      }
      if (e.key !== "Tab" || !ref.current) return;
      const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = scrollY;
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => onClose(false)} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={options.body ? bodyId : undefined}
        className="glass toast relative w-full max-w-md p-6 shadow-glow-lg sm:p-7"
      >
        <h2 id={titleId} className="font-display text-lg font-semibold tracking-tight text-white">
          {options.title}
        </h2>
        {options.body && (
          <div id={bodyId} className="mt-3 text-sm leading-relaxed text-zinc-300">
            {options.body}
          </div>
        )}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button ref={cancelRef} type="button" className="btn btn-secondary" onClick={() => onClose(false)}>
            {options.cancelLabel ?? "Cancel"}
          </button>
          <button type="button" className={`btn ${options.tone === "danger" ? "btn-danger" : "btn-primary"}`} onClick={() => onClose(true)}>
            {options.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
