"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useIsRwaAdmin, useRwaAssets, useRwaStates } from "@/lib/data";
import { RWA_PHASE_LABEL, rwaPhase, type RwaPhase } from "@/lib/status";
import AssetCard from "@/components/AssetCard";
import { EmptyState, GridSkeleton, PageHeader } from "@/components/ui";

type Filter = "all" | RwaPhase;

const FILTERS: [Filter, string][] = [
  ["all", "All"],
  ["upcoming", "Upcoming IPO"],
  ["new", "New IPO"],
  ["ongoing", "Ongoing IPO"],
  ["trading", "Trading"],
];

const SECTION_ORDER: RwaPhase[] = ["new", "ongoing", "upcoming", "trading"];
const SECTION_NOTE: Record<RwaPhase, string> = {
  new: "IPOs that opened in the last 3 days.",
  ongoing: "IPOs that are open and have been for a while.",
  upcoming: "IPOs that have been announced and open soon.",
  trading: "The IPO is over. Units trade on the live demand and supply curve.",
};

export default function RwaExplorePage() {
  const { data: assets, isLoading, error } = useRwaAssets();
  const { data: states } = useRwaStates(assets);
  const { isAdmin } = useIsRwaAdmin();
  const [filter, setFilter] = useState<Filter>("all");

  const nowSec = Math.floor(Date.now() / 1000);
  const grouped = useMemo(() => {
    const g: Record<RwaPhase, NonNullable<typeof assets>> = { upcoming: [], new: [], ongoing: [], trading: [] };
    (assets ?? []).forEach((a) => {
      const st = states?.[a.asset.toLowerCase()];
      g[rwaPhase(a, st, nowSec)].push(a);
    });
    return g;
  }, [assets, states, nowSec]);

  const shown = filter === "all" ? SECTION_ORDER : [filter];

  return (
    <div>
      <PageHeader
        eyebrow="Real-world assets"
        title="RWA assets"
        subtitle="Fractional units of real-world assets. Back an asset during its IPO, then trade units on the demand and supply curve. Listing is not an endorsement."
        right={
          isAdmin ? (
            <Link href="/rwa/create" className="btn btn-secondary">
              List an asset
            </Link>
          ) : undefined
        }
      />

      <div className="seg mb-10">
        {FILTERS.map(([key, label]) => (
          <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>
            {label}
            {key !== "all" && assets ? <span className="ml-1.5 text-xs">{grouped[key].length}</span> : null}
          </button>
        ))}
      </div>

      {isLoading && <GridSkeleton count={4} />}
      {error && <p className="text-sm text-rose-300">Couldn&apos;t load RWA assets. Check your network and RPC configuration.</p>}
      {!isLoading && !error && assets?.length === 0 && (
        <EmptyState icon="building" title="No assets listed yet" body="RWA assets are listed by the platform administrator." />
      )}

      {assets && assets.length > 0 && (
        <div className="space-y-14">
          {shown.map((phase) => {
            const list = grouped[phase];
            if (filter === "all" && list.length === 0) return null;
            return (
              <section key={phase}>
                <div className="mb-5">
                  <h2 className="font-display text-xl font-semibold tracking-tight text-white">
                    {RWA_PHASE_LABEL[phase]} <span className="ml-1 text-sm font-normal text-zinc-400">{list.length}</span>
                  </h2>
                  <p className="mt-1 text-sm text-zinc-400">{SECTION_NOTE[phase]}</p>
                </div>
                {list.length === 0 ? (
                  <div className="glass px-6 py-8 text-sm text-zinc-400">Nothing here right now.</div>
                ) : (
                  <div className="grid gap-5 md:grid-cols-2 stagger">
                    {list.map((a) => (
                      <AssetCard key={a.asset} asset={a} state={states?.[a.asset.toLowerCase()]} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <p className="mt-16 max-w-2xl text-xs leading-relaxed text-zinc-400">
        Fractionalized real-world assets can be regulated as securities. Nothing here is legal or investment advice.
      </p>
    </div>
  );
}
