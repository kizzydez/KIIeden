"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchNftMetadata } from "@/lib/ipfs";
import { useLaunchpadParams, useLaunchState, type LaunchInfo } from "@/lib/data";
import { fmtKii } from "@/lib/format";
import TiltCard from "./TiltCard";
import IpfsImage from "./IpfsImage";
import Icon from "./Icon";

export type MemeMeta = { name?: string; description?: string; image?: string; twitter?: string; telegram?: string; website?: string };

const STATUS_CLASS: Record<string, string> = {
  Active: "badge-nft badge-live",
  Graduated: "badge-rwa",
  Liquidating: "badge-warn",
  Liquidated: "badge-muted",
  Deleted: "badge-muted",
};

/// Compact memecoin card for the launchpad explore grid: image, name/symbol,
/// live price and a status badge (Active / Inactive / Liquidating / Deleted).
export default function LaunchCard({ launch }: { launch: LaunchInfo }) {
  const { data: state } = useLaunchState(launch.token);
  const { data: params } = useLaunchpadParams();
  const [meta, setMeta] = useState<MemeMeta | null>(null);

  useEffect(() => {
    let alive = true;
    if (launch.metadataURI) fetchNftMetadata(launch.metadataURI).then((m) => alive && setMeta(m as unknown as MemeMeta));
    return () => {
      alive = false;
    };
  }, [launch.metadataURI]);

  const label = state?.isInactive && state.status !== "Deleted" ? "Inactive" : (state?.status ?? "Active");
  const badgeClass = state?.isInactive && state.status !== "Deleted" ? "badge-warn" : STATUS_CLASS[label] ?? "badge-nft";

  return (
    <TiltCard>
      <Link href={`/launchpad/${launch.token}`} className="flex gap-4 rounded-[inherit] p-4">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl sm:h-28 sm:w-28">
          <IpfsImage src={meta?.image} alt={`${launch.name} token art`} className="h-full w-full" fallback={<Icon name="wallet" className="text-3xl" />} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate font-display font-semibold tracking-tight text-white">{launch.name}</h3>
            <span className={`badge shrink-0 ${badgeClass}`}>{label}</span>
          </div>
          <p className="mt-0.5 truncate text-xs text-zinc-400">${launch.symbol}</p>
          <div className="mt-3 flex items-baseline justify-between text-xs">
            <span className="text-zinc-400">
              <span className="text-sm font-semibold text-white">{state ? fmtKii(state.price, 8) : "…"} KII</span>
            </span>
            <span className="text-zinc-400">{state ? `${state.holderCount} holder${state.holderCount === 1 ? "" : "s"}` : ""}</span>
          </div>
          {state && state.status === "Active" && params && params.graduationKiiThreshold > 0n && (
            <div className="mt-2.5">
              <div className="gauge" style={{ height: 4 }}>
                <span style={{ width: `${Math.min(100, Number((state.realKii * 100n) / params.graduationKiiThreshold))}%` }} />
              </div>
              <p className="mt-1.5 text-[11px] text-zinc-400">{fmtKii(state.realKii, 2)} / {fmtKii(params.graduationKiiThreshold, 0)} KII to graduate</p>
            </div>
          )}
        </div>
      </Link>
    </TiltCard>
  );
}
