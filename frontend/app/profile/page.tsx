"use client";

import Link from "next/link";
import { useAccount, useReadContract } from "wagmi";
import { ACTIVE_CHAIN_ID, ADDRESSES } from "@/lib/config";
import { collectionAbi, marketplaceAbi, rwaCurveAbi, rwaMarketplaceAbi } from "@/lib/contracts";
import { useCollections, useCollectionState, useListings, useOwnedNfts, useRwaHoldings, type CollectionInfo } from "@/lib/data";
import { useTx } from "@/lib/useTx";
import { fmtKii, sameAddr, shortAddr } from "@/lib/format";
import { mintPhase } from "@/lib/status";
import { explorerAddress } from "@/lib/chains";
import NftCard from "@/components/NftCard";
import MintLinkCard from "@/components/MintLinkCard";
import { EmptyState, GridSkeleton, PageHeader, TxButton } from "@/components/ui";
import CopyButton from "@/components/CopyButton";

function EarningsCard({
  title,
  amount,
  onWithdraw,
  busy,
  disabled,
}: {
  title: string;
  amount: bigint | undefined;
  onWithdraw: () => void;
  busy: boolean;
  disabled: boolean;
}) {
  const has = amount !== undefined && amount > 0n;
  return (
    <div className={`glass p-5 ${has ? "shadow-glow" : ""}`}>
      <p className="text-[11px] uppercase tracking-widest text-zinc-400 font-semibold">{title}</p>
      <p className="font-display text-3xl font-bold text-white mt-1.5">{amount !== undefined ? fmtKii(amount, 6) : "…"} <span className="text-base text-zinc-400">KII</span></p>
      <TxButton className="mt-4 w-full" variant={has ? "primary" : "secondary"} onClick={onWithdraw} disabled={!has || disabled} busy={busy} busyLabel="Withdrawing…">
        {has ? "Withdraw" : "Nothing to withdraw"}
      </TxButton>
    </div>
  );
}

function CreatedRow({ c }: { c: CollectionInfo }) {
  const tx = useTx();
  const { data: state } = useCollectionState(c.collection);
  if (!state) return null;
  const phase = mintPhase(state, Math.floor(Date.now() / 1000));
  return (
    <div className="glass p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href={`/collection/${c.collection}`} className="font-display text-lg font-semibold tracking-tight text-white hover:text-accent-300">
            {c.name}
          </Link>
          <p className="mt-1 text-sm text-zinc-400">
            {Number(state.totalSupply).toLocaleString()} / {Number(state.maxSupply).toLocaleString()} minted
          </p>
        </div>
        <span className={`badge ${phase === "live" ? "badge-nft badge-live" : phase === "upcoming" ? "badge-warn" : "badge-muted"}`}>
          {phase === "live" ? "Minting live" : phase === "upcoming" ? "Mint upcoming" : "Trading open"}
        </span>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="eyebrow">Mint revenue</p>
          <p className="font-display text-xl font-semibold text-white">{fmtKii(state.proceeds, 6)} KII</p>
        </div>
        <TxButton
          size="sm"
          variant={state.proceeds > 0n ? "primary" : "secondary"}
          disabled={state.proceeds === 0n || tx.busy}
          busy={tx.pending === `Withdraw ${c.name}`}
          busyLabel="Withdrawing…"
          onClick={() => void tx.run(`Withdraw ${c.name}`, { address: c.collection, abi: collectionAbi, functionName: "withdrawProceeds" })}
        >
          Withdraw
        </TxButton>
      </div>
      {phase !== "ended" && (
        <div className="mt-5">
          <MintLinkCard collection={c.collection} title="Minting link" />
        </div>
      )}
    </div>
  );
}

