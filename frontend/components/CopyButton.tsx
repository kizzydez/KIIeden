"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // older browsers / insecure context: fall back to a temporary textarea
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

/// Copies `value` to the clipboard and confirms it visibly and to screen readers.
/// `label` names what is copied, e.g. "wallet address".
export default function CopyButton({ value, label, className = "", showText = false }: { value: string; label: string; className?: string; showText?: boolean }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  async function onClick() {
    const ok = await copyText(value);
    setState(ok ? "copied" : "failed");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2000);
  }

  return (
    <button
      type="button"
      onClick={() => void onClick()}
      className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium text-accent-300 transition-colors hover:bg-white/5 ${className}`}
      aria-label={`Copy ${label}`}
    >
      <Icon name={state === "copied" ? "check" : "copy"} />
      {showText && <span aria-hidden>{state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy"}</span>}
      <span className="sr-only" role="status" aria-live="polite">
        {state === "copied" ? `${label} copied` : state === "failed" ? "Copy failed. Select the text and copy it manually." : ""}
      </span>
    </button>
  );
}
