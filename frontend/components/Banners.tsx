"use client";

import { useAccount, useSwitchChain } from "wagmi";
import { ACTIVE_CHAIN_ID, CONTRACTS_CONFIGURED, NETWORK_LABEL } from "@/lib/config";
import { Spinner } from "./ui";

/// Two things that used to fail silently and now say what's wrong:
///  - wallet connected to the wrong chain  -> one-click switch
///  - contract addresses missing from .env.local -> tells you exactly what to do
export default function Banners() {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending } = useSwitchChain();
  const wrongChain = isConnected && chainId !== undefined && chainId !== ACTIVE_CHAIN_ID;

  return (
    <>
      {!CONTRACTS_CONFIGURED && (
        <div className="relative z-20 border-b border-amber-500/30 bg-amber-500/10 backdrop-blur">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 text-sm text-amber-200">
            <strong>Contracts not configured.</strong> Deploy with{" "}
            <code className="bg-black/40 px-1.5 py-0.5 rounded">npm run deploy:testnet</code> in <code className="bg-black/40 px-1.5 py-0.5 rounded">contracts/</code> — it
            writes the addresses into <code className="bg-black/40 px-1.5 py-0.5 rounded">frontend/.env.local</code> — then restart{" "}
            <code className="bg-black/40 px-1.5 py-0.5 rounded">npm run dev</code>.
          </div>
        </div>
      )}
      {wrongChain && (
        <div className="relative z-20 border-b border-accent-500/30 bg-accent-600/15 backdrop-blur">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-accent-300">Your wallet is on a different network. KiiEden runs on {NETWORK_LABEL}.</p>
            <button className="btn btn-primary btn-sm" onClick={() => switchChain({ chainId: ACTIVE_CHAIN_ID })} disabled={isPending}>
              {isPending && <Spinner />} Switch network
            </button>
          </div>
        </div>
      )}
    </>
  );
}
