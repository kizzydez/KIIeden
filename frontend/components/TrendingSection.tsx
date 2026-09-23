"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTrendingCollections, useTrendingNfts, useTrendingRwa } from "@/lib/trending";
import { useCollectionInfo, useListings } from "@/lib/data";
import { fetchNftMetadata, type NftMetadata } from "@/lib/ipfs";
import { fmtKii } from "@/lib/format";
import { useNftMetadata } from "./NftCard";
import IpfsImage from "./IpfsImage";
import Icon from "./Icon";

function Box({ title, note, href, hrefLabel, children }: { title: string; note: string; href: string; hrefLabel: string; children: React.ReactNode }) {
  return (
    <section className="glass flex h-full flex-col p-6 sm:p-7" aria-label={title}>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-lg font-semibold tracking-tight text-white">{title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-zinc-400">{note}</p>
        </div>
        <Link href={href} className="shrink-0 text-xs font-medium text-accent-300 hover:text-accent-400" aria-label={hrefLabel}>
          View all
        </Link>
      </div>
      <ol className="flex-1 space-y-3">{children}</ol>
    </section>
  );
}

function Row({ rank, href, image, alt, title, sub, metric }: { rank: number; href: string; image?: string; alt: string; title: string; sub: string; metric: string }) {
  return (
    <li>
      <Link href={href} className="group flex items-center gap-3.5 rounded-xl p-2 -m-2 transition-colors hover:bg-white/[0.04]">
        <span className="w-4 text-center font-display text-sm font-semibold text-zinc-400">{rank}</span>
        <IpfsImage src={image} alt={alt} className="h-14 w-14 shrink-0 rounded-xl" fallback={<Icon name="image" className="text-xl" />} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white group-hover:text-accent-300">{title}</p>
          <p className="truncate text-xs text-zinc-400">{sub}</p>
        </div>
        <p className="shrink-0 text-right text-sm font-semibold text-accent-300">{metric}</p>
      </Link>
    </li>
  );
}

function NftRow({ rank, nft, tokenId, price, sub }: { rank: number; nft: `0x${string}`; tokenId: bigint; price: bigint; sub: string }) {
  const meta = useNftMetadata(nft, tokenId);
  const title = meta?.name || `Token #${tokenId.toString()}`;
  return <Row rank={rank} href={`/collection/${nft}/${tokenId.toString()}`} image={meta?.image} alt={`${title}, NFT artwork`} title={title} sub={sub} metric={`${fmtKii(price)} KII`} />;
}

function CollectionRow({ rank, c, volume, minted, max }: { rank: number; c: { collection: `0x${string}`; name: string; symbol: string }; volume: bigint; minted: bigint; max: bigint }) {
  const { data: info } = useCollectionInfo(c.collection);
  return (
    <Row
      rank={rank}
      href={`/collection/${c.collection}`}
      image={info?.banner || info?.image}
      alt={`${c.name} collection banner`}
      title={c.name}
      sub={`${minted.toString()} / ${max.toString()} minted`}
      metric={volume > 0n ? `${fmtKii(volume)} KII` : "New"}
    />
  );
}

function RwaRowInner({ rank, a, volume, pct, uri }: { rank: number; a: { asset: `0x${string}`; name: string; symbol: string }; volume: bigint; pct: number; uri?: string }) {
  const [meta, setMeta] = useState<NftMetadata | null>(null);
  useEffect(() => {
    let alive = true;
    if (uri) fetchNftMetadata(uri).then((m) => alive && setMeta(m));
    return () => {
      alive = false;
    };
  }, [uri]);
  const title = meta?.name || a.name;
  return (
    <Row
      rank={rank}
      href={`/rwa/${a.asset}`}
      image={meta?.image}
      alt={`${title}, real-world asset photo`}
      title={title}
      sub={a.symbol}
      metric={volume > 0n ? `${fmtKii(volume)} KII / 24h` : `${pct.toFixed(0)}% subscribed`}
    />
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => <li className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-zinc-400">{children}</li>;

/// Three trending boxes for the home page, all computed from on-chain events.
export default function TrendingSection() {
  const { data: nfts } = useTrendingNfts();
  const { data: listings } = useListings();
  const { data: cols } = useTrendingCollections();
  const { data: rwa } = useTrendingRwa();

  // Until there are sales, fall back to the newest listings so the box is never empty.
  const nftRows = nfts && nfts.length > 0 ? nfts.map((n) => ({ ...n, sub: "Recent sale" })) : (listings ?? []).slice(0, 3).map((l) => ({ nft: l.nft, tokenId: l.tokenId, price: l.price, sub: "Newly listed" }));

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Box title="Trending NFTs" note="Highest-priced among the most recent sales." href="/explore" hrefLabel="View all NFTs">
        {nftRows.length === 0 ? <Empty>No sales or listings yet.</Empty> : nftRows.map((n, i) => <NftRow key={`${n.nft}-${n.tokenId}`} rank={i + 1} nft={n.nft} tokenId={n.tokenId} price={n.price} sub={n.sub} />)}
      </Box>

      <Box title="Trending collections" note="Ranked by traded volume, then by share minted." href="/collections" hrefLabel="View all collections">
        {!cols || cols.length === 0 ? <Empty>No collections yet.</Empty> : cols.map((c, i) => <CollectionRow key={c.info.collection} rank={i + 1} c={c.info} volume={c.volume} minted={c.minted} max={c.max} />)}
      </Box>

      <Box title="Trending RWA" note="Ranked by trading volume in the last 24 hours, then by IPO subscription." href="/rwa" hrefLabel="View all RWA assets">
        {!rwa || rwa.length === 0 ? (
          <Empty>No assets listed yet.</Empty>
        ) : (
          rwa.map((r, i) => <RwaRowInner key={r.asset.asset} rank={i + 1} a={r.asset} volume={r.volume24h} pct={r.subscribedPct} uri={r.state?.metadataUri} />)
        )}
      </Box>
    </div>
  );
}
