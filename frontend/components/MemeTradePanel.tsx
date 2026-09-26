"use client";

import { useId, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { formatEther } from "viem";
import { ACTIVE_CHAIN_ID, ADDRESSES } from "@/lib/config";
import { launchpadAbi, memeTokenAbi } from "@/lib/contracts";
import { useTx } from "@/lib/useTx";
import { fmtKii, parseAmount } from "@/lib/format";
import { TxButton } from "./ui";

type Address = `0x${string}`;
const SLIPPAGE_OPTIONS = [100, 300, 1000]; // basis points — memecoins move fast, so the defaults are looser than RWA

function pctText(bps: number): string {
  const v = bps / 100;
  return `${v >= 0 ? "+" : ""}${v.toFixed(Math.abs(v) >= 10 ? 1 : 2)}%`;
}

/// Buy or sell a launchpad token on its bonding curve. Unlike the RWA curve there
/// is no "open the market" step — every token is tradeable from the moment it's
/// created — so this panel is simpler than RWA's TradePanel.
export default function MemeTradePanel({ token, tradingHalted }: { token: Address; tradingHalted: boolean }) {
  const uid = useId();
  const { address: account, isConnected } = useAccount();
  const tx = useTx();

  const [tab, setTab] = useState<"buy" | "sell">("buy");
  const [amountIn, setAmountIn] = useState("");
  const [slip, setSlip] = useState(300);

  const readToken = { address: token, abi: memeTokenAbi, chainId: ACTIVE_CHAIN_ID } as const;
  const { data: balance } = useReadContract({ ...readToken, functionName: "balanceOf", args: account ? [account] : undefined, query: { enabled: !!account } });
  const { data: allowance } = useReadContract({ ...readToken, functionName: "allowance", args: account ? [account, ADDRESSES.launchpad] : undefined, query: { enabled: !!account } });
  const myBalance = (balance as bigint | undefined) ?? 0n;
  const myAllowance = (allowance as bigint | undefined) ?? 0n;

  const parsed = parseAmount(amountIn);
  const buyKii = tab === "buy" ? parsed : null;
  const sellTokens = tab === "sell" ? parsed : null;
  const { data: buyQuote } = useReadContract({
    address: ADDRESSES.launchpad,
    abi: launchpadAbi,
    functionName: "quoteBuy",
    args: [token, buyKii ?? 0n],
    chainId: ACTIVE_CHAIN_ID,
    query: { enabled: !tradingHalted && !!buyKii },
  });
  const { data: sellQuote } = useReadContract({
    address: ADDRESSES.launchpad,
    abi: launchpadAbi,
    functionName: "quoteSell",
    args: [token, sellTokens ?? 0n],
    chainId: ACTIVE_CHAIN_ID,
    query: { enabled: !tradingHalted && !!sellTokens },
  });
  const { data: spotPrice } = useReadContract({
    address: ADDRESSES.launchpad,
    abi: launchpadAbi,
    functionName: "price",
    args: [token],
    chainId: ACTIVE_CHAIN_ID,
  });

  const out = tab === "buy" ? (buyQuote as bigint | undefined) : (sellQuote as bigint | undefined);
  let impactBps: number | null = null;
  const px = spotPrice as bigint | undefined;
  if (parsed && out && out > 0n && px && px > 0n) {
    const kii = tab === "buy" ? parsed : out;
    const tokens = tab === "buy" ? out : parsed;
    impactBps = Number((((kii * 10n ** 18n) / tokens - px) * 10000n) / px);
  }
  const minOut = out ? (out * BigInt(10000 - slip)) / 10000n : 0n;

  async function ensureAllowance(amount: bigint): Promise<boolean> {
    if (myAllowance >= amount) return true;
    return tx.run("Approve token", { address: token, abi: memeTokenAbi, functionName: "approve", args: [ADDRESSES.launchpad, amount] });
  }

  async function trade() {
    if (!parsed || !out) return;
    if (tab === "buy") {
      const ok = await tx.run(
        "Buy token",
        { address: ADDRESSES.launchpad, abi: launchpadAbi, functionName: "buy", args: [token, minOut], value: parsed },
        { successMessage: `You bought about ${fmtKii(out, 2)} tokens.` }
      );
      if (ok) setAmountIn("");
    } else {
      if (parsed > myBalance) return;
      if (!(await ensureAllowance(parsed))) return;
      const ok = await tx.run(
        "Sell token",
        { address: ADDRESSES.launchpad, abi: launchpadAbi, functionName: "sell", args: [token, parsed, minOut] },
        { successMessage: `You received about ${fmtKii(out, 6)} KII.` }
      );
      if (ok) setAmountIn("");
    }
  }

  const busyLabelFor = tx.pending === "Approve token" ? "Approving token" : tab === "buy" ? "Buying" : "Selling";

  if (tradingHalted) {
    return (
      <section className="glass p-6" aria-labelledby={`${uid}-h`}>
        <h2 id={`${uid}-h`} className="font-display text-lg font-semibold tracking-tight text-white">
          Trade
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-300">
          Trading is closed for this token — it's inactive and being liquidated (or already has been). See the liquidation panel below.
        </p>
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
        {tab === "buy" ? "You pay (KII)" : `Tokens to sell${myBalance > 0n ? ` (you hold ${fmtKii(myBalance, 2)})` : ""}`}
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
          <dd className="font-semibold text-white">{out ? (tab === "buy" ? `${fmtKii(out, 2)} tokens` : `${fmtKii(out, 6)} KII`) : "n/a"}</dd>
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

      <TxButton
        className="mt-4 w-full !py-3.5 text-base"
        onClick={() => void trade()}
        disabled={!isConnected || !parsed || !out || tx.busy || (tab === "sell" && (parsed ?? 0n) > myBalance)}
        busy={tx.pending === "Buy token" || tx.pending === "Sell token" || tx.pending === "Approve token"}
        busyLabel={busyLabelFor}
      >
        {!isConnected ? "Connect wallet to trade" : tab === "buy" ? "Buy" : "Sell"}
      </TxButton>
      {tab === "sell" && parsed && parsed > myAllowance && <p className="hint">Selling first asks you to approve the token, then sells it. Both prompts appear one after another.</p>}
      <p className="hint mt-2">Sniping bots aren&apos;t blocked here — anyone can buy the instant this page loads. Trade in size accordingly.</p>
    </section>
  );
}
