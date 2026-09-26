"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchNftMetadata, type NftMetadata } from "@/lib/ipfs";
import { useRwaAssetState, type RwaAssetInfo, type RwaAssetState } from "@/lib/data";
import { fmtKii, pctOf, timeLeft } from "@/lib/format";
import { RWA_PHASE_LABEL, rwaPhase, type RwaPhase } from "@/lib/status";
import TiltCard from "./TiltCard";
import IpfsImage from "./IpfsImage";
import Icon from "./Icon";

const PHASE_CLASS: Record<RwaPhase, string> = {
  upcoming: "badge-warn",
  new: "badge-nft badge-live",
  ongoing: "badge-nft",
  trading: "badge-rwa",
};

/// Compact RWA card: a small preview image on the left, key numbers on the right.
/// Pass `state` when the parent already loaded it (avoids a second request).
export default function AssetCard({ asset, state: given }: { asset: RwaAssetInfo; state?: RwaAssetState }) {
  const own = useRwaAssetState(asset.asset, !given);
  const state = given ?? own.data;
  const [meta, setMeta] = useState<NftMetadata | null>(null);

  useEffect(() => {
    let alive = true;
    if (state?.metadataUri) fetchNftMetadata(state.metadataUri).then((m) => alive && setMeta(m));
    return () => {
      alive = false;
    };
  }, [state?.metadataUri]);

  const nowSec = Math.floor(Date.now() / 1000);
  const phase = rwaPhase(asset, state, nowSec);
  const pct = state ? pctOf(state.unitsSold, asset.totalUnits) : 0;
  const title = meta?.name || asset.name;
  const loc = [meta?.properties?.location?.city, meta?.properties?.location?.country].filter(Boolean).join(", ");

  const timing =
    phase === "upcoming"
      ? `opens in ${timeLeft(Number(asset.ipoStartTime))}`
      : phase === "trading"
        ? "live trading"
        : `ends in ${timeLeft(Number(asset.ipoEndTime))}`;

  return (
    <TiltCard>
      <Link href={`/rwa/${asset.asset}`} className="flex gap-4 rounded-[inherit] p-4">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl sm:h-28 sm:w-28">
          <IpfsImage src={meta?.image} alt={`${title}, real-world asset photo`} className="h-full w-full" fallback={<Icon name="building" className="text-3xl" />} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate font-display font-semibold tracking-tight text-white">{title}</h3>
            <span className={`badge shrink-0 ${PHASE_CLASS[phase]}`}>{RWA_PHASE_LABEL[phase]}</span>
          </div>
          <p className="mt-0.5 truncate text-xs text-zinc-400">
            {asset.symbol}
            {loc ? ` · ${loc}` : ""}
          </p>
          <div className="mt-3 flex items-baseline justify-between text-xs">
            <span className="text-zinc-400">
              <span className="text-sm font-semibold text-white">{fmtKii(asset.pricePerUnit)} KII</span> / unit
            </span>
            <span className="text-zinc-400">{timing}</span>
          </div>
          <div className="gauge mt-2.5" style={{ height: 4 }}>
            <span style={{ width: `${phase === "upcoming" ? 0 : pct}%` }} />
          </div>
          <p className="mt-1.5 text-[11px] text-zinc-400">{phase === "upcoming" ? "Not open yet" : `${pct.toFixed(pct % 1 === 0 ? 0 : 1)}% subscribed`}</p>
        </div>
      </Link>
    </TiltCard>
  );
}
