"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAccount } from "wagmi";
import { isAddress } from "viem";
import { collectionAbi } from "@/lib/contracts";
import { safeHref } from "@/lib/sanitize";
import { useCollectionInfo, useCollectionState, useListings } from "@/lib/data";
import { useTx } from "@/lib/useTx";
import { mintPhase } from "@/lib/status";
import { fmtKii, sameAddr, shortAddr } from "@/lib/format";
import { explorerAddress } from "@/lib/chains";
import NftCard from "@/components/NftCard";
import IpfsImage from "@/components/IpfsImage";
import Icon from "@/components/Icon";
import MintLinkCard from "@/components/MintLinkCard";
import { EmptyState, ErrorNote, Spinner, Stat, TxButton } from "@/components/ui";
import { useConfirm } from "@/components/ConfirmDialog";
import CopyButton from "@/components/CopyButton";

const PAGE_SIZE = 60;

export default function CollectionPage() {
  const params = useParams<{ address: string }>();
  const addr = params?.address ?? "";
  if (!isAddress(addr)) return <ErrorNote>That doesn&apos;t look like a valid collection address.</ErrorNote>;
  return <CollectionView collection={addr as `0x${string}`} />;
}

const LINKS: ["website" | "twitter" | "telegram" | "discord", string][] = [
  ["website", "Website"],
  ["twitter", "X"],
  ["telegram", "Telegram"],
  ["discord", "Discord"],
];

