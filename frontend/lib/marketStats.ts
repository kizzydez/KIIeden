import type { TradePoint } from "./data";

const ONE = 10n ** 18n;

export type MarketStats = {
  price: bigint;
  marketCap: bigint; // price x units in circulation, in KII (wei)
  fullyDiluted: bigint; // price x all units the asset will ever have
  circulating: bigint; // units minted so far
  totalUnits: bigint;
  ath: bigint;
  atl: bigint;
  high24h: bigint;
  low24h: bigint;
  changeVsIpoBps: number;
  change24hBps: number;
};

/// All market numbers derived from on-chain data. Prices are KII (wei) per whole unit.
/// - ATH / ATL: the highest / lowest price the pool has ever shown (every trade and every
///   liquidity event), including the current price.
/// - 24h high / low: trades in the last 24 hours, starting from the price the market
///   had when the window opened.
export function computeMarketStats(i: {
  trades: TradePoint[];
  liquidityPrices: bigint[];
  currentPrice: bigint;
  ipoPrice: bigint;
  totalSupply: bigint;
  totalUnits: bigint;
  nowSec: number;
}): MarketStats {
  const { trades, liquidityPrices, currentPrice, ipoPrice, totalSupply, totalUnits, nowSec } = i;

  const all = [...trades.map((t) => t.price), ...liquidityPrices, currentPrice].filter((p) => p > 0n);
  const ath = all.reduce((m, p) => (p > m ? p : m), 0n);
  const atl = all.reduce((m, p) => (p < m ? p : m), all[0] ?? 0n);

  const windowStart = nowSec - 86400;
  const before = [...trades].reverse().find((t) => t.time < windowStart);
  const opening = liquidityPrices[0];
  const base = before?.price ?? opening ?? currentPrice;
  const inWindow = trades.filter((t) => t.time >= windowStart).map((t) => t.price);
  const pts = [base, ...inWindow, currentPrice].filter((p) => p > 0n);
  const high24h = pts.reduce((m, p) => (p > m ? p : m), 0n);
  const low24h = pts.reduce((m, p) => (p < m ? p : m), pts[0] ?? 0n);

  const bps = (a: bigint, b: bigint) => (b > 0n ? Number(((a - b) * 10000n) / b) : 0);

  return {
    price: currentPrice,
    marketCap: (currentPrice * totalSupply) / ONE,
    fullyDiluted: (currentPrice * totalUnits) / ONE,
    circulating: totalSupply,
    totalUnits,
    ath,
    atl,
    high24h,
    low24h,
    changeVsIpoBps: bps(currentPrice, ipoPrice),
    change24hBps: bps(currentPrice, base),
  };
}
