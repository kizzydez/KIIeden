"use client";

import { useEffect, useState } from "react";
import { GATEWAYS, toHttp } from "@/lib/ipfs";
import Icon from "./Icon";

/// Image that loads from IPFS with automatic gateway fallback, a shimmer while
/// loading and a soft fade-in - no broken-image icons if one gateway is down.
export default function IpfsImage({
  src,
  alt,
  className = "",
  fallback,
}: {
  src?: string;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
}) {
  const [idx, setIdx] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setIdx(0);
    setLoaded(false);
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div className={`grid place-items-center bg-base-850 text-zinc-400 ${className}`}>
        {fallback ?? <Icon name="image" className="text-3xl" />}
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-base-850 ${className}`}>
      {!loaded && <div className="skeleton absolute inset-0" />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={toHttp(src, idx)}
        alt={alt}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => {
          if (idx + 1 < GATEWAYS.length && src.length > 0) setIdx(idx + 1);
          else setFailed(true);
        }}
        className={`w-full h-full object-cover transition-all duration-700 ${loaded ? "opacity-100 scale-100" : "opacity-0 scale-105"}`}
      />
    </div>
  );
}
