"use client";

import { useState } from "react";
import { parseEther } from "viem";
import { ADDRESSES, LAUNCHPAD_MAX_CREATION_FEE_KII, LAUNCHPAD_MIN_CREATION_FEE_KII } from "@/lib/config";
import { launchpadAbi } from "@/lib/contracts";
import { useIsLaunchpadAdmin, useLaunchpadParams } from "@/lib/data";
import { useTx } from "@/lib/useTx";
import { fmtKii } from "@/lib/format";
import { TxButton } from "./ui";

/// Owner-only controls for the launchpad's global, adjustable parameters. Only
/// renders anything for the connected admin wallet — everyone else sees nothing.
export default function LaunchpadAdminPanel() {
  const isAdmin = useIsLaunchpadAdmin();
  const { data: params } = useLaunchpadParams();
  const tx = useTx();
  const [fee, setFee] = useState("");

  if (!isAdmin || !params) return null;

  const feeNum = Number(fee);
  const validFee = fee !== "" && Number.isFinite(feeNum) && feeNum >= LAUNCHPAD_MIN_CREATION_FEE_KII && feeNum <= LAUNCHPAD_MAX_CREATION_FEE_KII;

  return (
    <section className="glass mb-10 border border-accent-500/20 p-6">
      <h2 className="font-display text-lg font-semibold tracking-tight text-white">Launchpad admin</h2>
      <p className="mt-1 text-sm text-zinc-400">
        Current creation fee: <span className="text-white">{fmtKii(params.creationFeeWei)} KII</span> · protocol fee {params.protocolFeeBps / 100}% · default
        creator fee {params.creatorFeeBpsDefault / 100}%
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-2">
        <div>
          <label className="label" htmlFor="admin-fee">
            New creation fee (KII, {LAUNCHPAD_MIN_CREATION_FEE_KII}–{LAUNCHPAD_MAX_CREATION_FEE_KII})
          </label>
          <input id="admin-fee" className="input w-40" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="2" />
        </div>
        <TxButton
          variant="secondary"
          disabled={!validFee}
          busy={tx.pending === "Update creation fee"}
          busyLabel="Updating…"
          onClick={() => void tx.run("Update creation fee", { address: ADDRESSES.launchpad, abi: launchpadAbi, functionName: "setCreationFee", args: [parseEther(fee)] }, { successMessage: `Creation fee is now ${fee} KII.` })}
        >
          Update fee
        </TxButton>
      </div>
    </section>
  );
}
