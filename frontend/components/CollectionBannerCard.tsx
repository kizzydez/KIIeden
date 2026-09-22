```tsx
"use client";

import Link from "next/link";
import {
  useCollectionInfo,
  useCollectionState,
  type CollectionInfo,
} from "@/lib/data";
import { fmtKii, shortAddr } from "@/lib/format";
import { mintPhase } from "@/lib/status";
import TiltCard from "./TiltCard";
import IpfsImage from "./IpfsImage";

const PHASE_BADGE = {
  upcoming: { label: "Mint upcoming", cls: "badge-warn" },
  whitelist: { label: "Whitelist", cls: "badge-warn" },
  live: { label: "Minting live", cls: "badge-nft badge-live" },
  ended: { label: "Trading", cls: "badge-muted" },
} as const;

/// Wide collection card led by the creator's banner. Used on Explore and Collections.
export default function CollectionBannerCard({
  c,
  floor,
}: {
  c: CollectionInfo;
  floor?: bigint;
}) {
  const { data: info } = useCollectionInfo(c.collection);
  const { data: state } = useCollectionState(c.collection);

  const phase = state
    ? mintPhase(state, Math.floor(Date.now() / 1000))
    : undefined;

  const minted = state ? Number(state.totalSupply) : 0;
  const max = state ? Number(state.maxSupply) : Number(c.maxSupply);
  const pct = max > 0 ? Math.min(100, (minted / max) * 100) : 0;

  const href =
    phase === "live"
      ? `/mint/${c.collection}`
      : `/collection/${c.collection}`;

  const phaseBadge = phase ? PHASE_BADGE[phase] : undefined;

  return (
    <TiltCard>
      <Link href={href} className="block rounded-[inherit]">
        <div className="relative overflow-hidden rounded-t-[1.25rem]">
          <IpfsImage
            src={info?.banner || info?.image}
            alt={`${c.name} collection banner`}
            className="aspect-[3/1]"
          />

          <div className="banner-veil" />

          {phaseBadge && (
            <span
              className={`badge absolute left-4 top-4 backdrop-blur ${phaseBadge.cls}`}
            >
              {phaseBadge.label}
            </span>
          )}

          <div className="absolute bottom-3 left-5 right-5">
            <p className="font-display text-lg font-semibold tracking-tight text-white drop-shadow">
              {c.name}
            </p>

            <p className="text-xs text-zinc-200">
              by {shortAddr(c.creator)}
            </p>
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="eyebrow">Minted</p>

              <p className="mt-1 text-sm font-semibold text-white">
                {minted.toLocaleString()} / {max.toLocaleString()}
              </p>
            </div>

            <div>
              <p className="eyebrow">Mint price</p>

              <p className="mt-1 text-sm font-semibold text-white">
                {state
                  ? state.mintPrice === 0n
                    ? "Free"
                    : `${fmtKii(state.mintPrice)} KII`
                  : "—"}
              </p>
            </div>

            <div>
              <p className="eyebrow">Floor</p>

              <p className="mt-1 text-sm font-semibold text-accent-300">
                {floor !== undefined ? `${fmtKii(floor)} KII` : "—"}
              </p>
            </div>
          </div>

          <div className="gauge mt-4" style={{ height: 4 }}>
            <span style={{ width: `${pct}%` }} />
          </div>
        </div>
      </Link>
    </TiltCard>
  );
}
```
