"use client";

import { useEffect } from "react";

/// Fixed ambient backdrop: drifting purple aurora, faint grid, and a soft light
/// that follows the cursor (sets --mx/--my on <html>, one rAF-throttled write).
export default function Background() {
  useEffect(() => {
    const fine = window.matchMedia?.("(pointer: fine)").matches;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!fine || reduce) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        document.documentElement.style.setProperty("--mx", `${e.clientX}px`);
        document.documentElement.style.setProperty("--my", `${e.clientY}px`);
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="app-bg" aria-hidden>
      <div className="aurora">
        <i />
        <i />
        <i />
      </div>
      <div className="grid-overlay" />
      <div className="spotlight" />
    </div>
  );
}
