"use client";

import { useMemo } from "react";
import { useRwaOrders, useRwaPool } from "@/lib/data";
import { curveDepth, p2pAsks, type BookRow } from "@/lib/orderBook";
import { fmtKii } from "@/lib/format";

type Address = `0x${string}`;

function Rows({ rows, tone }: { rows: BookRow[]; tone: "ask" | "bid" }) {
  const max = rows.reduce((m, r) => (r.cumulative > m ? r.cumulative : m), 0n);
  return (
    <>
      {rows.map((r) => {
        const w = max > 0n ? Number((r.cumulative * 100n) / max) : 0;
        return (
          <tr
            key={r.price.toString()}
            style={{ backgroundImage: `linear-gradient(to left, ${tone === "ask" ? "rgba(244,63,94,0.14)" : "rgba(52,211,153,0.14)"} ${w}%, transparent ${w}%)` }}
          >
            <td className={`py-1.5 pl-2 ${tone === "ask" ? "text-rose-300" : "text-emerald-300"}`}>{fmtKii(r.price, 5)}</td>
            <td className="py-1.5 text-right text-zinc-200">{fmtKii(r.units, 3)}</td>
            <td className="py-1.5 pr-2 text-right text-zinc-400">{fmtKii(r.cumulative, 3)}</td>
          </tr>
        );
      })}
    </>
  );
}

/// Order book so traders can judge depth before they buy.
///  - Curve depth: how many units the pool sells / takes as the price moves 1, 2, 5, 10%.
///  - Peer-to-peer sell orders: real limit orders, cheapest first.
export default function OrderBook({ asset }: { asset: Address }) {
  const { data: pool } = useRwaPool(asset);
  const { data: orders } = useRwaOrders(asset);

  const open = !!pool && pool.totalShares > 0n;
  const depth = useMemo(() => (open && pool ? curveDepth(pool.kiiReserve, pool.unitReserve) : { asks: [], bids: [] }), [open, pool]);
  const p2p = useMemo(() => p2pAsks(orders ?? []), [orders]);

  return (
    <section className="glass p-6" aria-labelledby="book-heading">
      <h2 id="book-heading" className="font-display text-lg font-semibold tracking-tight text-white">
        Order book
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-zinc-400">
        Depth of the pool at each price step, plus open peer-to-peer sell orders. Prices are KII per unit.
      </p>

      {open ? (
        <table className="mt-4 w-full text-xs tabular-nums">
          <caption className="sr-only">Curve depth: asks above the current price, bids below it</caption>
          <thead>
            <tr className="text-zinc-400">
              <th scope="col" className="pb-2 pl-2 text-left font-medium">
                Price
              </th>
              <th scope="col" className="pb-2 text-right font-medium">
                Units
              </th>
              <th scope="col" className="pb-2 pr-2 text-right font-medium">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            <Rows rows={[...depth.asks].reverse()} tone="ask" />
            <tr>
              <td colSpan={3} className="border-y border-white/10 bg-white/[0.03] py-2 pl-2 font-display text-sm font-semibold text-white">
                {pool ? fmtKii(pool.price, 6) : ""} KII <span className="text-xs font-normal text-zinc-400">current price</span>
              </td>
            </tr>
            <Rows rows={depth.bids} tone="bid" />
          </tbody>
        </table>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-zinc-400">The pool has no liquidity yet, so there is no curve depth to show.</p>
      )}

      <h3 className="eyebrow mb-2 mt-6">Peer-to-peer sell orders</h3>
      {p2p.length === 0 ? (
        <p className="text-sm text-zinc-400">No open sell orders.</p>
      ) : (
        <table className="w-full text-xs tabular-nums">
          <caption className="sr-only">Open peer-to-peer sell orders, cheapest first</caption>
          <thead>
            <tr className="text-zinc-400">
              <th scope="col" className="pb-2 pl-2 text-left font-medium">
                Price
              </th>
              <th scope="col" className="pb-2 text-right font-medium">
                Units
              </th>
              <th scope="col" className="pb-2 pr-2 text-right font-medium">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            <Rows rows={p2p} tone="ask" />
          </tbody>
        </table>
      )}
    </section>
  );
}
