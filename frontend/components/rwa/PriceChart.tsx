"use client";

import { useMemo, useState } from "react";
import { formatEther } from "viem";
import { useRwaTrades } from "@/lib/data";
import { buildCandles, TIMEFRAMES } from "@/lib/candles";
import { fmtKii, shortAddr } from "@/lib/format";
import CandleChart from "../CandleChart";

type Address = `0x${string}`;

/// Candlestick chart, demand-vs-supply bar and the latest trades.
export default function PriceChart({ asset, ipoPrice }: { asset: Address; ipoPrice: bigint }) {
  const { data: trades } = useRwaTrades(asset);
  const [tf, setTf] = useState(1);
  const ipoNum = Number(formatEther(ipoPrice));
  const candles = useMemo(() => buildCandles(trades ?? [], TIMEFRAMES[tf].seconds, ipoNum), [trades, tf, ipoNum]);

  const dayAgo = Math.floor(Date.now() / 1000) - 86400;
  const recent = (trades ?? []).filter((t) => t.time >= dayAgo);
  const buyVol = recent.filter((t) => t.isBuy).reduce((a, t) => a + t.kii, 0n);
  const sellVol = recent.filter((t) => !t.isBuy).reduce((a, t) => a + t.kii, 0n);
  const total = buyVol + sellVol;
  const demand = total > 0n ? Number((buyVol * 10000n) / total) / 100 : 50;

  return (
    <section className="glass p-5 sm:p-6" aria-labelledby="chart-heading">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="chart-heading" className="font-display text-lg font-semibold tracking-tight text-white">
            Price chart
          </h2>
          <p className="text-xs text-zinc-400">Green candles: the price rose (demand). Red candles: it fell (supply).</p>
        </div>
        <div className="seg" role="group" aria-label="Candle timeframe">
          {TIMEFRAMES.map((t, i) => (
            <button key={t.label} type="button" aria-pressed={tf === i} onClick={() => setTf(i)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <CandleChart candles={candles} />

      <div className="mt-5">
        <div className="mb-1.5 flex justify-between text-xs">
          <span className="text-emerald-300">Demand (buys) {demand.toFixed(0)}%</span>
          <span className="text-rose-300">Supply (sells) {(100 - demand).toFixed(0)}%</span>
        </div>
        <div className="flex h-2 overflow-hidden rounded-full bg-white/[0.06]" role="img" aria-label={`Last 24 hours: ${demand.toFixed(0)} percent buys, ${(100 - demand).toFixed(0)} percent sells`}>
          <div className="bg-emerald-400/80 transition-all duration-700" style={{ width: `${demand}%` }} />
          <div className="bg-rose-400/80 transition-all duration-700" style={{ width: `${100 - demand}%` }} />
        </div>
        <p className="mt-1.5 text-[11px] text-zinc-400">Volume in the last 24 hours</p>
      </div>

      {trades && trades.length > 0 && (
        <div className="mt-6">
          <h3 className="eyebrow mb-2">Recent trades</h3>
          <table className="w-full text-sm">
            <caption className="sr-only">Most recent trades in this pool</caption>
            <thead className="sr-only">
              <tr>
                <th scope="col">Side</th>
                <th scope="col">Units</th>
                <th scope="col">Wallet</th>
                <th scope="col">Price after trade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {[...trades].reverse().slice(0, 8).map((t, i) => (
                <tr key={i}>
                  <td className={`py-2.5 ${t.isBuy ? "text-emerald-300" : "text-rose-300"}`}>{t.isBuy ? "Buy" : "Sell"}</td>
                  <td className="py-2.5 text-zinc-300">{fmtKii(t.units, 4)} units</td>
                  <td className="py-2.5 text-zinc-400">{shortAddr(t.trader)}</td>
                  <td className="py-2.5 text-right font-medium text-white">{fmtKii(t.price, 6)} KII</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