export default function ProfilePage() {
  const { address, isConnected } = useAccount();
  const tx = useTx();

  const { data: nftEarnings } = useReadContract({
    address: ADDRESSES.marketplace,
    abi: marketplaceAbi,
    functionName: "pendingWithdrawals",
    args: address ? [address] : undefined,
    chainId: ACTIVE_CHAIN_ID,
    query: { enabled: !!address },
  });
  const { data: rwaEarnings } = useReadContract({
    address: ADDRESSES.rwaMarketplace,
    abi: rwaMarketplaceAbi,
    functionName: "pendingWithdrawals",
    args: address ? [address] : undefined,
    chainId: ACTIVE_CHAIN_ID,
    query: { enabled: !!address },
  });

  const { data: curveEarnings } = useReadContract({
    address: ADDRESSES.rwaCurve,
    abi: rwaCurveAbi,
    functionName: "pendingWithdrawals",
    args: address ? [address] : undefined,
    chainId: ACTIVE_CHAIN_ID,
    query: { enabled: !!address },
  });

  const { data: collections } = useCollections();
  const created = (collections ?? []).filter((c) => sameAddr(c.creator, address));
  const { data: owned, isLoading: loadingOwned } = useOwnedNfts(address);
  const { data: listings } = useListings();
  const { data: holdings } = useRwaHoldings(address);

  if (!isConnected || !address) {
    return (
      <div>
        <PageHeader eyebrow="Account" title="Profile" subtitle="Your NFTs, collections, RWA holdings and earnings." />
        <EmptyState icon="wallet" title="Connect your wallet" body="Your wallet address is your account — there's nothing to sign up for." />
      </div>
    );
  }

  const listedByKey = new Map((listings ?? []).map((l) => [`${l.nft.toLowerCase()}:${l.tokenId.toString()}`, l.price]));
  const myListings = (listings ?? []).filter((l) => sameAddr(l.seller, address));

  return (
    <div>
      <PageHeader
        eyebrow="Account"
        title="Your profile"
        subtitle={
          <span className="inline-flex items-center gap-1">
            <a href={explorerAddress(address)} target="_blank" rel="noreferrer" className="hover:text-accent-300">
              {shortAddr(address)}
            </a>
            <CopyButton value={address} label="wallet address" />
          </span>
        }
      />

      {/* earnings */}
      <section className="mb-14 grid gap-4 sm:grid-cols-3">
        <EarningsCard
          title="NFT sales & royalties"
          amount={nftEarnings as bigint | undefined}
          onWithdraw={() => void tx.run("Withdraw NFT earnings", { address: ADDRESSES.marketplace, abi: marketplaceAbi, functionName: "withdraw" })}
          busy={tx.pending === "Withdraw NFT earnings"}
          disabled={tx.busy}
        />
        <EarningsCard
          title="RWA unit sales"
          amount={rwaEarnings as bigint | undefined}
          onWithdraw={() => void tx.run("Withdraw RWA earnings", { address: ADDRESSES.rwaMarketplace, abi: rwaMarketplaceAbi, functionName: "withdraw" })}
          busy={tx.pending === "Withdraw RWA earnings"}
          disabled={tx.busy}
        />
        <EarningsCard
          title="RWA trading fees"
          amount={curveEarnings as bigint | undefined}
          onWithdraw={() => void tx.run("Withdraw trading fees", { address: ADDRESSES.rwaCurve, abi: rwaCurveAbi, functionName: "withdraw" })}
          busy={tx.pending === "Withdraw trading fees"}
          disabled={tx.busy}
        />
      </section>

      {/* created collections */}
      {created.length > 0 && (
        <section className="mb-14">
          <h2 className="mb-5 font-display text-xl font-semibold tracking-tight text-white">Created by you</h2>
          <div className="grid gap-5 lg:grid-cols-2">
            {created.map((c) => (
              <CreatedRow key={c.collection} c={c} />
            ))}
          </div>
        </section>
      )}

      {/* my NFTs */}
      <section className="mb-14">
        <h2 className="mb-5 font-display text-xl font-semibold tracking-tight text-white">
          My NFTs <span className="text-zinc-400 text-lg font-normal">{owned ? owned.length : ""}</span>
        </h2>
        {loadingOwned && <GridSkeleton count={4} />}
        {!loadingOwned && owned?.length === 0 && (
          <EmptyState icon="image" title="No NFTs in this wallet yet" body="Mint from a collection's link or buy one on the marketplace." action={{ href: "/explore", label: "Explore" }} />
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5 stagger">
          {owned?.map((n) => {
            const price = listedByKey.get(`${n.nft.toLowerCase()}:${n.tokenId.toString()}`);
            return <NftCard key={`${n.nft}-${n.tokenId}`} nft={n.nft} tokenId={n.tokenId} price={price} listed={price !== undefined} href={`/collection/${n.nft}/${n.tokenId.toString()}`} />;
          })}
        </div>
      </section>

      {/* active listings */}
      {myListings.length > 0 && (
        <section className="mb-14">
          <h2 className="mb-5 font-display text-xl font-semibold tracking-tight text-white">My active listings</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5 stagger">
            {myListings.map((l) => (
              <NftCard key={l.listingId.toString()} nft={l.nft} tokenId={l.tokenId} price={l.price} listed href={`/collection/${l.nft}/${l.tokenId.toString()}`} />
            ))}
          </div>
        </section>
      )}

      {/* RWA holdings */}
      <section>
        <h2 className="mb-5 font-display text-xl font-semibold tracking-tight text-white">My RWA holdings</h2>
        {holdings && holdings.length === 0 && <EmptyState icon="building" title="No RWA units yet" body="Back an asset during its IPO to get started." action={{ href: "/rwa", label: "Browse RWA assets" }} />}
        <div className="grid sm:grid-cols-2 gap-4 stagger">
          {holdings?.map((h) => (
            <Link key={h.asset} href={`/rwa/${h.asset}`} className="glass glass-hover p-5 flex items-center justify-between">
              <div>
                <p className="font-display font-semibold text-white">{h.name}</p>
                <p className="text-xs text-zinc-400">{h.symbol}</p>
              </div>
              <p className="font-display text-xl font-bold text-accent-300">{fmtKii(h.balance, 4)}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
