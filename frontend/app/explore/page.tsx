"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useCollections, useListings } from "@/lib/data";
import NftCard from "@/components/NftCard";
import CollectionBannerCard from "@/components/CollectionBannerCard";
import { EmptyState, GridSkeleton, PageHeader } from "@/components/ui";

type Sort = "recent" | "low" | "high";

export default function ExplorePage() {
  const { data: listings, isLoading, error } = useListings();
  const { data: collections, isLoading: loadingCollections } = useCollections();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("recent");

  const floors = useMemo(() => {
    const m = new Map<string, bigint>();
    (listings ?? []).forEach((l) => {
      const k = l.nft.toLowerCase();
      const cur = m.get(k);
      if (cur === undefined || l.price < cur) m.set(k, l.price);
    });
    return m;
  }, [listings]);

  const visible = useMemo(() => {
    let rows = listings ?? [];
    const q = query.trim().toLowerCase();
    if (q) rows = rows.filter((l) => l.nft.toLowerCase().includes(q) || l.tokenId.toString() === q || l.seller.toLowerCase().includes(q));
    if (sort === "low") rows = [...rows].sort((a, b) => (a.price < b.price ? -1 : a.price > b.price ? 1 : 0));
    if (sort === "high") rows = [...rows].sort((a, b) => (a.price > b.price ? -1 : a.price < b.price ? 1 : 0));
    return rows;
  }, [listings, query, sort]);

  return (
    <div>
      <PageHeader eyebrow="Marketplace" title="Explore" subtitle="Collections minting now, and every NFT listed for sale." />

      {/* collection banners */}
      <section className="mb-16">
        <div className="mb-6 flex items-end justify-between">
          <h2 className="font-display text-xl font-semibold tracking-tight text-white">Collections</h2>
          <Link href="/collections" className="text-sm text-accent-300 hover:text-accent-400">
            View all
          </Link>
        </div>
        {loadingCollections && <GridSkeleton count={2} />}
        {!loadingCollections && collections?.length === 0 && (
          <EmptyState icon="layers" title="No collections yet" body="Launch the first collection and share its minting link." action={{ href: "/create/collection", label: "Create a collection" }} />
        )}
        <div className="grid gap-6 md:grid-cols-2 stagger">
          {collections?.slice(0, 6).map((c) => (
            <CollectionBannerCard key={c.collection} c={c} floor={floors.get(c.collection.toLowerCase())} />
          ))}
        </div>
      </section>

      {/* listings */}
      <section>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <h2 className="font-display text-xl font-semibold tracking-tight text-white">Listed for sale</h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input className="input sm:w-72" aria-label="Search NFTs by collection address, token number or seller" placeholder="Search by collection, token or seller" value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="seg">
              {([
                ["recent", "Recent"],
                ["low", "Price low"],
                ["high", "Price high"],
              ] as [Sort, string][]).map(([key, label]) => (
                <button key={key} onClick={() => setSort(key)} aria-pressed={sort === key}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {isLoading && <GridSkeleton />}
        {error && <p className="text-sm text-rose-300">Couldn&apos;t load listings. Check your network and RPC configuration.</p>}
        {!isLoading && !error && visible.length === 0 && (
          <EmptyState
            icon="search"
            title={query ? "Nothing matches your search" : "No NFTs are listed yet"}
            body={query ? "Try a different address or token number." : "Once a collection's mint ends, its owners can list NFTs here."}
          />
        )}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4 stagger">
          {visible.map((l) => (
            <NftCard key={l.listingId.toString()} nft={l.nft} tokenId={l.tokenId} price={l.price} listed href={`/collection/${l.nft}/${l.tokenId.toString()}`} />
          ))}
        </div>
      </section>
    </div>
  );
}
