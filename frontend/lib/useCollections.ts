"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { ADDRESSES, factoryAbi } from "./contracts";

export type CollectionInfo = {
  collection: `0x${string}`;
  creator: `0x${string}`;
  name: string;
  symbol: string;
  maxSupply: bigint;
};

/// Phase 1 has no subgraph, so we read `CollectionCreated` events directly from
/// the chain. This is fine at MVP scale (a getLogs call over the whole chain
/// history) and gets swapped for a subgraph query with the same return shape
/// once indexing ships in Phase 2 — nothing else in the UI needs to change.
export function useCollections() {
  const client = usePublicClient();

  return useQuery({
    queryKey: ["collections", client?.chain?.id],
    enabled: !!client,
    queryFn: async (): Promise<CollectionInfo[]> => {
      if (!client) return [];
      const logs = await client.getContractEvents({
        address: ADDRESSES.factory,
        abi: factoryAbi,
        eventName: "CollectionCreated",
        fromBlock: 0n,
        toBlock: "latest",
      });
      return logs.map((log) => ({
        collection: log.args.collection as `0x${string}`,
        creator: log.args.creator as `0x${string}`,
        name: log.args.name as string,
        symbol: log.args.symbol as string,
        maxSupply: log.args.maxSupply as bigint,
      }));
    },
    staleTime: 30_000,
  });
}
