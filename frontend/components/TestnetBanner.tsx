"use client";

import { useEffect, useState } from "react";
import { IS_MAINNET } from "@/lib/config";
import Icon from "./Icon";

/// Slim notice on testnet deployments: tokens have no real value. Dismissed for the session.
export default function TestnetBanner() {
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try {
      setHidden(sessionStorage.getItem("kiieden_testnet_banner") === "1");
    } catch {
      setHidden(false);
    }
  }, []);
  if (IS_MAINNET || hidden) return null;
  return (
    <div className="relative z-30 border-b border-amber-500/30 bg-amber-500/10">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2 text-sm text-amber-200 sm:px-6">
        <p>
          <strong className="font-semibold">Testnet.</strong> You are on KiiChain Testnet (Oro). Tokens here have no real value; use test KII only.
        </p>
        <button
          type="button"
          className="shrink-0 rounded-md p-1 hover:bg-white/10"
          aria-label="Dismiss the testnet notice"
          onClick={() => {
            setHidden(true);
            try {
              sessionStorage.setItem("kiieden_testnet_banner", "1");
            } catch {
              /* ignore */
            }
          }}
        >
          <Icon name="x" />
        </button>
      </div>
    </div>
  );
}
