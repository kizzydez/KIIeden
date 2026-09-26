"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { kiiMainnet, kiiTestnet } from "./chains";
import { ACTIVE_CHAIN_ID } from "./config";

// The active chain goes first so wallets default to it. Transports are left to
// RainbowKit's defaults (plain http() against each chain's configured RPC).
const chains = ACTIVE_CHAIN_ID === 1783 ? ([kiiMainnet, kiiTestnet] as const) : ([kiiTestnet, kiiMainnet] as const);

export const wagmiConfig = getDefaultConfig({
  appName: "KiiEden",
  // A placeholder is fine for browser wallets like MetaMask. Add a real
  // WalletConnect Cloud project id in .env.local to enable mobile-wallet QR login.
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "00000000000000000000000000000000",
  chains,
  ssr: true,
});
