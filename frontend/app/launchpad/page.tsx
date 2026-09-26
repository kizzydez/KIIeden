"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLaunchStates, useLaunchTokens } from "@/lib/data";
import LaunchCard from "@/components/LaunchCard";
import LaunchpadAdminPanel from "@/components/LaunchpadAdminPanel";
import { EmptyState, GridSkeleton, PageHeader } from "@/components/ui";

type Filter = "all" | "active" | "graduated" | "inactive" | "liquidated";

const FILTERS: [Filter, string][] = [
  ["all", "All"],
  ["active", "Active"],
  ["graduated", "Graduated"],
  ["inactive", "Inactive"],
  ["liquidated", "Liquidating / liquidated"],
];

export default function LaunchpadExplorePage() {
  const { data: tokens, isLoading, error } = useLaunchTokens();
  const listed = useMemo(() => (tokens ?? []).map((t) => t.token), [tokens]);
  const { data: states } = useLaunchStates(listed);
  const [filter, setFilter] = useState<Filter>("all");

  // Deleted tokens (removed from the launchpad per the <20-holder rule) are dropped
  // from every list view here — they still work at their direct /launchpad/[address]
  // link for anyone who has it, they just aren't advertised.
  const visible = (tokens ?? []).filter((t) => {
    const s = states?.[t.token.toLowerCase()];
    if (s?.status === "Deleted") return false;
    if (filter === "all") return true;
    if (filter === "active") return s?.status === "Active" && !s.isInactive;
    if (filter === "graduated") return s?.status === "Graduated";
    if (filter === "inactive") return !!s?.isInactive && s.status !== "Liquidated";
    if (filter === "liquidated") return s?.status === "Liquidating" || s?.status === "Liquidated";
    return true;
  });

  return (
    <div>
      <PageHeader
        eyebrow="Launchpad"
        title="Memecoin launchpad"
        subtitle="Fair-launch tokens on a bonding curve — no presale, no team allocation. Everyone buys from the same curve, starting at token zero. Sniping bots are allowed by design; trade in size accordingly."
        right={
          <Link href="/launchpad/create" className="btn btn-secondary">
            Launch a token
          </Link>
        }
      />

      <LaunchpadAdminPanel />

      <div className="seg mb-10 flex-wrap">
        {FILTERS.map(([key, label]) => (
          <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>
            {label}
          </button>
        ))}
      </div>

      {isLoading && <GridSkeleton count={6} />}
      {error && <p className="text-sm text-rose-300">Couldn&apos;t load launchpad tokens. Check your network and RPC configuration.</p>}
      {!isLoading && !error && (tokens ?? []).length === 0 && (
        <EmptyState icon="wallet" title="No tokens launched yet" body="Be the first — creation costs a small, adjustable KII fee." action={{ href: "/launchpad/create", label: "Launch a token" }} />
      )}

      {tokens && tokens.length > 0 && (
        <div className="grid gap-5 md:grid-cols-2 stagger">
          {visible.map((t) => (
            <LaunchCard key={t.token} launch={t} />
          ))}
        </div>
      )}
      {tokens && tokens.length > 0 && visible.length === 0 && <div className="glass px-6 py-8 text-sm text-zinc-400">Nothing matches this filter right now.</div>}

      <p className="mt-16 max-w-2xl text-xs leading-relaxed text-zinc-400">
        Memecoins are highly speculative. A token going 30 days without a trade is automatically liquidated at a discount to its
        holders, largest holder first — see a token&apos;s page for its inactivity status. Listing on the launchpad is not an endorsement.
      </p>
    </div>
  );
}
