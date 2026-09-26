"use client";

import { useMemo } from "react";
import { useRwaLiquidityPrices, useRwaPool, useRwaTrades } from "@/lib/data";
import { computeMarketStats } from "@/lib/marketStats";
import { fmtKii } from "@/lib/format";

type Address = `0x${string}`;

function pct(bps: number): string {
  const v = bps / 100;
  return `${v >= 0 ? "+" : ""}${v.toFixed(Math.abs(v) >= 10 ? 1 : 2)}%`;
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "up" | "down" }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-3.5">
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1.5 font-display text-lg font-semibold tracking-tight text-white">{value}</dd>
      {sub && <p className={`mt-0.5 text-xs ${tone === "up" ? "text-emerald-300" : tone === "down" ? "text-rose-300" : "text-zinc-400"}`}>{sub}</p>}
    </div>
  );
}

/// Current price, market cap, circulation, all-time and 24h range for one asset.
export default function MarketData({ asset, ipoPrice, totalSupply, totalUnits }: { asset: Address; ipoPrice: bigint; totalSupply: bigint; totalUnits: bigint }) {
  const { data: pool } = useRwaPool(asset);
  const { data: trades } = useRwaTrades(asset);
  const { data: liq } = useRwaLiquidityPrices(asset);

  const open = !!pool && pool.totalShares > 0n;
  const stats = useMemo(
    () =>
      open && pool
        ? computeMarketStats({ trades: trades ?? [], liquidityPrices: liq ?? [], currentPrice: pool.price, ipoPrice, totalSupply, totalUnits, nowSec: Math.floor(Date.now() / 1000) })
        : null,
    [open, pool, trades, liq, ipoPrice, totalSupply, totalUnits]
  );

  const dash = "n/a";
  const price = (v?: bigint) => (stats && v !== undefined ? `${fmtKii(v, 6)} KII` : dash);

  return (
    <section className="glass p-6" aria-labelledby="market-data-heading">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 id="market-data-heading" className="font-display text-lg font-semibold tracking-tight text-white">
          Market data
        </h2>
        {!open && <span className="text-xs text-zinc-400">Market not open yet</span>}
      </div>
      <dl className="grid grid-cols-2 gap-3">
        <Stat label="Current price" value={price(stats?.price)} sub={stats ? `${pct(stats.change24hBps)} in 24h` : undefined} tone={stats && stats.change24hBps < 0 ? "down" : "up"} />
        <Stat label="Market cap" value={stats ? `${fmtKii(stats.marketCap, 2)} KII` : dash} sub={stats ? `Fully diluted ${fmtKii(stats.fullyDiluted, 2)} KII` : undefined} />
        <Stat label="Total in circulation" value={`${fmtKii(totalSupply, 2)} units`} sub={`of ${fmtKii(totalUnits, 2)} total`} />
        <Stat label="Vs IPO price" value={stats ? pct(stats.changeVsIpoBps) : dash} sub={`IPO ${fmtKii(ipoPrice, 6)} KII`} tone={stats && stats.changeVsIpoBps < 0 ? "down" : "up"} />
        <Stat label="All-time high" value={price(stats?.ath)} />
        <Stat label="All-time low" value={price(stats?.atl)} />
        <Stat label="24h high" value={price(stats?.high24h)} />
        <Stat label="24h low" value={price(stats?.low24h)} />
      </dl>
      <p className="mt-4 text-xs leading-relaxed text-zinc-400">
        Computed from on-chain trades of this asset&apos;s pool. Market cap is the current price times the units in circulation. It is not an appraisal of the underlying property.
      </p>
    </section>
  );
}
