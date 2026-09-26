import { formatEther } from "viem";
import type { TradePoint } from "./data";

export type Candle = { t: number; open: number; high: number; low: number; close: number; volume: number };

export const TIMEFRAMES: { label: string; seconds: number }[] = [
  { label: "5m", seconds: 300 },
  { label: "1h", seconds: 3600 },
  { label: "1d", seconds: 86400 },
];

const toNum = (v: bigint) => Number(formatEther(v));

/// Group curve trades into OHLC candles. Each candle opens at the previous candle's
/// close (or at `openingPrice` for the first), so gaps between candles look right.
export function buildCandles(trades: TradePoint[], bucketSeconds: number, openingPrice?: number): Candle[] {
  const out: Candle[] = [];
  let prevClose = openingPrice;
  for (const tr of trades) {
    const t = Math.floor(tr.time / bucketSeconds) * bucketSeconds;
    const p = toNum(tr.price);
    const vol = toNum(tr.units);
    const last = out[out.length - 1];
    if (last && last.t === t) {
      last.high = Math.max(last.high, p);
      last.low = Math.min(last.low, p);
      last.close = p;
      last.volume += vol;
    } else {
      const open = prevClose ?? p;
      out.push({ t, open, high: Math.max(open, p), low: Math.min(open, p), close: p, volume: vol });
    }
    prevClose = p;
  }
  return out;
}
