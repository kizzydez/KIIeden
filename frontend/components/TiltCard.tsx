"use client";

import { useRef, type ReactNode, type PointerEvent } from "react";

/// A card that tilts in 3D toward the pointer, lifts, and shows a moving light
/// glare. Pure CSS transforms driven by CSS variables (see .tilt in globals.css),
/// so there's no animation library and it stays smooth (one style write per frame).
/// Touch input and reduced-motion users get a plain static card.
export default function TiltCard({
  children,
  className = "",
  max = 5,
  lift = 6,
}: {
  children: ReactNode;
  className?: string;
  max?: number;
  lift?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const raf = useRef<number | null>(null);

  function onMove(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "touch") return;
    const el = ref.current;
    if (!el) return;
    const { clientX, clientY } = e;
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      const px = (clientX - r.left) / r.width;
      const py = (clientY - r.top) / r.height;
      el.style.setProperty("--ry", `${((px - 0.5) * 2 * max).toFixed(2)}deg`);
      el.style.setProperty("--rx", `${((0.5 - py) * 2 * max).toFixed(2)}deg`);
      el.style.setProperty("--ty", `-${lift}px`);
      el.style.setProperty("--gx", `${(px * 100).toFixed(1)}%`);
      el.style.setProperty("--gy", `${(py * 100).toFixed(1)}%`);
      el.classList.add("is-active");
    });
  }

  function onLeave() {
    const el = ref.current;
    if (!el) return;
    if (raf.current) cancelAnimationFrame(raf.current);
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--ty", "0px");
    el.classList.remove("is-active");
  }

  return (
    <div ref={ref} onPointerMove={onMove} onPointerLeave={onLeave} className={`tilt glass glass-hover ${className}`}>
      {children}
      <span className="tilt-glare" aria-hidden />
    </div>
  );
}
