"use client";

import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { usePublicClient } from "wagmi";
import { ACTIVE_CHAIN_ID, ADDRESSES, isSet } from "./config";
import { collectionAbi, factoryAbi, feeManagerAbi, marketplaceAbi, rwaAssetAbi, rwaChatAbi, rwaCurveAbi, rwaFactoryAbi, rwaMarketplaceAbi } from "./contracts";
import { fetchNftMetadata } from "./ipfs";
import type { CollectionJson } from "./collectionInfo";
import { buildMerkleTree, type MerkleTree } from "./merkle";
import { MAX_WHITELIST_SIZE } from "./config";
import { getEventLogs, type LogClient } from "./logs";
import { mapPool } from "./async";
import { sameAddr } from "./format";

type Address = `0x${string}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ReadClient = LogClient & { readContract: (args: any) => Promise<any> };

/// Public client pinned to the app's chain, independent of which chain the
/// user's wallet happens to be on.
export function useReadClient(): ReadClient | undefined {
  return usePublicClient({ chainId: ACTIVE_CHAIN_ID }) as unknown as ReadClient | undefined;
}

// ---------------------------------------------------------------- protocol fee
/// Work out WHY the fee can't be read and say it in plain language, instead of a
/// generic "check your addresses".
async function diagnoseFeeFailure(client: ReadClient, original: unknown): Promise<string> {
  const rpc = "NEXT_PUBLIC_KII_TESTNET_RPC";
  if (!isSet(ADDRESSES.feeManager)) {
    return "NEXT_PUBLIC_FEE_MANAGER_ADDRESS is empty. Run `npm run deploy:testnet` in contracts/ (it fills frontend/.env.local), then restart `npm run dev`.";
  }
  try {
    await client.getBlockNumber();
  } catch {
    return `Can't reach the KiiChain RPC from the browser (network error or CORS). Try another endpoint in ${rpc}, e.g. https://evmrpc-t.kiichain.nodestake.org/ , then restart npm run dev.`;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const code = await (client as any).getCode({ address: ADDRESSES.feeManager });
    if (!code || code === "0x") {
      return `There is no contract at ${ADDRESSES.feeManager} on chain ${ACTIVE_CHAIN_ID}. The address in .env.local is from a different network or an old deploy — redeploy and restart npm run dev.`;
    }
  } catch {
    /* fall through */
  }
  const msg = original instanceof Error ? original.message : String(original);
  if (/revert|execution reverted|0x/i.test(msg)) {
    return "The FeeManager at this address rejected feeInKii(). It is most likely the OLD version (USD price feed that went stale). Redeploy the new contracts (`npm run deploy:testnet`) — the new FeeManager has a flat fee and cannot go stale.";
  }
  return `Reading the fee failed: ${msg.slice(0, 200)}`;
}

