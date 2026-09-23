"use client";

import { useId, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { formatEther } from "viem";
import { ACTIVE_CHAIN_ID, ADDRESSES } from "@/lib/config";
import { rwaAssetAbi, rwaCurveAbi } from "@/lib/contracts";
import { useRwaPool } from "@/lib/data";
import { useTx } from "@/lib/useTx";
import { fmtKii, parseAmount } from "@/lib/format";
import { TxButton } from "../ui";
import RiskAck from "./RiskAck";

type Address = `0x${string}`;
const SLIPPAGE_OPTIONS = [50, 100, 300]; // basis points

function pctText(bps: number): string {
  const v = bps / 100;
  return `${v >= 0 ? "+" : ""}${v.toFixed(Math.abs(v) >= 10 ? 1 : 2)}%`;
}

/// Buy or sell units on the curve, or open the market if nobody has yet.
export default function TradePanel({ asset, ipoPrice }: { asset: Address; ipoPrice: bigint }) {
  const uid = useId();
  const { address: account, isConnected } = useAccount();
  const tx = useTx();
  const { data: pool } = useRwaPool(asset);

  const [tab, setTab] = useState<"buy" | "sell">("buy");
  const [amountIn, setAmountIn] = useState("");
  const [slip, setSlip] = useState(100);
  const [ack, setAck] = useState(false);
  const [openKii, setOpenKii] = useState("");
  const [openUnits, setOpenUnits] = useState("");

  const marketOpen = !!pool && pool.totalShares > 0n;
  const readAsset = { address: asset, abi: rwaAssetAbi, chainId: ACTIVE_CHAIN_ID } as const;
  const { data: balance } = useReadContract({ ...readAsset, functionName: "balanceOf", args: account ? [account] : undefined, query: { enabled: !!account } });
  const { data: allowance } = useReadContract({ ...readAsset, functionName: "allowance", args: account ? [account, ADDRESSES.rwaCurve] : undefined, query: { enabled: !!account } });
  const myBalance = (balance as bigint | undefined) ?? 0n;
  const myAllowance = (allowance as bigint | undefined) ?? 0n;

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
  let impactBps: number | null = null;
  if (marketOpen && parsed && out && out > 0n && pool && pool.price > 0n) {
    const kii = tab === "buy" ? parsed : out;
    const units = tab === "buy" ? out : parsed;
    impactBps = Number((((kii * 10n ** 18n) / units - pool.price) * 10000n) / pool.price);
  }
  const minOut = out ? (out * BigInt(10000 - slip)) / 10000n : 0n;

  async function ensureAllowance(units: bigint): Promise<boolean> {
    if (myAllowance >= units) return true;
    return tx.run("Approve units", { address: asset, abi: rwaAssetAbi, functionName: "approve", args: [ADDRESSES.rwaCurve, units] });
  }

  async function trade() {
    if (!parsed || !out || !ack) return;
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

  const oKii = parseAmount(openKii);
  const oUnits = parseAmount(openUnits);
  const openPrice = oKii && oUnits && oUnits > 0n ? (oKii * 10n ** 18n) / oUnits : null;
  const inBand = openPrice !== null && openPrice >= ipoPrice / 4n && openPrice <= ipoPrice * 4n;
  async function openMarket() {
    if (!oKii || !oUnits || !inBand || oUnits > myBalance || !ack) return;
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

  const busyLabelFor = tx.pending === "Approve units" ? "Approving units" : tab === "buy" ? "Buying" : "Selling";

  if (!marketOpen) {
    return (
      <section className="glass p-6" aria-labelledby={`${uid}-h`}>
        <h2 id={`${uid}-h`} className="font-display text-lg font-semibold tracking-tight text-white">
          Trade
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-300">
          The market for this asset has not been opened. Any unit holder can open it by depositing units together with KII, which sets the opening price (between 0.25x and 4x of the IPO price of {fmtKii(ipoPrice)} KII). Once it is open, everyone can buy and sell.
        </p>
        {isConnected && myBalance > 0n ? (
          <div className="mt-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor={`${uid}-ou`}>
                  Units to deposit (you hold {fmtKii(myBalance, 4)})
                </label>
                <input id={`${uid}-ou`} className="input" inputMode="decimal" value={openUnits} onChange={(e) => setOpenUnits(e.target.value)} placeholder="100" />
              </div>
              <div>
                <label className="label" htmlFor={`${uid}-ok`}>
                  KII to deposit
                </label>
                <input id={`${uid}-ok`} className="input" inputMode="decimal" value={openKii} onChange={(e) => setOpenKii(e.target.value)} placeholder="100" />
              </div>
            </div>
            {openPrice !== null && (
              <p className={`text-sm ${inBand ? "text-accent-300" : "text-rose-300"}`} role="status">
                Opening price: {fmtKii(openPrice, 6)} KII per unit{inBand ? "" : ". This is outside the allowed range."}
              </p>
            )}
            <RiskAck checked={ack} onChange={setAck} />
            <TxButton className="w-full" onClick={() => void openMarket()} disabled={!ack || !inBand || !oUnits || oUnits > myBalance || tx.busy} busy={tx.pending === "Open market" || tx.pending === "Approve units"} busyLabel="Opening the market">
              Open the market
            </TxButton>
          </div>
        ) : (
          <p className="mt-4 text-sm text-zinc-400">{isConnected ? "You don't hold any units of this asset." : "Connect a wallet that holds units to open the market."}</p>
        )}
      </section>
    );
  }

  return (
    <section className="glass p-6" aria-labelledby={`${uid}-h`}>
      <h2 id={`${uid}-h`} className="font-display text-lg font-semibold tracking-tight text-white">
        Trade
      </h2>
      <div className="seg mb-5 mt-4" role="group" aria-label="Buy or sell">
        <button type="button" aria-pressed={tab === "buy"} onClick={() => { setTab("buy"); setAmountIn(""); }}>
          Buy
        </button>
        <button type="button" aria-pressed={tab === "sell"} onClick={() => { setTab("sell"); setAmountIn(""); }}>
          Sell
        </button>
      </div>

      <label className="label" htmlFor={`${uid}-amt`}>
        {tab === "buy" ? "You pay (KII)" : `Units to sell${myBalance > 0n ? ` (you hold ${fmtKii(myBalance, 4)})` : ""}`}
      </label>
      <div className="flex gap-2">
        <input id={`${uid}-amt`} className="input" inputMode="decimal" placeholder="0.0" value={amountIn} onChange={(e) => setAmountIn(e.target.value)} />
        {tab === "sell" && myBalance > 0n && (
          <button type="button" className="btn btn-secondary shrink-0" onClick={() => setAmountIn(formatEther(myBalance))}>
            Sell all
          </button>
        )}
      </div>

      <dl className="mt-4 space-y-2 rounded-xl border border-white/[0.06] bg-black/20 p-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-zinc-400">You receive (approx.)</dt>
          <dd className="font-semibold text-white">{out ? (tab === "buy" ? `${fmtKii(out, 4)} units` : `${fmtKii(out, 6)} KII`) : "n/a"}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-zinc-400">Price impact (incl. fees)</dt>
          <dd className={impactBps !== null && Math.abs(impactBps) > 500 ? "text-amber-300" : "text-zinc-200"}>{impactBps !== null ? pctText(impactBps) : "n/a"}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-zinc-400" id={`${uid}-slip`}>
            Slippage tolerance
          </dt>
          <dd className="seg !p-0.5" role="group" aria-labelledby={`${uid}-slip`}>
            {SLIPPAGE_OPTIONS.map((b) => (
              <button key={b} type="button" aria-pressed={slip === b} onClick={() => setSlip(b)} className="!px-2.5 !py-1 !text-xs">
                {b / 100}%
              </button>
            ))}
          </dd>
        </div>
      </dl>

      <div className="mt-4">
        <RiskAck checked={ack} onChange={setAck} />
      </div>

      <TxButton
        className="mt-4 w-full !py-3.5 text-base"
        onClick={() => void trade()}
        disabled={!isConnected || !ack || !parsed || !out || tx.busy || (tab === "sell" && (parsed ?? 0n) > myBalance)}
        busy={tx.pending === "Buy units" || tx.pending === "Sell units" || tx.pending === "Approve units"}
        busyLabel={busyLabelFor}
      >
        {!isConnected ? "Connect wallet to trade" : tab === "buy" ? "Buy units" : "Sell units"}
      </TxButton>
      {tab === "sell" && parsed && parsed > myAllowance && <p className="hint">Selling first asks you to approve the units, then sells them. Both prompts appear one after another.</p>}
    </section>
  );
}
