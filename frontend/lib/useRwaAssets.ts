"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { ADDRESSES, rwaFactoryAbi } from "./contracts";

export type RwaAssetInfo = {
  asset: `0x${string}`;
  name: string;
  symbol: string;
  totalUnits: bigint;
  pricePerUnit: bigint;
  ipoEndTime: bigint;
  assetTreasury: `0x${string}`;
};

export function useRwaAssets() {
  const client = usePublicClient();

  return useQuery({
    queryKey: ["rwaAssets", client?.chain?.id],
    enabled: !!client,
    queryFn: async (): Promise<RwaAssetInfo[]> => {
      if (!client) return [];
      const logs = await client.getContractEvents({
        address: ADDRESSES.rwaFactory,
        abi: rwaFactoryAbi,
        eventName: "AssetCreated",
        fromBlock: 0n,
        toBlock: "latest",
      });
      return logs.map((log) => ({
        asset: log.args.asset as `0x${string}`,
        name: log.args.name as string,
        symbol: log.args.symbol as string,
        totalUnits: log.args.totalUnits as bigint,
        pricePerUnit: log.args.pricePerUnit as bigint,
        ipoEndTime: log.args.ipoEndTime as bigint,
        assetTreasury: log.args.assetTreasury as `0x${string}`,
      }));
    },
    staleTime: 30_000,
  });
}
