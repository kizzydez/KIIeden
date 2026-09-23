"use client";

import type { Candle } from "@/lib/candles";

/// Candlestick chart (pure SVG). Green = the price closed higher than it opened
/// (demand), red = lower (supply). The dashed line marks the latest price.
export default function CandleChart({ candles, height = 260 }: { candles: Candle[]; height?: number }) {
  const W = 720;
  const H = height;
  const padL = 12;
  const padR = 64;
  const padT = 14;
  const padB = 26;

  if (candles.length === 0) {
    return (
      <div className="grid place-items-center rounded-xl border border-white/[0.06] bg-black/20 text-sm text-zinc-400" style={{ height }}>
        No trades yet. The first trade starts the chart.
      </div>
    );
  }

  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  let max = Math.max(...highs);
  let min = Math.min(...lows);
  if (max === min) {
    max *= 1.02;
    min *= 0.98;
  }
  const pad = (max - min) * 0.1;
  max += pad;
  min = Math.max(0, min - pad);

  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const y = (v: number) => padT + (1 - (v - min) / (max - min)) * plotH;
  const step = plotW / Math.max(candles.length, 1);
  const bodyW = Math.max(3, Math.min(22, step * 0.62));

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => min + (max - min) * f);
  const last = candles[candles.length - 1];
  const fmt = (v: number) => (v >= 100 ? v.toFixed(2) : v >= 1 ? v.toFixed(3) : v.toFixed(5));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Price candles">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.06)" />
          <text x={W - padR + 8} y={y(t) + 4} fontSize="10" fill="#7d7397">
            {fmt(t)}
          </text>
        </g>
      ))}

      {candles.map((c, i) => {
        const x = padL + step * i + step / 2;
        const up = c.close >= c.open;
        const color = up ? "#34d399" : "#f43f5e";
        const top = y(Math.max(c.open, c.close));
        const bottom = y(Math.min(c.open, c.close));
        return (
          <g key={c.t}>
            <title>{`${new Date(c.t * 1000).toLocaleString()}\nO ${fmt(c.open)}  H ${fmt(c.high)}  L ${fmt(c.low)}  C ${fmt(c.close)}`}</title>
            <line x1={x} x2={x} y1={y(c.high)} y2={y(c.low)} stroke={color} strokeWidth="1.4" />
            <rect x={x - bodyW / 2} y={top} width={bodyW} height={Math.max(bottom - top, 1.5)} rx="1.5" fill={color} opacity={up ? 0.9 : 0.85} />
          </g>
        );
      })}

      <line x1={padL} x2={W - padR} y1={y(last.close)} y2={y(last.close)} stroke="#b58cff" strokeDasharray="4 4" opacity="0.8" />
      <rect x={W - padR + 2} y={y(last.close) - 9} width={58} height={18} rx="4" fill="#7a2ff2" />
      <text x={W - padR + 8} y={y(last.close) + 4} fontSize="10" fill="#fff" fontWeight="600">
        {fmt(last.close)}
      </text>

      <text x={padL} y={H - 8} fontSize="10" fill="#7d7397">
        {new Date(candles[0].t * 1000).toLocaleDateString()}
      </text>
      <text x={W - padR} y={H - 8} fontSize="10" fill="#7d7397" textAnchor="end">
        {new Date(last.t * 1000).toLocaleDateString()}
      </text>
    </svg>
  );
}
