"use client";

import { useMemo } from "react";
import { useCollections, useListings } from "@/lib/data";
import CollectionBannerCard from "@/components/CollectionBannerCard";
import { EmptyState, GridSkeleton, PageHeader } from "@/components/ui";

export default function CollectionsPage() {
  const { data: collections, isLoading, error } = useCollections();
  const { data: listings } = useListings();

  const floors = useMemo(() => {
    const m = new Map<string, bigint>();
    (listings ?? []).forEach((l) => {
      const k = l.nft.toLowerCase();
      const cur = m.get(k);
      if (cur === undefined || l.price < cur) m.set(k, l.price);
    });
    return m;
  }, [listings]);

  return (
    <div>
      <PageHeader eyebrow="Marketplace" title="Collections" subtitle="Every collection launched on KiiEden, with its mint status and floor price." />
      {isLoading && <GridSkeleton count={4} />}
      {error && <p className="text-sm text-rose-300">Couldn&apos;t load collections. Check your network and RPC configuration.</p>}
      {!isLoading && !error && collections?.length === 0 && (
        <EmptyState icon="layers" title="No collections yet" body="Launch the first one." action={{ href: "/create/collection", label: "Create a collection" }} />
      )}
      <div className="grid gap-6 md:grid-cols-2 stagger">
        {collections?.map((c) => (
          <CollectionBannerCard key={c.collection} c={c} floor={floors.get(c.collection.toLowerCase())} />
        ))}
      </div>
    </div>
  );
}