function CollectionView({ collection }: { collection: `0x${string}` }) {
  const { address: account } = useAccount();
  const tx = useTx();
  const confirm = useConfirm();
  const { data: listings } = useListings();
  const { data: state, error } = useCollectionState(collection);
  const { data: info } = useCollectionInfo(collection);
  const [visible, setVisible] = useState(PAGE_SIZE);

  if (error) return <ErrorNote>Couldn&apos;t load this collection. It may be on a different network.</ErrorNote>;
  if (!state)
    return (
      <p className="flex items-center gap-2 text-zinc-400">
        <Spinner /> Loading collection…
      </p>
    );

  const supply = Number(state.totalSupply);
  const max = Number(state.maxSupply);
  const phase = mintPhase(state, Math.floor(Date.now() / 1000));
  const isOwner = sameAddr(account, state.owner);

  const mine = (listings ?? []).filter((l) => sameAddr(l.nft, collection));
  const listedByToken = new Map(mine.map((l) => [l.tokenId.toString(), l.price]));
  const floor = mine.reduce<bigint | undefined>((f, l) => (f === undefined || l.price < f ? l.price : f), undefined);

  return (
    <div>
      {/* banner */}
      <div className="glass mb-8 overflow-hidden page-enter">
        <div className="relative">
          <IpfsImage src={info?.banner || info?.image} alt={`${state.name} collection banner`} className="aspect-[3/1]" />
          <div className="banner-veil" />
          <div className="absolute bottom-5 left-6 right-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">{state.name}</h1>
              <p className="mt-1 text-sm text-zinc-200">
                {state.symbol} · by{" "}
                <a href={explorerAddress(state.owner)} target="_blank" rel="noreferrer" className="hover:underline">
                  {isOwner ? "you" : shortAddr(state.owner)}
                </a>{" "}
                · <CopyButton value={collection} label="collection contract address" showText />
              </p>
            </div>
            <span className={`badge ${phase === "live" || phase === "whitelist" ? "badge-nft badge-live" : phase === "upcoming" ? "badge-warn" : "badge-muted"}`}>
              {phase === "live" ? "Minting live" : phase === "whitelist" ? "Whitelist mint" : phase === "upcoming" ? "Mint upcoming" : "Trading open"}
            </span>
          </div>
        </div>
        {(info?.description || info?.links) && (
          <div className="p-6 sm:p-8">
            {info?.description && <p className="max-w-3xl text-sm leading-relaxed text-zinc-300">{info.description}</p>}
            {info?.links && (
              <div className="mt-4 flex flex-wrap gap-2">
                {LINKS.map(([k, label]) => {
                  const href = safeHref(info?.links?.[k]);
                  if (!href) return null;
                  return (
                    <a key={k} href={href} target="_blank" rel="noreferrer noopener" className="btn btn-secondary btn-sm">
                      {label} <Icon name="external" />
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* mint-first notice */}
      {!state.tradingOpen && (
        <div className="glass mb-8 flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <p className="font-display font-semibold text-white">Minting comes first</p>
            <p className="mt-1 text-sm text-zinc-400">Buying, selling and offers open as soon as the mint ends.</p>
          </div>
          <Link href={`/mint/${collection}`} className="btn btn-primary">
            Go to the mint
          </Link>
        </div>
      )}

      {/* creator tools */}
      {isOwner && (
        <div className="mb-10 grid gap-5 lg:grid-cols-2">
          <MintLinkCard collection={collection} />
          <div className="glass p-6">
            <p className="eyebrow">Creator tools</p>
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-white">Mint revenue</p>
                  <p className="font-display text-xl font-semibold text-white">{fmtKii(state.proceeds, 6)} KII</p>
                </div>
                <TxButton
                  variant={state.proceeds > 0n ? "primary" : "secondary"}
                  size="sm"
                  disabled={state.proceeds === 0n || tx.busy}
                  busy={tx.pending === "Withdraw mint revenue"}
                  busyLabel="Withdrawing…"
                  onClick={() => void tx.run("Withdraw mint revenue", { address: collection, abi: collectionAbi, functionName: "withdrawProceeds" })}
                >
                  Withdraw
                </TxButton>
              </div>
              {state.revealTime > 0 && !state.revealed && (
                <div className="flex items-center justify-between gap-4 border-t border-white/[0.06] pt-4">
                  <div>
                    <p className="text-sm font-medium text-white">Reveal the artwork now</p>
                    <p className="text-xs text-zinc-400">Scheduled for {new Date(state.revealTime * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}. Revealing early can&apos;t be undone.</p>
                  </div>
                  <TxButton size="sm" disabled={tx.busy} busy={tx.pending === "Reveal artwork"} busyLabel="Revealing…" onClick={() => void tx.run("Reveal artwork", { address: collection, abi: collectionAbi, functionName: "revealNow" })}>
                    Reveal now
                  </TxButton>
                </div>
              )}
              {!state.tradingOpen && (
                <div className="flex items-center justify-between gap-4 border-t border-white/[0.06] pt-4">
                  <div>
                    <p className="text-sm font-medium text-white">End the mint now</p>
                    <p className="text-xs text-zinc-400">Closes minting and opens trading immediately. Can&apos;t be undone.</p>
                  </div>
                  <TxButton
                    variant="danger"
                    size="sm"
                    disabled={tx.busy}
                    busy={tx.pending === "End mint"}
                    busyLabel="Ending…"
                    onClick={async () => {
                      const sure = await confirm({
                        title: "End the mint now?",
                        body: "This closes minting immediately and opens trading. Anyone who hasn't minted yet will no longer be able to.",
                        confirmLabel: "End mint",
                        tone: "danger",
                      });
                      if (sure) void tx.run("End mint", { address: collection, abi: collectionAbi, functionName: "endMint" });
                    }}
                  >
                    End mint
                  </TxButton>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mb-12 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Minted">
          {supply.toLocaleString()}
          <span className="text-lg text-zinc-400"> / {max.toLocaleString()}</span>
        </Stat>
        <Stat label="Listed">{mine.length}</Stat>
        <Stat label="Floor">{floor !== undefined ? `${fmtKii(floor)} KII` : "—"}</Stat>
        <Stat label="Mint price">{state.mintPrice === 0n ? "Free" : `${fmtKii(state.mintPrice)} KII`}</Stat>
      </div>

      {supply === 0 ? (
        <EmptyState icon="image" title="Nothing minted yet" body="NFTs appear here as followers mint them." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4 stagger">
            {Array.from({ length: Math.min(supply, visible) }, (_, i) => {
              const price = listedByToken.get(String(i));
              return <NftCard key={i} nft={collection} tokenId={BigInt(i)} price={price} listed={price !== undefined} unrevealed={state.revealTime > 0 && !state.revealed} href={`/collection/${collection}/${i}`} />;
            })}
          </div>
          {supply > visible && (
            <div className="mt-10 text-center">
              <button className="btn btn-secondary" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
                Show more ({(supply - visible).toLocaleString()} left)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
