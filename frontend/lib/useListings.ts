"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { ADDRESSES, marketplaceAbi } from "./contracts";

export type ListingInfo = {
  listingId: bigint;
  seller: `0x${string}`;
  nft: `0x${string}`;
  tokenId: bigint;
  price: bigint;
};

/// Reads the current on-chain `listings` mapping for every Listed event seen so
/// far, so cancelled/sold listings (active=false) are filtered out with fresh
/// state rather than trusting stale event data. Same "swap for subgraph later"
/// note as useCollections.
export function useListings() {
  const client = usePublicClient();

  return useQuery({
    queryKey: ["listings", client?.chain?.id],
    enabled: !!client,
    queryFn: async (): Promise<ListingInfo[]> => {
      if (!client) return [];
      const logs = await client.getContractEvents({
        address: ADDRESSES.marketplace,
        abi: marketplaceAbi,
        eventName: "Listed",
        fromBlock: 0n,
        toBlock: "latest",
      });

      const ids = logs.map((l) => l.args.listingId as bigint);
      if (ids.length === 0) return [];

      const results = await client.multicall({
        contracts: ids.map((id) => ({
          address: ADDRESSES.marketplace,
          abi: marketplaceAbi,
          functionName: "listings",
          args: [id],
        })),
      });

      const listings: ListingInfo[] = [];
      results.forEach((r, i) => {
        if (r.status !== "success") return;
        const [seller, nft, tokenId, price, active] = r.result as unknown as [
          `0x${string}`,
          `0x${string}`,
          bigint,
          bigint,
          boolean
        ];
        if (active) {
          listings.push({ listingId: ids[i], seller, nft, tokenId, price });
        }
      });
      return listings;
    },
    staleTime: 15_000,
  });
}
