"use client";

import Link from "next/link";
import { useCollections, useListings, useRwaAssets } from "@/lib/data";
import { IS_MAINNET } from "@/lib/config";
import NftCard from "@/components/NftCard";
import AssetCard from "@/components/AssetCard";
import HeroScene from "@/components/HeroScene";
import TrendingSection from "@/components/TrendingSection";
import Reveal from "@/components/Reveal";
import AnimatedNumber from "@/components/AnimatedNumber";
import { EmptyState, GridSkeleton, Stat } from "@/components/ui";

const STEPS = [
  { n: "01", title: "Connect a wallet", body: "MetaMask or any EVM wallet. No sign-up, no profile, no database. Your address is your account." },
  { n: "02", title: "Mint first, trade after", body: "Creators upload once and share a minting link. Followers mint. When the mint ends, the collection opens for buying, selling and offers." },
  { n: "03", title: "Own real assets too", body: "Back tokenized real-world assets during their IPO, then trade fractional units on a live demand-and-supply curve." },
];

export default function HomePage() {
  const { data: listings, isLoading: loadingListings, error: listingsError } = useListings();
  const { data: collections } = useCollections();
  const { data: assets, isLoading: loadingAssets } = useRwaAssets();

  return (
    <div>
      {/* ------------------------------------------------------------ hero */}
      <section className="grid lg:grid-cols-2 gap-10 lg:gap-6 items-center pt-4 sm:pt-10 pb-16">
        <div className="page-enter">
          <span className="badge badge-nft badge-live mb-5">{IS_MAINNET ? "Live on KiiChain" : "Live on KiiChain Testnet"}</span>
          <h1 className="font-display text-4xl font-semibold tracking-tight leading-[1.08] sm:text-5xl lg:text-6xl">
            NFTs and real-world assets, <span className="text-gradient">one marketplace.</span>
          </h1>
          <p className="text-zinc-400 mt-5 text-base sm:text-lg max-w-xl leading-relaxed">
            Launch a collection, share a minting link, and trade once the mint ends. Back fractional real-world assets. Wallet-only, on-chain, every image on IPFS.
          </p>
          <div className="flex flex-wrap gap-3 mt-8">
            <Link href="/create/single" className="btn btn-primary !px-6 !py-3.5 text-base">
              Create an NFT
            </Link>
            <Link href="/explore" className="btn btn-secondary !px-6 !py-3.5 text-base">
              Explore market
            </Link>
            <Link href="/rwa" className="btn btn-ghost !py-3.5 text-base">
              RWA assets
            </Link>
          </div>
        </div>
        <div className="order-first lg:order-last">
          <HeroScene />
        </div>
      </section>

      {/* ----------------------------------------------------------- stats */}
      <Reveal>
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-16">
          <Stat label="Collections">
            <AnimatedNumber value={collections?.length ?? 0} />
          </Stat>
          <Stat label="Live listings">
            <AnimatedNumber value={listings?.length ?? 0} />
          </Stat>
          <Stat label="RWA assets">
            <AnimatedNumber value={assets?.length ?? 0} />
          </Stat>
          <Stat label="Network">{IS_MAINNET ? "Mainnet" : "Testnet"}</Stat>
        </section>
      </Reveal>

      {/* ---------------------------------------------------------- trending */}
      <section className="mb-20" aria-labelledby="trending-heading">
        <div className="mb-6">
          <p className="eyebrow mb-2">Right now</p>
          <h2 id="trending-heading" className="font-display text-xl font-semibold tracking-tight text-white">
            Trending
          </h2>
        </div>
        <TrendingSection />
      </section>

      {/* ------------------------------------------------- latest listings */}
      <section className="mb-20">
        <div className="flex items-end justify-between mb-6">
          <h2 className="font-display text-xl font-semibold tracking-tight text-white">Latest listings</h2>
          <Link href="/explore" className="text-sm text-accent-400 hover:text-accent-300">
            View all
          </Link>
        </div>
        {loadingListings && <GridSkeleton count={4} />}
        {listingsError && (
          <p className="text-rose-300 text-sm">Couldn&apos;t load listings — check the RPC in your .env.local and that the contracts are deployed.</p>
        )}
        {!loadingListings && !listingsError && listings?.length === 0 && (
          <EmptyState icon="tag" title="No listings yet" body="Listings appear here once a collection's mint has ended and its owners put NFTs up for sale." action={{ href: "/create/single", label: "Launch an NFT" }} />
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5 stagger">
          {listings?.slice(0, 8).map((l) => (
            <NftCard key={l.listingId.toString()} nft={l.nft} tokenId={l.tokenId} price={l.price} listed href={`/collection/${l.nft}/${l.tokenId.toString()}`} />
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------- RWA strip */}
      <section className="mb-20">
        <div className="flex items-end justify-between mb-6">
          <h2 className="font-display text-xl font-semibold tracking-tight text-white">Real-world assets</h2>
          <Link href="/rwa" className="text-sm text-accent-400 hover:text-accent-300">
            View all
          </Link>
        </div>
        {loadingAssets && <GridSkeleton count={2} />}
        {!loadingAssets && assets?.length === 0 && <EmptyState icon="building" title="No assets listed yet" body="RWA assets are listed by the platform administrator. A listing is not an endorsement or a guarantee." />}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 stagger">
          {assets?.slice(0, 3).map((a) => (
            <AssetCard key={a.asset} asset={a} />
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------ how it works */}
      <section className="mb-4">
        <Reveal>
          <h2 className="mb-8 font-display text-xl font-semibold tracking-tight text-white">How it works</h2>
        </Reveal>
        <div className="grid md:grid-cols-3 gap-5">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 110}>
              <div className="glass glass-hover p-6 h-full">
                <span className="font-display text-4xl font-bold text-gradient">{s.n}</span>
                <h3 className="font-display font-semibold text-white mt-3">{s.title}</h3>
                <p className="text-sm text-zinc-400 mt-2 leading-relaxed">{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>
    </div>
  );
}
