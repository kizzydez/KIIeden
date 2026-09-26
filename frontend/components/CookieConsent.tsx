"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { onConsentChange, readConsent, saveConsent } from "@/lib/consent";

/// Storage notice. There are no analytics, advertising or tracking cookies or scripts in this
/// app, so the choice covers one thing: remembering your upload key on this device.
/// Both buttons have equal weight, and the site works the same either way.
export default function CookieConsent() {
  const [open, setOpen] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const sync = () => setOpen(readConsent() === null);
    sync();
    return onConsentChange(sync);
  }, []);

  useEffect(() => {
    // when the banner is re-opened from the footer, move keyboard focus into it
    if (open && document.activeElement && document.activeElement.getAttribute("data-cookie-settings") !== null) headingRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div role="region" aria-labelledby="cookie-heading" className="fixed inset-x-3 bottom-3 z-[90] mx-auto max-w-3xl">
      <div className="glass p-5 shadow-glow-lg sm:p-6">
        <h2 id="cookie-heading" ref={headingRef} tabIndex={-1} className="font-display text-base font-semibold text-white outline-none">
          Your privacy choices
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-300">
          We use no analytics, advertising or tracking. Your browser keeps what is strictly necessary (this choice, and your wallet connection so you stay connected). One optional item remains: remembering your Pinata upload key on this device. Without it, the key is forgotten when you close the tab.{" "}
          <Link href="/cookies" className="text-accent-300 underline underline-offset-2">
            Cookies and storage details
          </Link>{" "}
          ·{" "}
          <Link href="/privacy" className="text-accent-300 underline underline-offset-2">
            Privacy Policy
          </Link>
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" className="btn btn-primary" onClick={() => saveConsent(true)}>
            Allow optional storage
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => saveConsent(false)}>
            Necessary only
          </button>
        </div>
      </div>
    </div>
  );
}
