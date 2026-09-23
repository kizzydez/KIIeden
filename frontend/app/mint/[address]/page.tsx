"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAccount, useReadContract } from "wagmi";
import { isAddress } from "viem";
import { ACTIVE_CHAIN_ID, MAX_MINT_PER_TX } from "@/lib/config";
import { collectionAbi } from "@/lib/contracts";
import { useCollectionInfo, useCollectionState, useWhitelistTree } from "@/lib/data";
import { useTx } from "@/lib/useTx";
import { useNow } from "@/lib/useNow";
import { countdown, mintPhase } from "@/lib/status";
import { fmtKii, sameAddr, shortAddr } from "@/lib/format";
import { explorerAddress } from "@/lib/chains";
import { safeHref } from "@/lib/sanitize";
import IpfsImage from "@/components/IpfsImage";
import Icon from "@/components/Icon";
import MintLinkCard from "@/components/MintLinkCard";
import { ErrorNote, Spinner, TxButton } from "@/components/ui";

export default function MintPage() {
  const params = useParams<{ address: string }>();
  const addr = params?.address ?? "";
  if (!isAddress(addr)) return <ErrorNote>This minting link isn&apos;t valid.</ErrorNote>;
  return <MintView collection={addr as `0x${string}`} />;
}

const LINKS: ["website" | "twitter" | "telegram" | "discord", string][] = [
  ["website", "Website"],
  ["twitter", "X"],
  ["telegram", "Telegram"],
  ["discord", "Discord"],
];

