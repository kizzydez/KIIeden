"use client";

import { useRef, type PointerEvent } from "react";
import Image from "next/image";

/// Interactive 3D hero built with pure CSS 3D transforms: the KiiEden "K" floats
/// inside two orbiting rings, with glass NFT/RWA cards at different depths.
/// Moving the pointer over it rotates the whole scene; on touch devices it just
/// idles with the float animations.
export default function HeroScene() {
  const stage = useRef<HTMLDivElement>(null);

  function onMove(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "touch" || !stage.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    stage.current.style.setProperty("--hry", `${(px * 26).toFixed(2)}deg`);
    stage.current.style.setProperty("--hrx", `${(-py * 20).toFixed(2)}deg`);
  }
  function onLeave() {
    if (!stage.current) return;
    stage.current.style.setProperty("--hry", "0deg");
    stage.current.style.setProperty("--hrx", "0deg");
  }

  return (
    <div className="hero-3d relative w-full aspect-square max-w-[560px] mx-auto" onPointerMove={onMove} onPointerLeave={onLeave} aria-hidden>
      <div ref={stage} className="hero-stage">
        <div className="hero-layer hero-orb" />
        <div className="hero-layer hero-floor" />
        <div className="hero-layer hero-ring r1" />
        <div className="hero-layer hero-ring r2" />

        <div className="hero-layer hero-logo">
          <Image src="/logo-k.png" alt="" width={600} height={600} priority />
        </div>

        {/* NFT card */}
        <div className="hero-layer" style={{ left: "-2%", top: "8%", transform: "translateZ(150px) rotateY(14deg)" }}>
          <div className="hero-card hero-bob" style={{ width: "clamp(132px, 30vw, 172px)" }}>
            <div className="art" style={{ background: "linear-gradient(135deg,#ff7ad9 0%,#8339ff 55%,#2b0f66 100%)" }} />
            <p className="text-[11px] font-semibold text-white">Genesis #014</p>
            <div className="flex items-center justify-between mt-0.5">
              <span className="badge badge-nft !py-0.5 !px-2 !text-[10px]">NFT</span>
              <span className="text-[11px] font-bold text-accent-300">12.4 KII</span>
            </div>
          </div>
        </div>

        {/* RWA card */}
        <div className="hero-layer" style={{ right: "-2%", bottom: "12%", transform: "translateZ(170px) rotateY(-14deg)" }}>
          <div className="hero-card hero-bob" style={{ width: "clamp(140px, 32vw, 184px)", animationDelay: "-2.4s" }}>
            <div className="art" style={{ background: "linear-gradient(160deg,#34d399 0%,#0ea5a4 45%,#0b2a3f 100%)" }} />
            <p className="text-[11px] font-semibold text-white">Skyline Tower</p>
            <div className="gauge mt-1.5" style={{ height: 6 }}>
              <span style={{ width: "82%" }} />
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="badge badge-rwa !py-0.5 !px-2 !text-[10px]">RWA</span>
              <span className="text-[11px] font-bold text-emerald-300">82% funded</span>
            </div>
          </div>
        </div>

        {/* small accent card */}
        <div className="hero-layer" style={{ left: "6%", bottom: "6%", transform: "translateZ(60px) rotateY(10deg)" }}>
          <div className="hero-card hero-bob" style={{ width: "clamp(104px, 24vw, 128px)", animationDelay: "-4.2s" }}>
            <div className="art" style={{ aspectRatio: "1.5", background: "linear-gradient(135deg,#fbbf24 0%,#f472b6 50%,#6a1fe0 100%)" }} />
            <p className="text-[11px] font-semibold text-white">Eden Pass</p>
          </div>
        </div>
      </div>
    </div>
  );
}
