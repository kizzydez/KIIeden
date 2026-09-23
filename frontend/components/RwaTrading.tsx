"use client";

import { useMemo, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { formatEther } from "viem";
import { ACTIVE_CHAIN_ID, ADDRESSES } from "@/lib/config";
import { rwaAssetAbi, rwaCurveAbi } from "@/lib/contracts";
import { useRwaPool, useRwaTrades } from "@/lib/data";
import { useTx } from "@/lib/useTx";
import { buildCandles, TIMEFRAMES } from "@/lib/candles";
import { fmtKii, parseAmount, shortAddr } from "@/lib/format";
import CandleChart from "./CandleChart";
import { TxButton } from "./ui";

type Address = `0x${string}`;
const SLIPPAGE_OPTIONS = [50, 100, 300]; // basis points

function pctText(bps: number): string {
  const v = bps / 100;
  return `${v >= 0 ? "+" : ""}${v.toFixed(Math.abs(v) >= 10 ? 1 : 2)}%`;
}

/// Demand-and-supply trading for an RWA after its IPO: a live price curve (constant
/// product), candlesticks, buy / sell, and liquidity. Price rises when people buy and
/// falls when they sell.
export default function RwaTrading({ asset, ipoPrice }: { asset: Address; ipoPrice: bigint }) {
  const { address: account, isConnected } = useAccount();
  const tx = useTx();
  const { data: pool } = useRwaPool(asset);
  const { data: trades } = useRwaTrades(asset);

  const [tab, setTab] = useState<"buy" | "sell">("buy");
  const [tf, setTf] = useState(1);
  const [amountIn, setAmountIn] = useState("");
  const [slip, setSlip] = useState(100);

  // liquidity forms
  const [openKii, setOpenKii] = useState("");
  const [openUnits, setOpenUnits] = useState("");
  const [addKii, setAddKii] = useState("");

  const marketOpen = !!pool && pool.totalShares > 0n;

  const readAsset = { address: asset, abi: rwaAssetAbi, chainId: ACTIVE_CHAIN_ID } as const;
  const { data: balance } = useReadContract({ ...readAsset, functionName: "balanceOf", args: account ? [account] : undefined, query: { enabled: !!account } });
  const { data: allowance } = useReadContract({
    ...readAsset,
    functionName: "allowance",
    args: account ? [account, ADDRESSES.rwaCurve] : undefined,
    query: { enabled: !!account },
  });
  const myBalance = (balance as bigint | undefined) ?? 0n;
  const myAllowance = (allowance as bigint | undefined) ?? 0n;

  // ---- quotes (computed by the contract itself, so they always match the trade) ----
  const parsed = parseAmount(amountIn);
  const buyKii = tab === "buy" ? parsed : null;
  const sellUnits = tab === "sell" ? parsed : null;
  const { data: buyQuote } = useReadContract({
    address: ADDRESSES.rwaCurve,
    abi: rwaCurveAbi,
    functionName: "quoteBuy",
    args: [asset, buyKii ?? 0n],
    chainId: ACTIVE_CHAIN_ID,
    query: { enabled: marketOpen && !!buyKii },
  });
  const { data: sellQuote } = useReadContract({
    address: ADDRESSES.rwaCurve,
    abi: rwaCurveAbi,
    functionName: "quoteSell",
    args: [asset, sellUnits ?? 0n],
    chainId: ACTIVE_CHAIN_ID,
    query: { enabled: marketOpen && !!sellUnits },
  });

  const out = tab === "buy" ? (buyQuote as bigint | undefined) : (sellQuote as bigint | undefined);
  // effective price of this trade vs the current spot price, in basis points
  let impactBps: number | null = null;
  if (marketOpen && parsed && out && out > 0n && pool && pool.price > 0n) {
    const kii = tab === "buy" ? parsed : out;
    const units = tab === "buy" ? out : parsed;
    const execPrice = (kii * 10n ** 18n) / units;
    impactBps = Number(((execPrice - pool.price) * 10000n) / pool.price);
  }
  const minOut = out ? (out * BigInt(10000 - slip)) / 10000n : 0n;

  async function ensureAllowance(units: bigint): Promise<boolean> {
    if (myAllowance >= units) return true;
    return tx.run("Approve units", { address: asset, abi: rwaAssetAbi, functionName: "approve", args: [ADDRESSES.rwaCurve, units] });
  }

  async function trade() {
    if (!parsed || !out) return;
    if (tab === "buy") {
      const ok = await tx.run(
        "Buy units",
        { address: ADDRESSES.rwaCurve, abi: rwaCurveAbi, functionName: "buy", args: [asset, minOut], value: parsed },
        { successMessage: `You bought about ${fmtKii(out, 4)} units.` }
      );
      if (ok) setAmountIn("");
    } else {
      if (parsed > myBalance) return;
      if (!(await ensureAllowance(parsed))) return;
      const ok = await tx.run(
        "Sell units",
        { address: ADDRESSES.rwaCurve, abi: rwaCurveAbi, functionName: "sell", args: [asset, parsed, minOut] },
        { successMessage: `You received about ${fmtKii(out, 6)} KII.` }
      );
      if (ok) setAmountIn("");
    }
  }

  // ---- open the market (first liquidity provider) ----
  const oKii = parseAmount(openKii);
  const oUnits = parseAmount(openUnits);
  const openPrice = oKii && oUnits && oUnits > 0n ? (oKii * 10n ** 18n) / oUnits : null;
  const inBand = openPrice !== null && openPrice >= ipoPrice / 4n && openPrice <= ipoPrice * 4n;
  async function openMarket() {
    if (!oKii || !oUnits || !inBand || oUnits > myBalance) return;
    if (!(await ensureAllowance(oUnits))) return;
    const ok = await tx.run(
      "Open market",
      { address: ADDRESSES.rwaCurve, abi: rwaCurveAbi, functionName: "addLiquidity", args: [asset, oUnits, 0n], value: oKii },
      { successMessage: "The market is open. Anyone can now buy and sell." }
    );
    if (ok) {
      setOpenKii("");
      setOpenUnits("");
    }
  }

  // ---- add / remove liquidity on an existing market ----
  const aKii = parseAmount(addKii);
  const unitsNeeded = aKii && pool && pool.kiiReserve > 0n ? (aKii * pool.unitReserve + pool.kiiReserve - 1n) / pool.kiiReserve : null;
  const unitsMax = unitsNeeded ? (unitsNeeded * 101n) / 100n : null; // 1% slack for price movement
  async function addLiquidity() {
    if (!aKii || !unitsMax || unitsMax > myBalance) return;
    if (!(await ensureAllowance(unitsMax))) return;
    const ok = await tx.run("Add liquidity", { address: ADDRESSES.rwaCurve, abi: rwaCurveAbi, functionName: "addLiquidity", args: [asset, unitsMax, 0n], value: aKii });
    if (ok) setAddKii("");
  }
  function removeLiquidity(fractionBps: bigint) {
    if (!pool || pool.myShares === 0n) return;
    const burn = (pool.myShares * fractionBps) / 10000n;
    if (burn === 0n) return;
    void tx.run("Remove liquidity", { address: ADDRESSES.rwaCurve, abi: rwaCurveAbi, functionName: "removeLiquidity", args: [asset, burn, 0n, 0n] });
  }

  // ---- chart + stats ----
  const ipoPriceNum = Number(formatEther(ipoPrice));
  const candles = useMemo(() => buildCandles(trades ?? [], TIMEFRAMES[tf].seconds, ipoPriceNum), [trades, tf, ipoPriceNum]);
  const priceChangeBps = pool && pool.price > 0n ? Number(((pool.price - ipoPrice) * 10000n) / ipoPrice) : 0;

  const dayAgo = Math.floor(Date.now() / 1000) - 86400;
  const recent = (trades ?? []).filter((t) => t.time >= dayAgo);
  const buyVol = recent.filter((t) => t.isBuy).reduce((a, t) => a + t.kii, 0n);
  const sellVol = recent.filter((t) => !t.isBuy).reduce((a, t) => a + t.kii, 0n);
  const totalVol = buyVol + sellVol;
  const demandPct = totalVol > 0n ? Number((buyVol * 10000n) / totalVol) / 100 : 50;

  return (
    <div className="space-y-8">
      {/* stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="glass px-5 py-4">
          <p className="eyebrow">Price</p>
          <p className="mt-1.5 font-display text-xl font-semibold text-white">{marketOpen && pool ? `${fmtKii(pool.price, 6)} KII` : "—"}</p>
        </div>
        <div className="glass px-5 py-4">
          <p className="eyebrow">Vs IPO price</p>
          <p className={`mt-1.5 font-display text-xl font-semibold ${priceChangeBps >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{marketOpen ? pctText(priceChangeBps) : "—"}</p>
        </div>
        <div className="glass px-5 py-4">
          <p className="eyebrow">Pool KII</p>
          <p className="mt-1.5 font-display text-xl font-semibold text-white">{marketOpen && pool ? fmtKii(pool.kiiReserve, 2) : "—"}</p>
        </div>
        <div className="glass px-5 py-4">
          <p className="eyebrow">Pool units</p>
          <p className="mt-1.5 font-display text-xl font-semibold text-white">{marketOpen && pool ? fmtKii(pool.unitReserve, 2) : "—"}</p>
        </div>
      </div>

      {/* chart */}
      <div className="glass p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-display font-semibold text-white">Price curve</p>
            <p className="text-xs text-zinc-500">Buying pushes the price up, selling pushes it down.</p>
          </div>
          <div className="seg">
            {TIMEFRAMES.map((t, i) => (
              <button key={t.label} aria-pressed={tf === i} onClick={() => setTf(i)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <CandleChart candles={candles} />
        <div className="mt-5">
          <div className="mb-1.5 flex justify-between text-xs">
            <span className="text-emerald-300">Demand (buys) {demandPct.toFixed(0)}%</span>
            <span className="text-rose-300">Supply (sells) {(100 - demandPct).toFixed(0)}%</span>
          </div>
          <div className="flex h-2 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="bg-emerald-400/80 transition-all duration-700" style={{ width: `${demandPct}%` }} />
            <div className="bg-rose-400/80 transition-all duration-700" style={{ width: `${100 - demandPct}%` }} />
          </div>
          <p className="mt-1.5 text-[11px] text-zinc-600">Volume in the last 24 hours</p>
        </div>
      </div>

      {/* trade / open market */}
      {marketOpen ? (
        <div className="glass p-6 sm:p-7">
          <div className="seg mb-5">
            <button aria-pressed={tab === "buy"} onClick={() => { setTab("buy"); setAmountIn(""); }}>
              Buy
            </button>
            <button aria-pressed={tab === "sell"} onClick={() => { setTab("sell"); setAmountIn(""); }}>
              Sell
            </button>
          </div>

          <label className="label">{tab === "buy" ? "You pay (KII)" : `Units to sell${myBalance > 0n ? ` (you hold ${fmtKii(myBalance, 4)})` : ""}`}</label>
          <div className="flex gap-2">
            <input className="input" inputMode="decimal" placeholder="0.0" value={amountIn} onChange={(e) => setAmountIn(e.target.value)} />
            {tab === "sell" && myBalance > 0n && (
              <button type="button" className="btn btn-secondary shrink-0" onClick={() => setAmountIn(formatEther(myBalance))}>
                Max
              </button>
            )}
          </div>

          <div className="mt-4 space-y-2 rounded-xl border border-white/[0.06] bg-black/20 p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-400">{tab === "buy" ? "You receive (approx.)" : "You receive (approx.)"}</span>
              <span className="font-semibold text-white">{out ? (tab === "buy" ? `${fmtKii(out, 4)} units` : `${fmtKii(out, 6)} KII`) : "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Price impact (incl. fees)</span>
              <span className={impactBps !== null && Math.abs(impactBps) > 500 ? "text-amber-300" : "text-zinc-200"}>{impactBps !== null ? pctText(impactBps) : "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Slippage tolerance</span>
              <span className="seg !p-0.5">
                {SLIPPAGE_OPTIONS.map((b) => (
                  <button key={b} aria-pressed={slip === b} onClick={() => setSlip(b)} className="!px-2.5 !py-1 !text-xs">
                    {b / 100}%
                  </button>
                ))}
              </span>
            </div>
          </div>

          <TxButton
            className="mt-5 w-full !py-3.5 text-base"
            onClick={() => void trade()}
            disabled={!isConnected || !parsed || !out || tx.busy || (tab === "sell" && (parsed ?? 0n) > myBalance)}
            busy={tx.pending === "Buy units" || tx.pending === "Sell units" || tx.pending === "Approve units"}
            busyLabel={tx.pending === "Approve units" ? "Approving…" : tab === "buy" ? "Buying…" : "Selling…"}
          >
            {!isConnected ? "Connect wallet to trade" : tab === "buy" ? "Buy units" : "Sell units"}
          </TxButton>
          {tab === "sell" && parsed && parsed > myAllowance && <p className="hint">Selling first asks you to approve the units, then sells them. Both prompts appear one after another.</p>}
        </div>
      ) : (
        <div className="glass p-6 sm:p-7">
          <p className="font-display font-semibold text-white">The market isn&apos;t open yet</p>
          <p className="mt-1 text-sm leading-relaxed text-zinc-400">
            Trading runs on a liquidity pool. Any unit holder can open it by depositing units together with KII, which sets the opening price (between 0.25x and 4x of the IPO price of {fmtKii(ipoPrice)} KII).
            Once it is open, everyone can buy and sell, and the price moves with demand and supply.
          </p>
          {isConnected && myBalance > 0n ? (
            <div className="mt-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label">Units to deposit (you hold {fmtKii(myBalance, 4)})</label>
                  <input className="input" inputMode="decimal" value={openUnits} onChange={(e) => setOpenUnits(e.target.value)} placeholder="100" />
                </div>
                <div>
                  <label className="label">KII to deposit</label>
                  <input className="input" inputMode="decimal" value={openKii} onChange={(e) => setOpenKii(e.target.value)} placeholder="100" />
                </div>
              </div>
              {openPrice !== null && (
                <p className={`text-sm ${inBand ? "text-accent-300" : "text-rose-400"}`}>
                  Opening price: {fmtKii(openPrice, 6)} KII per unit{inBand ? "" : ". This is outside the allowed range."}
                </p>
              )}
              <TxButton className="w-full" onClick={() => void openMarket()} disabled={!inBand || !oUnits || oUnits > myBalance || tx.busy} busy={tx.pending === "Open market" || tx.pending === "Approve units"} busyLabel="Opening…">
                Open the market
              </TxButton>
            </div>
          ) : (
            <p className="mt-4 text-sm text-zinc-500">{isConnected ? "You don't hold any units of this asset." : "Connect a wallet that holds units to open the market."}</p>
          )}
        </div>
      )}

      {/* liquidity */}
      {marketOpen && pool && (
        <div className="glass p-6 sm:p-7">
          <p className="font-display font-semibold text-white">Liquidity</p>
          <p className="mt-1 text-sm text-zinc-400">Providers earn a 0.3% fee on every trade. Deposit KII and the matching units.</p>
          <div className="mt-5 grid gap-6 sm:grid-cols-2">
            <div>
              <label className="label">KII to add</label>
              <input className="input" inputMode="decimal" value={addKii} onChange={(e) => setAddKii(e.target.value)} placeholder="10" />
              {unitsNeeded !== null && (
                <p className="hint">
                  Needs about {fmtKii(unitsNeeded, 4)} units (you hold {fmtKii(myBalance, 4)}).
                </p>
              )}
              <TxButton
                variant="secondary"
                className="mt-3 w-full"
                onClick={() => void addLiquidity()}
                disabled={!isConnected || !aKii || !unitsMax || unitsMax > myBalance || tx.busy}
                busy={tx.pending === "Add liquidity"}
                busyLabel="Adding…"
              >
                Add liquidity
              </TxButton>
            </div>
            <div>
              <p className="label">Your position</p>
              <p className="font-display text-lg font-semibold text-white">{pool.totalShares > 0n ? `${(Number((pool.myShares * 10000n) / pool.totalShares) / 100).toFixed(2)}% of the pool` : "—"}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {[2500n, 5000n, 10000n].map((f) => (
                  <TxButton key={f.toString()} variant="secondary" size="sm" disabled={pool.myShares === 0n || tx.busy} busy={false} onClick={() => removeLiquidity(f)}>
                    Remove {Number(f) / 100}%
                  </TxButton>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* recent trades */}
      {trades && trades.length > 0 && (
        <div className="glass p-6 sm:p-7">
          <p className="mb-3 font-display font-semibold text-white">Recent trades</p>
          <ul className="divide-y divide-white/[0.06] text-sm">
            {[...trades].reverse().slice(0, 8).map((t, i) => (
              <li key={i} className="flex items-center justify-between py-2.5">
                <span className={t.isBuy ? "text-emerald-300" : "text-rose-300"}>{t.isBuy ? "Buy" : "Sell"}</span>
                <span className="text-zinc-300">{fmtKii(t.units, 4)} units</span>
                <span className="text-zinc-500">{shortAddr(t.trader)}</span>
                <span className="font-medium text-white">{fmtKii(t.price, 6)} KII</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
