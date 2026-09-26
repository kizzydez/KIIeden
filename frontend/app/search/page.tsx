"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { isAddress } from "viem";
import { useCollections, useRwaAssets } from "@/lib/data";
import { cleanQuery } from "@/lib/sanitize";
import { PageHeader, EmptyState } from "@/components/ui";
import Icon from "@/components/Icon";

export default function SearchPage() {
  const [raw, setRaw] = useState("");
  const query = cleanQuery(raw);
  const { data: collections } = useCollections();
  const { data: rwa } = useRwaAssets();

  const results = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return { collections: [], rwa: [], addressMatch: null as string | null };
    const addressMatch = isAddress(query) ? query : null;
    return {
      collections: (collections ?? []).filter((c) => c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q) || c.collection.toLowerCase() === q),
      rwa: (rwa ?? []).filter((a) => a.name.toLowerCase().includes(q) || a.symbol.toLowerCase().includes(q) || a.asset.toLowerCase() === q),
      addressMatch,
    };
  }, [query, collections, rwa]);

  const hasResults = results.collections.length > 0 || results.rwa.length > 0 || results.addressMatch;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow="Search" title="Search KiiEden" subtitle="Find a collection or real-world asset by name, symbol, or paste a contract address." />
      <label htmlFor="site-search" className="sr-only">
        Search collections and RWA assets
      </label>
      <div className="relative">
        <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
        <input
          id="site-search"
          className="input !pl-11"
          placeholder="Collection name, symbol, or 0x address"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          autoFocus
        />
      </div>

      {query && !hasResults && (
        <div className="mt-8">
          <EmptyState icon="search" title="No matches" body="Try a different name, symbol, or the full contract address." />
        </div>
      )}

      {results.addressMatch && (
        <div className="mt-8">
          <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-zinc-400">Address</h2>
          <div className="flex flex-wrap gap-3">
            <Link href={`/collection/${results.addressMatch}`} className="btn btn-secondary">
              View as a collection
            </Link>
            <Link href={`/rwa/${results.addressMatch}`} className="btn btn-secondary">
              View as an RWA asset
            </Link>
          </div>
        </div>
      )}

      {results.collections.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-zinc-400">Collections</h2>
          <ul className="glass divide-y divide-white/[0.06] px-5">
            {results.collections.slice(0, 20).map((c) => (
              <li key={c.collection} className="py-3">
                <Link href={`/collection/${c.collection}`} className="text-white hover:text-accent-300">
                  {c.name} <span className="text-zinc-400">({c.symbol})</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {results.rwa.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-zinc-400">Real-world assets</h2>
          <ul className="glass divide-y divide-white/[0.06] px-5">
            {results.rwa.slice(0, 20).map((a) => (
              <li key={a.asset} className="py-3">
                <Link href={`/rwa/${a.asset}`} className="text-white hover:text-accent-300">
                  {a.name} <span className="text-zinc-400">({a.symbol})</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
