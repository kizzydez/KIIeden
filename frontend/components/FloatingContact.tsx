"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BUSINESS, telHref } from "@/lib/business";
import Icon from "./Icon";

/// Floating help button (bottom-right). Opens a small panel with the real contact details
/// (only the ones that are configured) and a link to the FAQ.
export default function FloatingContact() {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    }
    function onClick(e: MouseEvent) {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const tel = telHref(BUSINESS.phone);

  return (
    <div ref={wrap} className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-3 print:hidden">
      {open && (
        <div id="contact-panel" role="dialog" aria-label="Contact and help" className="glass toast w-72 p-5 shadow-glow-lg">
          <p className="font-display text-base font-semibold text-white">Need help?</p>
          <ul className="mt-3 space-y-2.5 text-sm">
            <li>
              <Link href="/faq" onClick={() => setOpen(false)} className="text-accent-300 underline underline-offset-2">
                Read the FAQ
              </Link>
            </li>
            {BUSINESS.contactEmail && (
              <li>
                <a href={`mailto:${BUSINESS.contactEmail}?subject=${encodeURIComponent("KiiEden support")}`} className="text-accent-300 underline underline-offset-2">
                  Email {BUSINESS.contactEmail}
                </a>
              </li>
            )}
            {tel && (
              <li>
                <a href={tel} className="text-accent-300 underline underline-offset-2">
                  Call {BUSINESS.phone}
                </a>
              </li>
            )}
            {!BUSINESS.contactEmail && !tel && <li className="text-zinc-400">Contact details are not configured yet.</li>}
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-zinc-400">We will never ask for your recovery phrase or private key. Never share them with anyone.</p>
        </div>
      )}
      <button
        ref={button}
        type="button"
        className="btn btn-primary !rounded-full !px-4 !py-3 shadow-glow-lg"
        aria-expanded={open}
        aria-controls="contact-panel"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="user" />
        <span>{open ? "Close" : "Help"}</span>
      </button>
    </div>
  );
}
