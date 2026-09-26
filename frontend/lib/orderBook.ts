import type { RwaOrder } from "./data";

export type BookRow = { price: bigint; units: bigint; cumulative: bigint };

const STEPS_BPS = [100, 200, 500, 1000]; // price moves of 1%, 2%, 5%, 10%

/// What the curve pool can absorb at each price step, from its reserves:
///   asks: units you can BUY before the price has risen by 1 / 2 / 5 / 10 %
///   bids: units the pool will TAKE before the price has fallen by 1 / 2 / 5 / 10 %
/// (constant product, ignoring the small fees). Levels are cumulative from the current price.
export function curveDepth(kiiReserve: bigint, unitReserve: bigint): { asks: BookRow[]; bids: BookRow[] } {
  if (kiiReserve <= 0n || unitReserve <= 0n) return { asks: [], bids: [] };
  const spot = (kiiReserve * 10n ** 18n) / unitReserve;
  const SCALE = 1_000_000_000n;

  const asks: BookRow[] = [];
  const bids: BookRow[] = [];
  let prevAsk = 0n;
  let prevBid = 0n;
  for (const s of STEPS_BPS) {
    // ask: price up by s bps -> reserve of units falls to Y * sqrt(1e4 / (1e4 + s))
    const rUp = BigInt(Math.round(Math.sqrt(10000 / (10000 + s)) * 1e9));
    const yUp = (unitReserve * rUp) / SCALE;
    const unitsUp = unitReserve - yUp;
    asks.push({ price: (spot * BigInt(10000 + s)) / 10000n, units: unitsUp - prevAsk, cumulative: unitsUp });
    prevAsk = unitsUp;

    // bid: price down by s bps -> reserve of units rises to Y * sqrt(1e4 / (1e4 - s))
    const rDown = BigInt(Math.round(Math.sqrt(10000 / (10000 - s)) * 1e9));
    const yDown = (unitReserve * rDown) / SCALE;
    const unitsDown = yDown - unitReserve;
    bids.push({ price: (spot * BigInt(10000 - s)) / 10000n, units: unitsDown - prevBid, cumulative: unitsDown });
    prevBid = unitsDown;
  }
  return { asks, bids };
}

/// Peer-to-peer sell orders grouped by price, cheapest first, with cumulative units.
export function p2pAsks(orders: RwaOrder[]): BookRow[] {
  const byPrice = new Map<string, { price: bigint; units: bigint }>();
  for (const o of orders) {
    const k = o.pricePerUnit.toString();
    const cur = byPrice.get(k);
    if (cur) cur.units += o.remainingUnits;
    else byPrice.set(k, { price: o.pricePerUnit, units: o.remainingUnits });
  }
  const rows = [...byPrice.values()].sort((a, b) => (a.price < b.price ? -1 : a.price > b.price ? 1 : 0));
  let cum = 0n;
  return rows.map((r) => {
    cum += r.units;
    return { price: r.price, units: r.units, cumulative: cum };
  });
}
