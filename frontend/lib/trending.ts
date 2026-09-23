"use client";

import { useQuery } from "@tanstack/react-query";
import { ACTIVE_CHAIN_ID, ADDRESSES, isSet } from "./config";
import { collectionAbi, marketplaceAbi, rwaCurveAbi } from "./contracts";
import { getEventLogs } from "./logs";
import { mapPool } from "./async";
import { useCollections, useReadClient, useRwaAssets, useRwaStates, type CollectionInfo, type RwaAssetInfo, type RwaAssetState } from "./data";
import { pctOf } from "./format";

type Address = `0x${string}`;

// ------------------------------------------------------------ trending NFTs
export type TrendingNft = { nft: Address; tokenId: bigint; price: bigint };

const RECENT_SALES = 60;

/// Highest-priced NFTs among the most recent sales (fixed-price buys and accepted
/// offers). Everything is read from on-chain events: no server, no tracking.
export function useTrendingNfts() {
  const client = useReadClient();
  return useQuery({
    queryKey: ["trendingNfts", ACTIVE_CHAIN_ID, ADDRESSES.marketplace],
    enabled: !!client && isSet(ADDRESSES.marketplace),
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<TrendingNft[]> => {
      const [sold, accepted] = await Promise.all([
        getEventLogs(client!, ACTIVE_CHAIN_ID, { address: ADDRESSES.marketplace, abi: marketplaceAbi, eventName: "Sold" }),
        getEventLogs(client!, ACTIVE_CHAIN_ID, { address: ADDRESSES.marketplace, abi: marketplaceAbi, eventName: "OfferAccepted" }),
      ]);

      const fromOffers: TrendingNft[] = accepted.map((l) => ({
        nft: l.args.nft as Address,
        tokenId: l.args.tokenId as bigint,
        price: l.args.price as bigint,
      }));

      // Sold events only carry the listing id: look up which NFT it was.
      const soldRows = await mapPool(sold.slice(-RECENT_SALES), 8, async (l) => {
        const r = (await client!.readContract({
          address: ADDRESSES.marketplace,
          abi: marketplaceAbi,
          functionName: "listings",
          args: [l.args.listingId as bigint],
        })) as readonly [Address, Address, bigint, bigint, boolean];
        return { nft: r[1], tokenId: r[2], price: l.args.price as bigint } as TrendingNft;
      });

      const merged = [...fromOffers.slice(-RECENT_SALES), ...soldRows.filter((x): x is TrendingNft => !!x)];
      const best = new Map<string, TrendingNft>();
      for (const s of merged) {
        const k = `${s.nft.toLowerCase()}:${s.tokenId}`;
        const cur = best.get(k);
        if (!cur || s.price > cur.price) best.set(k, s);
      }
      return [...best.values()].sort((a, b) => (a.price > b.price ? -1 : a.price < b.price ? 1 : 0)).slice(0, 3);
    },
  });
}

// --------------------------------------------------------- trending collections
export type TrendingCollection = { info: CollectionInfo; volume: bigint; minted: bigint; max: bigint };

/// Collections ranked by all-time traded volume, then by how much of the supply is minted.
export function useTrendingCollections() {
  const client = useReadClient();
  const { data: collections } = useCollections();
  return useQuery({
    queryKey: ["trendingCollections", ACTIVE_CHAIN_ID, collections?.map((c) => c.collection).join(",") ?? ""],
    enabled: !!client && !!collections && collections.length > 0 && isSet(ADDRESSES.marketplace),
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<TrendingCollection[]> => {
      const rows = await mapPool(collections!.slice(0, 40), 6, async (c) => {
        const [volume, minted] = await Promise.all([
          client!.readContract({ address: ADDRESSES.marketplace, abi: marketplaceAbi, functionName: "collectionVolumeKii", args: [c.collection] }),
          client!.readContract({ address: c.collection, abi: collectionAbi, functionName: "totalSupply" }),
        ]);
        return { info: c, volume: volume as bigint, minted: minted as bigint, max: c.maxSupply } as TrendingCollection;
      });
      return rows
        .filter((x): x is TrendingCollection => !!x)
        .sort((a, b) => {
          if (a.volume !== b.volume) return a.volume > b.volume ? -1 : 1;
          const pa = pctOf(a.minted, a.max);
          const pb = pctOf(b.minted, b.max);
          return pb - pa;
        })
        .slice(0, 3);
    },
  });
}

// -------------------------------------------------------------- trending RWA
export type TrendingRwa = { asset: RwaAssetInfo; state?: RwaAssetState; volume24h: bigint; subscribedPct: number };

/// RWA assets ranked by trading volume in the last 24 hours; assets that haven't started
/// trading are ranked by how much of their IPO is subscribed.
export function useTrendingRwa() {
  const client = useReadClient();
  const { data: assets } = useRwaAssets();
  const { data: states } = useRwaStates(assets);
  return useQuery({
    queryKey: ["trendingRwa", ACTIVE_CHAIN_ID, assets?.map((a) => a.asset).join(",") ?? "", states ? Object.keys(states).length : 0],
    enabled: !!client && !!assets && assets.length > 0,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<TrendingRwa[]> => {
      const trades = isSet(ADDRESSES.rwaCurve)
        ? await getEventLogs(client!, ACTIVE_CHAIN_ID, { address: ADDRESSES.rwaCurve, abi: rwaCurveAbi, eventName: "Trade" })
        : [];
      const since = Math.floor(Date.now() / 1000) - 86400;
      const vol = new Map<string, bigint>();
      for (const t of trades) {
        if (Number(t.args.timestamp as bigint) < since) continue;
        const k = (t.args.asset as string).toLowerCase();
        vol.set(k, (vol.get(k) ?? 0n) + (t.args.kiiAmount as bigint));
      }
      return assets!
        .map((a) => {
          const st = states?.[a.asset.toLowerCase()];
          return { asset: a, state: st, volume24h: vol.get(a.asset.toLowerCase()) ?? 0n, subscribedPct: st ? pctOf(st.unitsSold, a.totalUnits) : 0 } as TrendingRwa;
        })
        .sort((a, b) => {
          if (a.volume24h !== b.volume24h) return a.volume24h > b.volume24h ? -1 : 1;
          return b.subscribedPct - a.subscribedPct;
        })
        .slice(0, 3);
    },
  });
}
