"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useAccount } from "wagmi";
import { isAddress } from "viem";
import { ADDRESSES } from "@/lib/config";
import { launchpadAbi } from "@/lib/contracts";
import { useLaunchState, useLaunchTrades } from "@/lib/data";
import { useTx } from "@/lib/useTx";
import { fmtKii, sameAddr, shortAddr, timeAgo } from "@/lib/format";
import { fetchNftMetadata } from "@/lib/ipfs";
import { safeHref } from "@/lib/sanitize";
import { explorerAddress } from "@/lib/chains";
import { buildCandles, TIMEFRAMES } from "@/lib/candles";
import type { TradePoint } from "@/lib/data";
import IpfsImage from "@/components/IpfsImage";
import Icon from "@/components/Icon";
import CandleChart from "@/components/CandleChart";
import MemeTradePanel from "@/components/MemeTradePanel";
import CopyButton from "@/components/CopyButton";
import { ErrorNote, Stat, TxButton } from "@/components/ui";
import type { MemeMeta } from "@/components/LaunchCard";

type Address = `0x${string}`;

export default function LaunchpadTokenPage() {
  const params = useParams<{ address: string }>();
  const addr = params?.address ?? "";
  if (!isAddress(addr)) return <ErrorNote>That token link isn&apos;t valid.</ErrorNote>;
  return <TokenView token={addr as Address} />;
}

const STATUS_TEXT: Record<string, string> = {
  Active: "Trading on the bonding curve.",
  Graduated: "Graduated — trading as a standard pool, and the max-wallet cap no longer applies.",
  Liquidating: "Inactive for 30 days. Holders are being bought out, largest holder first, at a discount.",
  Liquidated: "Fully liquidated — every holder has been paid out. Trading is closed.",
  Deleted: "Removed from the launchpad after liquidation (had fewer than 20 holders when it went inactive).",
};