export function useProtocolFee() {
  const client = useReadClient();
  return useQuery({
    queryKey: ["fee", ACTIVE_CHAIN_ID, ADDRESSES.feeManager],
    enabled: !!client && isSet(ADDRESSES.feeManager),
    retry: 1,
    queryFn: async () => {
      try {
        return (await client!.readContract({ address: ADDRESSES.feeManager, abi: feeManagerAbi, functionName: "feeInKii" })) as bigint;
      } catch (e) {
        throw new Error(await diagnoseFeeFailure(client!, e));
      }
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

// ------------------------------------------------------------------ collections
export type CollectionInfo = {
  collection: Address;
  creator: Address;
  name: string;
  symbol: string;
  maxSupply: bigint;
};

export function useCollections() {
  const client = useReadClient();
  return useQuery({
    queryKey: ["collections", ACTIVE_CHAIN_ID, ADDRESSES.factory],
    enabled: !!client && isSet(ADDRESSES.factory),
    queryFn: async (): Promise<CollectionInfo[]> => {
      const logs = await getEventLogs(client!, ACTIVE_CHAIN_ID, {
        address: ADDRESSES.factory,
        abi: factoryAbi,
        eventName: "CollectionCreated",
      });
      return logs
        .map((l) => ({
          collection: l.args.collection as Address,
          creator: l.args.creator as Address,
          name: l.args.name as string,
          symbol: l.args.symbol as string,
          maxSupply: l.args.maxSupply as bigint,
        }))
        .reverse(); // newest first
    },
    staleTime: 20_000,
    refetchInterval: 45_000,
  });
}

// ------------------------------------------- collection info (banner, links) + state
/// The collection's `collection.json` (banner, description, social links, mint dates),
/// located through the contract's `contractURI()`. Works before anything is minted.
export function useCollectionInfo(collection: Address | undefined) {
  const client = useReadClient();
  return useQuery({
    queryKey: ["collectionInfo", ACTIVE_CHAIN_ID, collection],
    enabled: !!client && !!collection,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<CollectionJson | null> => {
      const uri = (await client!.readContract({ address: collection, abi: collectionAbi, functionName: "contractURI" })) as string;
      return (await fetchNftMetadata(uri)) as unknown as CollectionJson | null;
    },
  });
}

export type CollectionState = {
  name: string;
  symbol: string;
  owner: Address;
  totalSupply: bigint;
  maxSupply: bigint;
  mintPrice: bigint;
  mintStart: number; // unix seconds
  mintEnd: number;
  maxPerWallet: bigint;
  mintOpen: boolean;
  tradingOpen: boolean;
  proceeds: bigint;
  whitelistRoot: `0x${string}`;
  whitelistStart: number;
  whitelistEnd: number;
  whitelistPrice: bigint;
  whitelistOpen: boolean;
  revealTime: number; // 0 = no reveal
  revealed: boolean;
};

/// Live mint state of a collection (supply, price, schedule, phase).
export function useCollectionState(collection: Address | undefined) {
  const client = useReadClient();
  return useQuery({
    queryKey: ["collectionState", ACTIVE_CHAIN_ID, collection],
    enabled: !!client && !!collection,
    staleTime: 5_000,
    refetchInterval: 10_000,
    queryFn: async (): Promise<CollectionState> => {
      const r = (fn: string) => client!.readContract({ address: collection, abi: collectionAbi, functionName: fn });
      const [name, symbol, owner, totalSupply, maxSupply, mintPrice, mintStart, mintEnd, maxPerWallet, mintOpen, tradingOpen, proceeds, wlRoot, wlStart, wlEnd, wlPrice, wlOpen, revealTime, revealed] = await Promise.all([
        r("name"),
        r("symbol"),
        r("owner"),
        r("totalSupply"),
        r("maxSupply"),
        r("mintPrice"),
        r("mintStart"),
        r("mintEnd"),
        r("maxPerWallet"),
        r("mintOpen"),
        r("tradingOpen"),
        r("proceeds"),
        r("whitelistRoot"),
        r("whitelistStart"),
        r("whitelistEnd"),
        r("whitelistPrice"),
        r("whitelistOpen"),
        r("revealTime"),
        r("revealed"),
      ]);
      return {
        name: name as string,
        symbol: symbol as string,
        owner: owner as Address,
        totalSupply: totalSupply as bigint,
        maxSupply: maxSupply as bigint,
        mintPrice: mintPrice as bigint,
        mintStart: Number(mintStart as bigint),
        mintEnd: Number(mintEnd as bigint),
        maxPerWallet: maxPerWallet as bigint,
        mintOpen: mintOpen as boolean,
        tradingOpen: tradingOpen as boolean,
        proceeds: proceeds as bigint,
        whitelistRoot: wlRoot as `0x${string}`,
        whitelistStart: Number(wlStart as bigint),
        whitelistEnd: Number(wlEnd as bigint),
        whitelistPrice: wlPrice as bigint,
        whitelistOpen: wlOpen as boolean,
        revealTime: Number(revealTime as bigint),
        revealed: revealed as boolean,
      };
    },
  });
}

// --------------------------------------------------------------------- listings
export type ListingInfo = {
  listingId: bigint;
  seller: Address;
  nft: Address;
  tokenId: bigint;
  price: bigint;
};

const MAX_LISTINGS_SCANNED = 300;

/// Live fixed-price listings. Event logs give the candidate ids; the current
/// `listings(id)` state and the seller's real ownership are then read from the
/// chain, so sold / cancelled / stale listings never show up.
export function useListings() {
  const client = useReadClient();
  return useQuery({
    queryKey: ["listings", ACTIVE_CHAIN_ID, ADDRESSES.marketplace],
    enabled: !!client && isSet(ADDRESSES.marketplace),
    queryFn: async (): Promise<ListingInfo[]> => {
      const logs = await getEventLogs(client!, ACTIVE_CHAIN_ID, {
        address: ADDRESSES.marketplace,
        abi: marketplaceAbi,
        eventName: "Listed",
      });
      const ids = (logs.map((l) => l.args.listingId as bigint) as bigint[]).reverse().slice(0, MAX_LISTINGS_SCANNED);
      const rows = await mapPool(ids, 8, async (id) => {
        const r = (await client!.readContract({
          address: ADDRESSES.marketplace,
          abi: marketplaceAbi,
          functionName: "listings",
          args: [id],
        })) as readonly [Address, Address, bigint, bigint, boolean];
        if (!r[4]) return null;
        const owner = (await client!.readContract({
          address: r[1],
          abi: collectionAbi,
          functionName: "ownerOf",
          args: [r[2]],
        })) as Address;
        if (!sameAddr(owner, r[0])) return null;
        return { listingId: id, seller: r[0], nft: r[1], tokenId: r[2], price: r[3] } as ListingInfo;
      });
      return rows.filter((x): x is ListingInfo => !!x);
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

// ---------------------------------------------------------------------- offers
export type OfferInfo = { offerId: bigint; bidder: Address; amount: bigint; expiresAt: number };

const MAX_OFFERS_SCANNED = 200;

/// Active (not cancelled, accepted or expired) offers on one NFT, highest first. The
/// first entry is the "Sell Now" price.
export function useTokenOffers(nft: Address | undefined, tokenId: bigint | undefined) {
  const client = useReadClient();
  return useQuery({
    queryKey: ["offers", ACTIVE_CHAIN_ID, nft, tokenId?.toString()],
    enabled: !!client && !!nft && tokenId !== undefined && isSet(ADDRESSES.marketplace),
    staleTime: 8_000,
    refetchInterval: 15_000,
    queryFn: async (): Promise<OfferInfo[]> => {
      const logs = await getEventLogs(client!, ACTIVE_CHAIN_ID, {
        address: ADDRESSES.marketplace,
        abi: marketplaceAbi,
        eventName: "OfferMade",
        args: { nft, tokenId },
      });
      const ids = (logs.map((l) => l.args.offerId as bigint) as bigint[]).reverse().slice(0, MAX_OFFERS_SCANNED);
      const nowSec = Math.floor(Date.now() / 1000);
      const rows = await mapPool(ids, 8, async (id) => {
        const o = (await client!.readContract({
          address: ADDRESSES.marketplace,
          abi: marketplaceAbi,
          functionName: "offers",
          args: [id],
        })) as readonly [Address, Address, bigint, bigint, bigint, boolean];
        if (!o[5] || Number(o[4]) <= nowSec) return null;
        return { offerId: id, bidder: o[0], amount: o[3], expiresAt: Number(o[4]) } as OfferInfo;
      });
      return rows.filter((x): x is OfferInfo => !!x).sort((a, b) => (a.amount > b.amount ? -1 : a.amount < b.amount ? 1 : 0));
    },
  });
}

// ------------------------------------------------------------------ owned NFTs
export type OwnedNft = { nft: Address; tokenId: bigint; collectionName: string };

export function useOwnedNfts(owner: Address | undefined) {
  const client = useReadClient();
  const { data: collections } = useCollections();
  return useQuery({
    queryKey: ["owned", ACTIVE_CHAIN_ID, owner, collections?.length ?? -1],
    enabled: !!client && !!owner && !!collections,
    queryFn: async (): Promise<OwnedNft[]> => {
      const perCollection = await mapPool(collections!, 6, async (c) => {
        const bal = (await client!.readContract({
          address: c.collection,
          abi: collectionAbi,
          functionName: "balanceOf",
          args: [owner],
        })) as bigint;
        const n = Number(bal);
        const ids = await mapPool(Array.from({ length: n }, (_, i) => i), 6, async (i) => {
          return (await client!.readContract({
            address: c.collection,
            abi: collectionAbi,
            functionName: "tokenOfOwnerByIndex",
            args: [owner, BigInt(i)],
          })) as bigint;
        });
        return ids
          .filter((x): x is bigint => x !== undefined)
          .map((tokenId) => ({ nft: c.collection, tokenId, collectionName: c.name }));
      });
      return perCollection.flatMap((x) => x ?? []);
    },
    staleTime: 15_000,
  });
}

// ------------------------------------------------------------------------- RWA
export type RwaAssetInfo = {
  asset: Address;
  name: string;
  symbol: string;
  totalUnits: bigint;
  pricePerUnit: bigint;
  ipoStartTime: bigint;
  ipoEndTime: bigint;
  assetTreasury: Address;
};

export function useRwaAssets() {
  const client = useReadClient();
  return useQuery({
    queryKey: ["rwaAssets", ACTIVE_CHAIN_ID, ADDRESSES.rwaFactory],
    enabled: !!client && isSet(ADDRESSES.rwaFactory),
    queryFn: async (): Promise<RwaAssetInfo[]> => {
      const logs = await getEventLogs(client!, ACTIVE_CHAIN_ID, {
        address: ADDRESSES.rwaFactory,
        abi: rwaFactoryAbi,
        eventName: "AssetCreated",
      });
      return logs
        .map((l) => ({
          asset: l.args.asset as Address,
          name: l.args.name as string,
          symbol: l.args.symbol as string,
          totalUnits: l.args.totalUnits as bigint,
          pricePerUnit: l.args.pricePerUnit as bigint,
          ipoStartTime: l.args.ipoStartTime as bigint,
          ipoEndTime: l.args.ipoEndTime as bigint,
          assetTreasury: l.args.assetTreasury as Address,
        }))
        .reverse();
    },
    staleTime: 20_000,
    refetchInterval: 45_000,
  });
}

export type RwaAssetState = { unitsSold: bigint; ipoOpen: boolean; ipoEnded: boolean; metadataUri: string };

async function readRwaState(client: ReadClient, asset: Address): Promise<RwaAssetState> {
  const [unitsSold, ipoOpen, ipoEnded, metadataUri] = await Promise.all([
    client.readContract({ address: asset, abi: rwaAssetAbi, functionName: "unitsSold" }),
    client.readContract({ address: asset, abi: rwaAssetAbi, functionName: "isIpoOpen" }),
    client.readContract({ address: asset, abi: rwaAssetAbi, functionName: "ipoEnded" }),
    client.readContract({ address: asset, abi: rwaAssetAbi, functionName: "assetMetadataURI" }),
  ]);
  return { unitsSold: unitsSold as bigint, ipoOpen: ipoOpen as boolean, ipoEnded: ipoEnded as boolean, metadataUri: metadataUri as string };
}

/// State of every listed asset in one query (used by the RWA explore filters).
export function useRwaStates(assets: RwaAssetInfo[] | undefined) {
  const client = useReadClient();
  return useQuery({
    queryKey: ["rwaStates", ACTIVE_CHAIN_ID, assets?.map((a) => a.asset).join(",") ?? ""],
    enabled: !!client && !!assets && assets.length > 0,
    staleTime: 10_000,
    refetchInterval: 20_000,
    queryFn: async (): Promise<Record<string, RwaAssetState>> => {
      const rows = await mapPool(assets!, 6, (a) => readRwaState(client!, a.asset));
      const out: Record<string, RwaAssetState> = {};
      assets!.forEach((a, i) => {
        const r = rows[i];
        if (r) out[a.asset.toLowerCase()] = r;
      });
      return out;
    },
  });
}

export function useRwaAssetState(asset: Address | undefined, enabled = true) {
  const client = useReadClient();
  return useQuery({
    queryKey: ["rwaState", ACTIVE_CHAIN_ID, asset],
    enabled: enabled && !!client && !!asset,
    queryFn: async (): Promise<RwaAssetState> => readRwaState(client!, asset!),
    staleTime: 10_000,
    refetchInterval: 20_000,
  });
}

export type RwaOrder = { orderId: bigint; seller: Address; remainingUnits: bigint; pricePerUnit: bigint };

export function useRwaOrders(asset: Address | undefined) {
  const client = useReadClient();
  return useQuery({
    queryKey: ["rwaOrders", ACTIVE_CHAIN_ID, asset],
    enabled: !!client && !!asset && isSet(ADDRESSES.rwaMarketplace),
    queryFn: async (): Promise<RwaOrder[]> => {
      const logs = await getEventLogs(client!, ACTIVE_CHAIN_ID, {
        address: ADDRESSES.rwaMarketplace,
        abi: rwaMarketplaceAbi,
        eventName: "OrderPlaced",
        args: { asset },
      });
      const ids = logs.map((l) => l.args.orderId as bigint) as bigint[];
      const rows = await mapPool(ids, 8, async (id) => {
        const r = (await client!.readContract({
          address: ADDRESSES.rwaMarketplace,
          abi: rwaMarketplaceAbi,
          functionName: "orders",
          args: [id],
        })) as readonly [Address, Address, bigint, bigint, boolean];
        if (!r[4] || r[2] === 0n) return null;
        return { orderId: id, seller: r[0], remainingUnits: r[2], pricePerUnit: r[3] } as RwaOrder;
      });
      return rows.filter((x): x is RwaOrder => !!x);
    },
    staleTime: 10_000,
    refetchInterval: 20_000,
  });
}

export type RwaHolding = { asset: Address; name: string; symbol: string; balance: bigint };

export function useRwaHoldings(owner: Address | undefined) {
  const client = useReadClient();
  const { data: assets } = useRwaAssets();
  return useQuery({
    queryKey: ["rwaHoldings", ACTIVE_CHAIN_ID, owner, assets?.length ?? -1],
    enabled: !!client && !!owner && !!assets,
    queryFn: async (): Promise<RwaHolding[]> => {
      const rows = await mapPool(assets!, 6, async (a) => {
        const bal = (await client!.readContract({
          address: a.asset,
          abi: rwaAssetAbi,
          functionName: "balanceOf",
          args: [owner],
        })) as bigint;
        return bal > 0n ? ({ asset: a.asset, name: a.name, symbol: a.symbol, balance: bal } as RwaHolding) : null;
      });
      return rows.filter((x): x is RwaHolding => !!x);
    },
    staleTime: 15_000,
  });
}

// ------------------------------------------------------------- RWA trade curve
export type PoolState = { kiiReserve: bigint; unitReserve: bigint; totalShares: bigint; price: bigint; myShares: bigint };

export function useRwaPool(asset: Address | undefined) {
  const client = useReadClient();
  const { address: account } = useAccount();
  return useQuery({
    queryKey: ["rwaPool", ACTIVE_CHAIN_ID, asset, account],
    enabled: !!client && !!asset && isSet(ADDRESSES.rwaCurve),
    staleTime: 5_000,
    refetchInterval: 10_000,
    queryFn: async (): Promise<PoolState> => {
      const [pool, price, myShares] = await Promise.all([
        client!.readContract({ address: ADDRESSES.rwaCurve, abi: rwaCurveAbi, functionName: "pools", args: [asset] }),
        client!.readContract({ address: ADDRESSES.rwaCurve, abi: rwaCurveAbi, functionName: "price", args: [asset] }),
        account ? client!.readContract({ address: ADDRESSES.rwaCurve, abi: rwaCurveAbi, functionName: "shares", args: [asset, account] }) : Promise.resolve(0n),
      ]);
      const p = pool as readonly [bigint, bigint, bigint];
      return { kiiReserve: p[0], unitReserve: p[1], totalShares: p[2], price: price as bigint, myShares: myShares as bigint };
    },
  });
}

export type TradePoint = { isBuy: boolean; kii: bigint; units: bigint; price: bigint; time: number; trader: Address };

/// Every trade on an asset's curve, oldest first (feeds the candlestick chart).
export function useRwaTrades(asset: Address | undefined) {
  const client = useReadClient();
  return useQuery({
    queryKey: ["rwaTrades", ACTIVE_CHAIN_ID, asset],
    enabled: !!client && !!asset && isSet(ADDRESSES.rwaCurve),
    staleTime: 8_000,
    refetchInterval: 15_000,
    queryFn: async (): Promise<TradePoint[]> => {
      const logs = await getEventLogs(client!, ACTIVE_CHAIN_ID, {
        address: ADDRESSES.rwaCurve,
        abi: rwaCurveAbi,
        eventName: "Trade",
        args: { asset },
      });
      return logs.map((l) => ({
        isBuy: l.args.isBuy as boolean,
        kii: l.args.kiiAmount as bigint,
        units: l.args.unitAmount as bigint,
        price: l.args.priceAfter as bigint,
        time: Number(l.args.timestamp as bigint),
        trader: l.args.trader as Address,
      }));
    },
  });
}

// ------------------------------------------------------------------------ admin
/// True for the RWA factory owner and for wallets the owner added as admins.
export function useIsRwaAdmin() {
  const client = useReadClient();
  const { address } = useAccount();
  const q = useQuery({
    queryKey: ["rwaAdmin", ACTIVE_CHAIN_ID, address],
    enabled: !!client && !!address && isSet(ADDRESSES.rwaFactory),
    staleTime: 60_000,
    queryFn: async (): Promise<boolean> => {
      const [owner, isAdmin] = await Promise.all([
        client!.readContract({ address: ADDRESSES.rwaFactory, abi: rwaFactoryAbi, functionName: "owner" }),
        client!.readContract({ address: ADDRESSES.rwaFactory, abi: rwaFactoryAbi, functionName: "isAdmin", args: [address] }),
      ]);
      return sameAddr(owner as string, address) || (isAdmin as boolean);
    },
  });
  return { isAdmin: q.data === true, isLoading: q.isLoading && !!address };
}

// ------------------------------------------------------------------- whitelist
const treeCache = new Map<string, { tree: MerkleTree; count: number }>();

/// Downloads the creator's published whitelist and rebuilds its Merkle tree, so the
/// app can prove a wallet is on it. Returns null when the collection has no whitelist.
export function useWhitelistTree(uri: string | undefined) {
  return useQuery({
    queryKey: ["whitelistTree", uri],
    enabled: !!uri,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const hit = treeCache.get(uri!);
      if (hit) return hit;
      const json = (await fetchNftMetadata(uri!)) as unknown as { addresses?: string[] } | null;
      const addresses = json?.addresses;
      if (!Array.isArray(addresses) || addresses.length === 0) throw new Error("The whitelist file couldn't be read.");
      if (addresses.length > MAX_WHITELIST_SIZE * 2) throw new Error("The whitelist file is unexpectedly large.");
      const built = { tree: buildMerkleTree(addresses), count: addresses.length };
      treeCache.set(uri!, built);
      return built;
    },
  });
}

// ------------------------------------------------------------- RWA price history
/// Prices recorded by liquidity events (no timestamps), used for all-time high / low.
export function useRwaLiquidityPrices(asset: Address | undefined) {
  const client = useReadClient();
  return useQuery({
    queryKey: ["rwaLiqPrices", ACTIVE_CHAIN_ID, asset],
    enabled: !!client && !!asset && isSet(ADDRESSES.rwaCurve),
    staleTime: 15_000,
    refetchInterval: 30_000,
    queryFn: async (): Promise<bigint[]> => {
      const [added, removed] = await Promise.all([
        getEventLogs(client!, ACTIVE_CHAIN_ID, { address: ADDRESSES.rwaCurve, abi: rwaCurveAbi, eventName: "LiquidityAdded", args: { asset } }),
        getEventLogs(client!, ACTIVE_CHAIN_ID, { address: ADDRESSES.rwaCurve, abi: rwaCurveAbi, eventName: "LiquidityRemoved", args: { asset } }),
      ]);
      return [...added, ...removed].map((l) => l.args.priceAfter as bigint).filter((p) => p > 0n);
    },
  });
}

// ----------------------------------------------------------------- RWA chat
export type ChatMessage = { id: bigint; author: Address; text: string; time: number };

/// Latest visible messages for an asset (newest last). Hidden messages are filtered out.
export function useRwaChat(asset: Address | undefined) {
  const client = useReadClient();
  return useQuery({
    queryKey: ["rwaChat", ACTIVE_CHAIN_ID, asset],
    enabled: !!client && !!asset && isSet(ADDRESSES.rwaChat),
    staleTime: 5_000,
    refetchInterval: 12_000,
    queryFn: async (): Promise<ChatMessage[]> => {
      const logs = await getEventLogs(client!, ACTIVE_CHAIN_ID, { address: ADDRESSES.rwaChat, abi: rwaChatAbi, eventName: "MessagePosted", args: { asset } });
      const latest = logs.slice(-60);
      const rows = await mapPool(latest, 8, async (l) => {
        const id = l.args.messageId as bigint;
        const isHidden = (await client!.readContract({ address: ADDRESSES.rwaChat, abi: rwaChatAbi, functionName: "hidden", args: [id] })) as boolean;
        if (isHidden) return null;
        return { id, author: l.args.author as Address, text: l.args.text as string, time: Number(l.args.timestamp as bigint) } as ChatMessage;
      });
      return rows.filter((x): x is ChatMessage => !!x);
    },
  });
}
