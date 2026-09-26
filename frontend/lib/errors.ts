import { BaseError, ContractFunctionRevertedError } from "viem";

const CONTRACT_ERRORS: Record<string, string> = {
  InsufficientFee: "The wallet didn't send enough KII to cover the protocol fee.",
  InsufficientPayment: "Not enough KII sent for this purchase.",
  ListingNotActive: "This listing is no longer active — it was sold, cancelled or replaced.",
  NotTokenOwner: "The seller no longer owns this NFT, so this listing is stale.",
  NotApproved: "Approve the marketplace for this collection first.",
  NotSeller: "Only the seller can do that.",
  ZeroPrice: "Price must be greater than zero.",
  NothingToWithdraw: "There's nothing to withdraw right now.",
  WithdrawFailed: "The withdrawal transfer failed.",
  EnforcedPause: "This part of the protocol is paused by the admin.",
  SupplyCapReached: "This collection has reached its maximum supply.",
  TooManyAtOnce: "Too many NFTs in one launch — reduce the number of images.",
  EmptyLaunch: "Add at least one image.",
  ZeroSupply: "Max supply must be at least 1.",
  InvalidRoyalty: "Royalty can be at most 10%.",
  WhitelistNotOpen: "The whitelist window isn't open right now.",
  NotWhitelisted: "This wallet isn't on the whitelist.",
  PlaceholderRequired: "A reveal needs a placeholder image.",
  AlreadyRevealed: "This collection is already revealed.",
  NotAHolder: "Only wallets that hold units of this asset can post.",
  EmptyMessage: "Write a message first.",
  MessageTooLong: "Messages are limited to 280 characters.",
  TooFast: "Please wait a few seconds between messages.",
  NotModerator: "Only moderators can do that.",
  MintNotOpen: "Minting isn't open right now.",
  MintEnded: "The mint has already ended.",
  WalletLimitReached: "You've reached the mint limit for this wallet.",
  BadQuantity: "Choose a valid quantity.",
  TradingLocked: "This collection can't be traded until its mint has ended.",
  MintingNotEnded: "Trading opens after this collection's mint has ended.",
  OfferNotActive: "That offer is no longer active.",
  OfferExpired: "That offer has expired.",
  OfferTooLow: "The offer changed while you were confirming. Review the new price and try again.",
  NotBidder: "Only the person who made the offer can cancel it.",
  OwnerCannotOffer: "You already own this NFT.",
  BadDuration: "Choose an offer duration between 1 hour and 30 days.",
  TransferFailed: "A transfer failed. Nothing was spent.",
  NotAdmin: "Your wallet isn't an admin for this action.",
  BadIpoStart: "The IPO start time can't be in the past.",
  NoMarket: "The trading market for this asset hasn't been opened yet.",
  PriceOutOfBand: "The opening price must be within 0.25x to 4x of the IPO price.",
  SlippageExceeded: "The price moved more than your slippage limit. Try again.",
  InsufficientShares: "You don't have that much liquidity to remove.",
  IpoNotEnded: "Trading opens after the IPO ends.",
  NotOwnerOrFactory: "Only the collection owner can mint more of this collection.",
  NotCollectionOwner: "Only the collection owner can mint into it.",
  UnknownCollection: "That collection wasn't created through KiiEden.",
  OwnableUnauthorizedAccount: "Your wallet isn't the admin for this action.",
  IpoNotActive: "The IPO for this asset is closed.",
  IpoStillActive: "The IPO is still open — try again after it ends.",
  SoldOut: "This asset is fully subscribed.",
  ZeroValue: "The amount is too small to buy even one whole unit.",
  TransfersLockedDuringIpo: "Units can't be transferred until the IPO ends.",
  TooManyUnitsRequested: "You asked for more units than this order has left.",
  OrderNotActive: "This order is no longer active.",
  InsufficientAllowanceOrBalance: "You don't hold (or haven't approved) enough units for that.",
  NotRwaAsset: "That isn't a KiiEden RWA asset.",
  FeeAboveMax: "The fee can't be above 50 KII.",
  // --- launchpad ---
  NotLaunch: "That token wasn't created on the KiiEden launchpad.",
  BadName: "Token name must be 1-32 characters and symbol 1-12 characters.",
  BadMaxWallet: "Max wallet must be between 0.5% and 100% of supply.",
  BadCreationFee: "The creation fee must be between 1 and 20 KII.",
  WrongFee: "Send exactly the current creation fee shown on the page.",
  FeeTooHigh: "That fee is above the allowed maximum.",
  TradingHalted: "This token isn't trading right now (it's inactive, graduating out, or removed).",
  MaxWalletExceeded: "That purchase would take your wallet above this token's max-wallet limit.",
  NotCreator: "Only this token's creator can do that.",
  StillActive: "This token has traded within the last 30 days, so it isn't inactive yet.",
  AlreadyLiquidating: "Liquidation has already started for this token.",
  NotLiquidating: "This token isn't in liquidation.",
  NotLiquidated: "This token needs to finish liquidating before it can be removed.",
  TooManyHolders: "Tokens with 20 or more holders when they went inactive stay listed (Liquidated), not removed.",
};

/// Turn any wallet / RPC / contract failure into one short sentence a person can act on.
export function friendlyError(e: unknown): string {
  const raw = e instanceof Error ? e.message : typeof e === "string" ? e : "";

  if (/user (rejected|denied)|rejected the request|request rejected|denied transaction/i.test(raw)) {
    return "You rejected the request in your wallet.";
  }

  if (e instanceof BaseError) {
    const reverted = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName;
      if (name && CONTRACT_ERRORS[name]) return CONTRACT_ERRORS[name];
      if (name) return `The contract rejected this transaction (${name}).`;
      if (reverted.reason) return reverted.reason;
    }
    const short = e.shortMessage || "";
    if (/insufficient funds/i.test(short) || /insufficient funds/i.test(raw)) {
      return "Not enough KII in your wallet to cover the amount plus gas.";
    }
    if (short) return short;
  }

  if (/insufficient funds/i.test(raw)) return "Not enough KII in your wallet to cover the amount plus gas.";
  if (/exceeds (the )?(block )?gas limit|gas required exceeds/i.test(raw)) {
    return "This transaction needs more gas than the network allows. Try fewer items.";
  }
  if (raw) return raw.length > 220 ? raw.slice(0, 220) + "…" : raw;
  return "Something went wrong. Please try again.";
}