function TokenView({ token }: { token: Address }) {
  const { address: account } = useAccount();
  const tx = useTx();
  const { data: state, isLoading } = useLaunchState(token);
  const { data: trades } = useLaunchTrades(token);
  const [meta, setMeta] = useState<MemeMeta | null>(null);

  useEffect(() => {
    let alive = true;
    if (state?.metadataURI) fetchNftMetadata(state.metadataURI).then((m) => alive && setMeta(m as unknown as MemeMeta));
    return () => {
      alive = false;
    };
  }, [state?.metadataURI]);

  const isCreator = sameAddr(account, state?.creator);
  const candlePoints: TradePoint[] = useMemo(() => (trades ?? []).map((t) => ({ isBuy: t.isBuy, kii: t.kii, units: t.tokens, price: t.price, time: t.time, trader: t.trader })), [trades]);
  const candles = useMemo(() => buildCandles(candlePoints, TIMEFRAMES[1].seconds), [candlePoints]);

  if (isLoading) return <div className="glass h-64 animate-pulse" />;
  if (!state) return <ErrorNote>That token wasn&apos;t created on this launchpad.</ErrorNote>;

  const halted = state.status === "Liquidating" || state.status === "Liquidated" || state.status === "Deleted";
  const marketCap = state.price > 0n ? (state.price * 1_000_000_000n) / 10n ** 18n : 0n;
  const showLiquidation = state.isInactive || state.status === "Liquidating" || state.status === "Liquidated" || state.status === "Deleted";

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <div className="min-w-0 space-y-8">
        {/* header */}
        <div className="glass p-6">
          <div className="flex flex-wrap items-start gap-5">
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl">
              <IpfsImage src={meta?.image} alt="Token art" className="h-full w-full" fallback={<Icon name="wallet" className="text-3xl" />} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl font-bold tracking-tight text-white">{meta?.name ?? "…"}</h1>
                <span className={`badge ${state.status === "Active" && !state.isInactive ? "badge-nft badge-live" : state.status === "Graduated" ? "badge-rwa" : "badge-warn"}`}>
                  {state.isInactive && state.status === "Active" ? "Inactive" : state.status}
                </span>
              </div>
              <p className="mt-1 flex items-center gap-1 text-sm text-zinc-400">
                <a href={explorerAddress(token)} target="_blank" rel="noreferrer" className="hover:text-accent-300">
                  {shortAddr(token)}
                </a>
                <CopyButton value={token} label="token address" />
              </p>
              {meta?.description && <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-300">{meta.description}</p>}
              <div className="mt-3 flex flex-wrap gap-3 text-sm">
                {meta?.twitter && safeHref(meta.twitter) && (
                  <a href={safeHref(meta.twitter)} target="_blank" rel="noreferrer" className="text-accent-400 hover:underline">
                    X / Twitter
                  </a>
                )}
                {meta?.telegram && safeHref(meta.telegram) && (
                  <a href={safeHref(meta.telegram)} target="_blank" rel="noreferrer" className="text-accent-400 hover:underline">
                    Telegram
                  </a>
                )}
                {meta?.website && safeHref(meta.website) && (
                  <a href={safeHref(meta.website)} target="_blank" rel="noreferrer" className="text-accent-400 hover:underline">
                    Website
                  </a>
                )}
              </div>
            </div>
          </div>
          <p className="mt-5 text-sm text-zinc-300">{state.isInactive && state.status === "Active" ? "No trades in 30+ days — see the liquidation panel below." : STATUS_TEXT[state.status]}</p>
        </div>

        {/* stats */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Price">{fmtKii(state.price, 8)} KII</Stat>
          <Stat label="Market cap (est.)">{fmtKii(marketCap, 2)} KII</Stat>
          <Stat label="KII raised">{fmtKii(state.realKii, 2)} KII</Stat>
          <Stat label="Holders">{state.holderCount}</Stat>
          <Stat label="Creator">
            <a href={explorerAddress(state.creator)} target="_blank" rel="noreferrer" className="hover:text-accent-300">
              {shortAddr(state.creator)}
            </a>
          </Stat>
          <Stat label="Creator fee">{state.creatorFeeBps / 100}%</Stat>
          <Stat label="Max wallet">{state.maxWalletBps >= 10000 ? "No cap" : `${state.maxWalletBps / 100}%`}</Stat>
          <Stat label="Last trade">{state.lastTradeAt ? `${timeAgo(state.lastTradeAt)} ago` : "never"}</Stat>
        </div>

        {/* chart */}
        <section className="glass p-5 sm:p-6">
          <h2 className="mb-4 font-display text-lg font-semibold tracking-tight text-white">Price</h2>
          <CandleChart candles={candles} />
        </section>

        {/* liquidation status */}
        {showLiquidation && <LiquidationPanel token={token} status={state.status} isInactive={state.isInactive} holderCount={state.holderCount} holderCountAtInactivity={state.holderCountAtInactivity} />}

        {/* creator controls */}
        {isCreator && state.status === "Active" && <CreatorControls token={token} maxWalletBps={state.maxWalletBps} />}
      </div>

      <div className="space-y-6">
        <MemeTradePanel token={token} tradingHalted={halted} />
      </div>
    </div>
  );
}

function LiquidationPanel({
  token,
  status,
  isInactive,
  holderCount,
  holderCountAtInactivity,
}: {
  token: Address;
  status: string;
  isInactive: boolean;
  holderCount: number;
  holderCountAtInactivity: number;
}) {
  const tx = useTx();
  const eligibleForDeletion = status === "Liquidated" && holderCountAtInactivity < 20;

  return (
    <section className="glass border border-amber-500/20 p-6">
      <h2 className="font-display text-lg font-semibold tracking-tight text-white">Inactivity &amp; liquidation</h2>
      <p className="mt-2 text-sm leading-relaxed text-zinc-300">{STATUS_TEXT[status] ?? ""}</p>

      {isInactive && status === "Active" && (
        <div className="mt-4">
          <p className="hint mb-2">This token has gone 30 days without a trade. Anyone can start liquidation — holders are then bought out largest-first at 85% of spot price.</p>
          <TxButton
            variant="secondary"
            busy={tx.pending === "Trigger liquidation"}
            busyLabel="Starting…"
            onClick={() => void tx.run("Trigger liquidation", { address: ADDRESSES.launchpad, abi: launchpadAbi, functionName: "triggerLiquidation", args: [token] })}
          >
            Start liquidation
          </TxButton>
        </div>
      )}

      {status === "Liquidating" && (
        <div className="mt-4">
          <p className="hint mb-2">
            {holderCount} holder{holderCount === 1 ? "" : "s"} left to pay out (started with {holderCountAtInactivity}). Anyone can run a batch — it always pays the
            largest remaining holder first.
          </p>
          <TxButton
            variant="secondary"
            busy={tx.pending === "Run liquidation batch"}
            busyLabel="Processing…"
            onClick={() => void tx.run("Run liquidation batch", { address: ADDRESSES.launchpad, abi: launchpadAbi, functionName: "liquidateBatch", args: [token, 10n] })}
          >
            Process next batch
          </TxButton>
        </div>
      )}

      {status === "Liquidated" && (
        <div className="mt-4">
          <p className="hint mb-2">
            {eligibleForDeletion
              ? "This token had fewer than 20 holders when it went inactive, so it can now be removed from the launchpad listing."
              : `This token had ${holderCountAtInactivity} holders when it went inactive (20 or more), so it stays listed as Liquidated rather than being removed.`}
          </p>
          {eligibleForDeletion && (
            <TxButton
              variant="secondary"
              busy={tx.pending === "Delete token"}
              busyLabel="Removing…"
              onClick={() => void tx.run("Delete token", { address: ADDRESSES.launchpad, abi: launchpadAbi, functionName: "deleteToken", args: [token] })}
            >
              Remove from launchpad
            </TxButton>
          )}
        </div>
      )}
    </section>
  );
}

function CreatorControls({ token, maxWalletBps }: { token: Address; maxWalletBps: number }) {
  const tx = useTx();
  const [pct, setPct] = useState((maxWalletBps / 100).toString());
  const next = Math.round(Number(pct) * 100);
  const valid = Number.isFinite(next) && next >= 50 && next <= 10000;

  return (
    <section className="glass p-6">
      <h2 className="font-display text-lg font-semibold tracking-tight text-white">Creator controls</h2>
      <p className="mt-2 text-sm text-zinc-300">Tighten or loosen your token&apos;s per-wallet cap (0.5%–100% of supply). Your claimable creator fees live on your profile page.</p>
      <div className="mt-4 flex gap-2">
        <input className="input" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} />
        <TxButton
          variant="secondary"
          className="shrink-0"
          disabled={!valid}
          busy={tx.pending === "Update max wallet"}
          busyLabel="Updating…"
          onClick={() => void tx.run("Update max wallet", { address: ADDRESSES.launchpad, abi: launchpadAbi, functionName: "setMaxWallet", args: [token, next] })}
        >
          Update
        </TxButton>
      </div>
    </section>
  );
}
