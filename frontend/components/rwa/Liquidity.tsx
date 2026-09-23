"use client";

import { useId, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { ACTIVE_CHAIN_ID, ADDRESSES } from "@/lib/config";
import { rwaAssetAbi, rwaCurveAbi } from "@/lib/contracts";
import { useRwaPool } from "@/lib/data";
import { useTx } from "@/lib/useTx";
import { fmtKii, parseAmount } from "@/lib/format";
import { TxButton } from "../ui";
import { useConfirm } from "../ConfirmDialog";

type Address = `0x${string}`;

/// Add or remove liquidity on an open market. Providers earn the 0.3% trading fee.
export default function Liquidity({ asset }: { asset: Address }) {
  const uid = useId();
  const { address: account, isConnected } = useAccount();
  const tx = useTx();
  const confirm = useConfirm();
  const { data: pool } = useRwaPool(asset);
  const [addKii, setAddKii] = useState("");

  const readAsset = { address: asset, abi: rwaAssetAbi, chainId: ACTIVE_CHAIN_ID } as const;
  const { data: balance } = useReadContract({ ...readAsset, functionName: "balanceOf", args: account ? [account] : undefined, query: { enabled: !!account } });
  const { data: allowance } = useReadContract({ ...readAsset, functionName: "allowance", args: account ? [account, ADDRESSES.rwaCurve] : undefined, query: { enabled: !!account } });
  const myBalance = (balance as bigint | undefined) ?? 0n;
  const myAllowance = (allowance as bigint | undefined) ?? 0n;

  if (!pool || pool.totalShares === 0n) return null;

  const aKii = parseAmount(addKii);
  const unitsNeeded = aKii && pool.kiiReserve > 0n ? (aKii * pool.unitReserve + pool.kiiReserve - 1n) / pool.kiiReserve : null;
  const unitsMax = unitsNeeded ? (unitsNeeded * 101n) / 100n : null; // 1% slack for price movement

  async function add() {
    if (!aKii || !unitsMax || unitsMax > myBalance) return;
    if (myAllowance < unitsMax) {
      const ok = await tx.run("Approve units", { address: asset, abi: rwaAssetAbi, functionName: "approve", args: [ADDRESSES.rwaCurve, unitsMax] });
      if (!ok) return;
    }
    const ok = await tx.run("Add liquidity", { address: ADDRESSES.rwaCurve, abi: rwaCurveAbi, functionName: "addLiquidity", args: [asset, unitsMax, 0n], value: aKii });
    if (ok) setAddKii("");
  }
  async function remove(fractionBps: bigint) {
    if (!pool || pool.myShares === 0n) return;
    const burn = (pool.myShares * fractionBps) / 10000n;
    if (burn === 0n) return;
    if (fractionBps === 10000n) {
      const sure = await confirm({
        title: "Remove all your liquidity?",
        body: "You'll receive your share of the pool's KII and units at the current ratio, which may differ from what you deposited.",
        confirmLabel: "Remove all",
      });
      if (!sure) return;
    }
    void tx.run("Remove liquidity", { address: ADDRESSES.rwaCurve, abi: rwaCurveAbi, functionName: "removeLiquidity", args: [asset, burn, 0n, 0n] });
  }

  return (
    <section className="glass p-6" aria-labelledby={`${uid}-h`}>
      <h2 id={`${uid}-h`} className="font-display text-lg font-semibold tracking-tight text-white">
        Liquidity
      </h2>
      <p className="mt-1 text-sm text-zinc-400">Providers earn a 0.3% fee on every trade, and carry the risk of price movement. Deposit KII together with the matching units.</p>
      <div className="mt-5 space-y-5">
        <div>
          <label className="label" htmlFor={`${uid}-add`}>
            KII to add
          </label>
          <input id={`${uid}-add`} className="input" inputMode="decimal" value={addKii} onChange={(e) => setAddKii(e.target.value)} placeholder="10" />
          {unitsNeeded !== null && (
            <p className="hint">
              Needs about {fmtKii(unitsNeeded, 4)} units (you hold {fmtKii(myBalance, 4)}).
            </p>
          )}
          <TxButton variant="secondary" className="mt-3 w-full" onClick={() => void add()} disabled={!isConnected || !aKii || !unitsMax || unitsMax > myBalance || tx.busy} busy={tx.pending === "Add liquidity" || tx.pending === "Approve units"} busyLabel="Adding liquidity">
            Add liquidity
          </TxButton>
        </div>
        <div className="border-t border-white/[0.06] pt-5">
          <p className="text-sm font-medium text-white">Your position</p>
          <p className="mt-1 font-display text-lg font-semibold text-white">{pool.totalShares > 0n ? `${(Number((pool.myShares * 10000n) / pool.totalShares) / 100).toFixed(2)}% of the pool` : "n/a"}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {[2500n, 5000n, 10000n].map((f) => (
              <TxButton key={f.toString()} variant="secondary" size="sm" disabled={pool.myShares === 0n || tx.busy} busy={false} onClick={() => remove(f)}>
                Remove {Number(f) / 100}% of my liquidity
              </TxButton>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
