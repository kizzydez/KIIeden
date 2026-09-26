import { defineChain } from "viem";
import { ACTIVE_CHAIN_ID } from "./config";

// NOTE: no multicall3 is declared on purpose. We can't assume Multicall3 is
// deployed on KiiChain, and viem/wagmi's batched reads throw
// "chain does not support multicall3" when it's missing. All reads in this app
// are plain eth_call requests, which work on every EVM chain.

export const kiiTestnet = defineChain({
  id: 1336,
  name: "KiiChain Testnet (Oro)",
  nativeCurrency: { name: "KII", symbol: "KII", decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_KII_TESTNET_RPC || "https://json-rpc.uno.sentry.testnet.v3.kiivalidator.com"],
    },
  },
  blockExplorers: {
    default: { name: "KiiChain Testnet Explorer", url: "https://testnet.explorer.kiichain.io" },
  },
  testnet: true,
});

export const kiiMainnet = defineChain({
  id: 1783,
  name: "KiiChain",
  nativeCurrency: { name: "KII", symbol: "KII", decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_KII_MAINNET_RPC || "https://evmrpc.kiichain.nodestake.org"],
    },
  },
  blockExplorers: {
    default: { name: "KiiChain Explorer", url: "https://mainnet.explorer.kiichain.io" },
  },
  testnet: false,
});

export const activeChain = ACTIVE_CHAIN_ID === 1783 ? kiiMainnet : kiiTestnet;

/// Explorer links (Blockscout-style paths).
export function explorerTx(hash: string): string {
  return `${activeChain.blockExplorers.default.url}/tx/${hash}`;
}
export function explorerAddress(address: string): string {
  return `${activeChain.blockExplorers.default.url}/address/${address}`;
}
