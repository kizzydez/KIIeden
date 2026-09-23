"use client";

import { useCallback, useState } from "react";
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { ACTIVE_CHAIN_ID, NETWORK_LABEL } from "./config";
import { explorerTx } from "./chains";
import { friendlyError } from "./errors";
import { useToast } from "@/components/Toast";

export type TxRequest = {
  address: `0x${string}`;
  abi: readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
};

/// One place that runs every on-chain write, so every button in the app behaves
/// the same way:
///   1. makes sure the wallet is on the right chain (offers to switch it),
///   2. asks the wallet to sign, showing a live toast,
///   3. waits for the receipt and checks it didn't revert,
///   4. refreshes all on-screen data,
///   5. ALWAYS releases the busy state - including when the user rejects the
///      request. (The old pages left buttons stuck on "Launching…" forever after
///      a rejected wallet prompt.)
export function useTx() {
  const { isConnected, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: ACTIVE_CHAIN_ID });
  const toast = useToast();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);

  const run = useCallback(
    async (
      label: string,
      req: TxRequest,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      opts?: { successMessage?: string; onReceipt?: (receipt: any) => void }
    ): Promise<boolean> => {
      if (!isConnected) {
        toast.show({ kind: "error", title: "Connect your wallet first" });
        return false;
      }
      setPending(label);
      const id = toast.show({ kind: "loading", title: label, message: "Confirm the transaction in your wallet…" });
      try {
        if (chainId !== ACTIVE_CHAIN_ID) {
          toast.update(id, { message: `Switching your wallet to ${NETWORK_LABEL}…` });
          await switchChainAsync({ chainId: ACTIVE_CHAIN_ID });
          toast.update(id, { message: "Confirm the transaction in your wallet…" });
        }

        // The request shape is validated against the ABI at each call site;
        // here we only forward it, so a loose cast keeps this helper generic.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const hash = await writeContractAsync({ ...(req as any), chainId: ACTIVE_CHAIN_ID });

        toast.update(id, {
          message: "Submitted — waiting for the network to confirm…",
          href: explorerTx(hash),
          hrefLabel: "View transaction",
        });

        if (!publicClient) throw new Error("No RPC connection to confirm the transaction.");
        const receipt = await publicClient.waitForTransactionReceipt({ hash, pollingInterval: 1500 });
        if (receipt.status !== "success") throw new Error("The transaction was mined but reverted on-chain.");

        toast.update(id, {
          kind: "success",
          title: `${label} — done`,
          message: opts?.successMessage ?? "Confirmed on-chain.",
          href: explorerTx(hash),
          hrefLabel: "View transaction",
        });
        try {
          opts?.onReceipt?.(receipt);
        } catch {
          /* a UI callback failing must never turn a confirmed tx into an "error" */
        }
        void queryClient.invalidateQueries();
        return true;
      } catch (e) {
        toast.update(id, { kind: "error", title: `${label} failed`, message: friendlyError(e), href: undefined });
        return false;
      } finally {
        setPending(null);
      }
    },
    [isConnected, chainId, switchChainAsync, writeContractAsync, publicClient, toast, queryClient]
  );

  return { run, pending, busy: pending !== null };
}
