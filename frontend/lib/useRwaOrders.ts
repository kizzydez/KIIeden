"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { ADDRESSES, rwaMarketplaceAbi } from "./contracts";

export type RwaOrder = {
  orderId: bigint;
  seller: `0x${string}`;
  remainingUnits: bigint;
  pricePerUnit: bigint;
};

export function useRwaOrders(asset: `0x${string}` | undefined) {
  const client = usePublicClient();

  return useQuery({
    queryKey: ["rwaOrders", asset, client?.chain?.id],
    enabled: !!client && !!asset,
    queryFn: async (): Promise<RwaOrder[]> => {
      if (!client || !asset) return [];
      const logs = await client.getContractEvents({
        address: ADDRESSES.rwaMarketplace,
        abi: rwaMarketplaceAbi,
        eventName: "OrderPlaced",
        args: { asset },
        fromBlock: 0n,
        toBlock: "latest",
      });

      const ids = logs.map((l) => l.args.orderId as bigint);
      if (ids.length === 0) return [];

      const results = await client.multicall({
        contracts: ids.map((id) => ({
          address: ADDRESSES.rwaMarketplace,
          abi: rwaMarketplaceAbi,
          functionName: "orders",
          args: [id],
        })),
      });

      const orders: RwaOrder[] = [];
      results.forEach((r, i) => {
        if (r.status !== "success") return;
        const [seller, , remainingUnits, pricePerUnit, active] = r.result as unknown as [
          `0x${string}`,
          `0x${string}`,
          bigint,
          bigint,
          boolean
        ];
        if (active && remainingUnits > 0n) {
          orders.push({ orderId: ids[i], seller, remainingUnits, pricePerUnit });
        }
      });
      return orders;
    },
    staleTime: 15_000,
  });
}