function MintView({ collection }: { collection: `0x${string}` }) {
  const { address: account, isConnected } = useAccount();
  const tx = useTx();
  const now = useNow(1000);
  const { data: state, error } = useCollectionState(collection);
  const { data: info } = useCollectionInfo(collection);
  const [qty, setQty] = useState(1);
  const whitelistFile = useWhitelistTree(info?.whitelist?.uri);

  const { data: mintedByMe } = useReadContract({
    address: collection,
    abi: collectionAbi,
    functionName: "mintedBy",
    args: account ? [account] : undefined,
    chainId: ACTIVE_CHAIN_ID,
    query: { enabled: !!account },
  });

  if (error) return <ErrorNote>Couldn&apos;t load this collection. Check the link and that your wallet is on the right network.</ErrorNote>;
  if (!state) {
    return (
      <p className="flex items-center gap-2 text-zinc-400">
        <Spinner /> Loading the mint…
      </p>
    );
  }

  const nowSec = Math.floor(now / 1000);
  const phase = mintPhase(state, nowSec);
  const minted = Number(state.totalSupply);
  const max = Number(state.maxSupply);
  const remaining = Math.max(max - minted, 0);
  const pct = max > 0 ? Math.min(100, (minted / max) * 100) : 0;
  const isOwner = sameAddr(account, state.owner);

  const inWhitelist = phase === "whitelist";
  const unitPrice = inWhitelist ? state.whitelistPrice : state.mintPrice;
  const proof = whitelistFile.data && account ? whitelistFile.data.tree.proofFor(account) : null;
  const isMember = !!proof;
  const rootMismatch = !!whitelistFile.data && whitelistFile.data.tree.root.toLowerCase() !== state.whitelistRoot.toLowerCase();
  const canMintNow = (phase === "live" || (inWhitelist && isMember && !rootMismatch)) && remaining > 0;

  const perWallet = Number(state.maxPerWallet);
  const mine = Number((mintedByMe as bigint | undefined) ?? 0n);
  const walletLeft = perWallet > 0 ? Math.max(perWallet - mine, 0) : Number.POSITIVE_INFINITY;
  const maxQty = Math.max(Math.min(MAX_MINT_PER_TX, remaining, walletLeft), 0);
  const safeQty = Math.min(Math.max(qty, 1), Math.max(maxQty, 1));
  const cost = unitPrice * BigInt(safeQty);

  function mint() {
    const success = { successMessage: `You minted ${safeQty} NFT${safeQty === 1 ? "" : "s"}. They're in your wallet.` };
    if (inWhitelist) {
      if (!proof) return;
      void tx.run("Mint", { address: collection, abi: collectionAbi, functionName: "whitelistMint", args: [BigInt(safeQty), proof], value: cost }, success);
      return;
    }
    void tx.run("Mint", { address: collection, abi: collectionAbi, functionName: "publicMint", args: [BigInt(safeQty)], value: cost }, success);
  }

  const badge =
    phase === "live" ? (
      <span className="badge badge-nft badge-live">Minting live</span>
    ) : phase === "whitelist" ? (
      <span className="badge badge-nft badge-live">Whitelist mint</span>
    ) : phase === "upcoming" ? (
      <span className="badge badge-warn">Mint upcoming</span>
    ) : (
      <span className="badge badge-muted">Mint ended</span>
    );

  const soldOut = remaining === 0;
  const hasWhitelist = state.whitelistRoot !== "0x0000000000000000000000000000000000000000000000000000000000000000";
  const clockLabel = phase === "upcoming" ? (hasWhitelist ? "Whitelist opens in" : "Starts in") : phase === "whitelist" ? "Public mint in" : phase === "live" ? "Ends in" : "";
  const clockValue =
    phase === "upcoming"
      ? countdown((hasWhitelist ? state.whitelistStart : state.mintStart) - nowSec)
      : phase === "whitelist"
        ? countdown(state.mintStart - nowSec)
        : phase === "live"
          ? countdown(state.mintEnd - nowSec)
          : "";
  const revealPending = state.revealTime > 0 && !state.revealed;

  return (
    <div className="mx-auto max-w-4xl">
      {/* banner */}
      <div className="glass overflow-hidden">
        <div className="relative">
          <IpfsImage src={info?.banner || info?.image} alt={`${state.name} collection banner`} className="aspect-[3/1]" />
          <div className="banner-veil" />
          <div className="absolute bottom-5 left-6 right-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow !text-zinc-200">Mint</p>
              <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">{state.name}</h1>
            </div>
            {badge}
          </div>
        </div>
        <div className="p-6 sm:p-8">
          <p className="text-sm text-zinc-400">
            {state.symbol} · created by{" "}
            <a href={explorerAddress(state.owner)} target="_blank" rel="noreferrer" className="text-accent-300 hover:underline">
              {isOwner ? "you" : shortAddr(state.owner)}
            </a>
          </p>
          {info?.description && <p className="mt-4 max-w-2xl text-sm leading-relaxed text-zinc-300">{info.description}</p>}
          {info?.links && (
            <div className="mt-5 flex flex-wrap gap-2">
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
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        {/* mint panel */}
        <div className="glass p-6 sm:p-8 lg:col-span-3">
          <div className="flex items-end justify-between">
            <div>
              <p className="eyebrow">Price</p>
              <p className="mt-1 font-display text-3xl font-semibold tracking-tight text-white">{unitPrice === 0n ? "Free" : `${fmtKii(unitPrice, 6)} KII`}</p>
              {inWhitelist && <p className="mt-1 text-xs text-zinc-400">Whitelist price</p>}
            </div>
            {clockValue && (
              <div className="text-right">
                <p className="eyebrow">{clockLabel}</p>
                <p className="mt-1 font-display text-xl font-semibold text-white tabular-nums">{clockValue}</p>
              </div>
            )}
          </div>

          <div className="mt-6">
            <div className="mb-2 flex justify-between text-xs text-zinc-400">
              <span>
                {minted.toLocaleString()} / {max.toLocaleString()} minted
              </span>
              <span>{pct.toFixed(pct % 1 === 0 ? 0 : 1)}%</span>
            </div>
            <div className="gauge" style={{ height: 8 }}>
              <span style={{ width: `${pct}%` }} />
            </div>
          </div>

          <div className="hairline my-7" />

          {canMintNow && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">Quantity</p>
                  <p className="text-xs text-zinc-400">
                    {perWallet > 0 ? `Limit ${perWallet} per wallet${isConnected ? ` (you have minted ${mine})` : ""}` : `Up to ${MAX_MINT_PER_TX} per transaction`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button type="button" className="btn btn-secondary btn-sm !px-3" onClick={() => setQty(Math.max(1, safeQty - 1))} disabled={safeQty <= 1} aria-label="Decrease quantity">
                    –
                  </button>
                  <span className="w-8 text-center font-display text-lg font-semibold tabular-nums">{safeQty}</span>
                  <button type="button" className="btn btn-secondary btn-sm !px-3" onClick={() => setQty(Math.min(maxQty, safeQty + 1))} disabled={safeQty >= maxQty} aria-label="Increase quantity">
                    +
                  </button>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between text-sm">
                <span className="text-zinc-400">Total</span>
                <span className="font-display text-lg font-semibold text-white">{cost === 0n ? "Free" : `${fmtKii(cost, 6)} KII`}</span>
              </div>

              <TxButton className="mt-5 w-full !py-3.5 text-base" onClick={mint} disabled={!isConnected || maxQty === 0 || tx.busy} busy={tx.pending === "Mint"} busyLabel="Minting…">
                {!isConnected ? "Connect your wallet to mint" : maxQty === 0 ? "Wallet limit reached" : `Mint ${safeQty}`}
              </TxButton>
              {isConnected && mine > 0 && (
                <Link href="/profile" className="mt-4 inline-flex items-center gap-2 text-sm text-accent-300 hover:text-accent-400">
                  View my NFTs <Icon name="arrow" />
                </Link>
              )}
            </>
          )}

          {inWhitelist && !isMember && (
            <p className="text-sm leading-relaxed text-zinc-300" role="status">
              {!isConnected
                ? "Connect your wallet to check whether you are on the whitelist."
                : whitelistFile.isLoading
                  ? "Checking the whitelist"
                  : whitelistFile.error
                    ? "The whitelist file couldn't be loaded. Try again in a moment."
                    : "This wallet is not on the whitelist. The public mint opens when the whitelist window ends."}
            </p>
          )}
          {inWhitelist && rootMismatch && (
            <p className="mt-3 text-sm text-rose-300" role="alert">
              The published whitelist does not match the contract, so whitelist minting is disabled.
            </p>
          )}
          {inWhitelist && isMember && !rootMismatch && <p className="mb-5 text-sm text-emerald-300" role="status">Your wallet is on the whitelist.</p>}

          {phase === "upcoming" && <p className="text-sm leading-relaxed text-zinc-400">Minting opens {new Date(state.mintStart * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}. Come back then.</p>}

          {(phase === "ended" || (phase === "live" && soldOut)) && (
            <div>
              <p className="text-sm leading-relaxed text-zinc-300">{soldOut ? "This collection has minted out." : "The mint has ended."} Buying and selling is now open.</p>
              <Link href={`/collection/${collection}`} className="btn btn-primary mt-5">
                Trade this collection
              </Link>
            </div>
          )}
        </div>

        {/* facts */}
        <div className="space-y-4 lg:col-span-2">
          <div className="glass p-6">
            <p className="eyebrow mb-4">Schedule</p>
            <dl className="space-y-3 text-sm">
              {hasWhitelist && (
                <div className="flex justify-between gap-4">
                  <dt className="text-zinc-400">Whitelist</dt>
                  <dd className="text-right text-zinc-200">
                    {new Date(state.whitelistStart * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} to{" "}
                    {new Date(state.whitelistEnd * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-400">Public mint starts</dt>
                <dd className="text-right text-zinc-200">{new Date(state.mintStart * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-400">Ends</dt>
                <dd className="text-right text-zinc-200">{new Date(state.mintEnd * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</dd>
              </div>
              {state.revealTime > 0 && (
                <div className="flex justify-between gap-4">
                  <dt className="text-zinc-400">Reveal</dt>
                  <dd className="text-right text-zinc-200">
                    {state.revealed ? "Revealed" : new Date(state.revealTime * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-400">Trading</dt>
                <dd className="text-right text-zinc-200">Opens after the mint</dd>
              </div>
            </dl>
          </div>
          {revealPending && (
            <div className="glass p-6">
              <p className="eyebrow">Reveal</p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-300">
                The artwork is hidden until {new Date(state.revealTime * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}. Until then every NFT shows a placeholder image ({countdown(state.revealTime - nowSec)} left).
              </p>
            </div>
          )}
          {isOwner && <MintLinkCard collection={collection} title="Share this link" />}
        </div>
      </div>

      {isOwner && (
        <p className="mt-6 text-sm text-zinc-400">
          You&apos;re the creator.{" "}
          <Link href={`/collection/${collection}`} className="text-accent-300 hover:underline">
            Manage this collection
          </Link>{" "}
          to end the mint early or withdraw mint revenue.
        </p>
      )}
    </div>
  );
}
