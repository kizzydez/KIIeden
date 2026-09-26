/// Central runtime config. Everything that changes between testnet and mainnet
/// is driven from env vars (see .env.example), so switching networks is a
/// config change, not a code change.

const rawChain = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 1336);

/// The ONE chain the app talks to. Wallets on any other chain get a
/// "switch network" prompt instead of confusing errors.
export const ACTIVE_CHAIN_ID: 1336 | 1783 = rawChain === 1783 ? 1783 : 1336;
export const IS_MAINNET = ACTIVE_CHAIN_ID === 1783;
export const NETWORK_LABEL = IS_MAINNET ? "KiiChain Mainnet" : "KiiChain Testnet (Oro)";

const rawBlock = (process.env.NEXT_PUBLIC_DEPLOY_BLOCK || "").trim();
/// Block the contracts were deployed at. Event scans start here.
export const DEPLOY_BLOCK: bigint = /^\d+$/.test(rawBlock) ? BigInt(rawBlock) : 0n;

/// If DEPLOY_BLOCK isn't set we only look back this many blocks instead of
/// scanning from genesis (which many RPCs reject and which is very slow).
export const FALLBACK_LOOKBACK_BLOCKS = 1_500_000n;

const ZERO = "0x0000000000000000000000000000000000000000";

export const ADDRESSES = {
  feeManager: (process.env.NEXT_PUBLIC_FEE_MANAGER_ADDRESS || ZERO) as `0x${string}`,
  factory: (process.env.NEXT_PUBLIC_FACTORY_ADDRESS || ZERO) as `0x${string}`,
  marketplace: (process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS || ZERO) as `0x${string}`,
  rwaFactory: (process.env.NEXT_PUBLIC_RWA_FACTORY_ADDRESS || ZERO) as `0x${string}`,
  rwaMarketplace: (process.env.NEXT_PUBLIC_RWA_MARKETPLACE_ADDRESS || ZERO) as `0x${string}`,
  rwaCurve: (process.env.NEXT_PUBLIC_RWA_CURVE_ADDRESS || ZERO) as `0x${string}`,
  rwaChat: (process.env.NEXT_PUBLIC_RWA_CHAT_ADDRESS || ZERO) as `0x${string}`,
  launchpad: (process.env.NEXT_PUBLIC_LAUNCHPAD_ADDRESS || ZERO) as `0x${string}`,
};

export function isSet(address: string | undefined): boolean {
  return !!address && /^0x[0-9a-fA-F]{40}$/.test(address) && address.toLowerCase() !== ZERO;
}

/// True when every core contract address has been configured.
export const CONTRACTS_CONFIGURED =
  isSet(ADDRESSES.feeManager) &&
  isSet(ADDRESSES.factory) &&
  isSet(ADDRESSES.marketplace) &&
  isSet(ADDRESSES.rwaFactory) &&
  isSet(ADDRESSES.rwaMarketplace) &&
  isSet(ADDRESSES.rwaCurve) &&
  isSet(ADDRESSES.rwaChat);

export const MAX_COLLECTION_SIZE = 100_000; // images per collection launch
export const MAX_EDITIONS = 1000; // copies of a single NFT
export const MAX_MINT_PER_TX = 50; // mirrors NFTCollection.MAX_MINT_PER_TX
export const MAX_ROYALTY_PCT = 10; // mirrors NFTCollection's on-chain 10% cap
export const NEW_IPO_WINDOW_SECONDS = 3 * 24 * 60 * 60; // an IPO counts as "new" for its first 3 days
export const MAX_WHITELIST_SIZE = 50_000;
export const CHAT_MAX_LENGTH = 280;

// ---------------------------------------------------------------- launchpad
// Mirrors the on-chain bounds in MemeLaunchpad.sol so the UI can validate before
// sending a transaction. The contract is the source of truth; these are just for
// instant client-side feedback.
export const LAUNCHPAD_MIN_CREATION_FEE_KII = 1;
export const LAUNCHPAD_MAX_CREATION_FEE_KII = 20;
export const LAUNCHPAD_MIN_MAX_WALLET_BPS = 50; // 0.5%
export const LAUNCHPAD_MAX_WALLET_DISABLED_BPS = 10000; // 100% = no cap
export const LAUNCHPAD_DEFAULT_MAX_WALLET_BPS = 200; // 2%
export const LAUNCHPAD_TOTAL_SUPPLY = 1_000_000_000; // fixed supply per token
