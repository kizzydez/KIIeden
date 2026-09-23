import { formatEther, parseEther } from "viem";

/// Human-friendly KII amount: thousands separators, trimmed zeros, max N decimals.
export function fmtKii(value: bigint | undefined | null, maxDecimals = 4): string {
  if (value === undefined || value === null) return "—";
  const s = formatEther(value);
  const [intPart, fracPart = ""] = s.split(".");
  const frac = fracPart.slice(0, maxDecimals).replace(/0+$/, "");
  const int = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (value > 0n && int === "0" && frac === "") return `<0.${"0".repeat(Math.max(maxDecimals - 1, 0))}1`;
  return frac ? `${int}.${frac}` : int;
}

/// Parse a user-typed decimal amount into wei. Returns null instead of throwing
/// on anything invalid ("abc", "1e3", "1.2.3", too many decimals, empty).
/// (viem's parseEther throws, and calling it directly during render used to
/// crash the whole page on a stray keystroke.)
export function parseAmount(input: string): bigint | null {
  const t = input.trim();
  if (t === "" || t === ".") return null;
  if (!/^\d*\.?\d*$/.test(t)) return null;
  let norm = t;
  if (norm.startsWith(".")) norm = "0" + norm;
  if (norm.endsWith(".")) norm = norm.slice(0, -1);
  const frac = norm.split(".")[1] ?? "";
  if (frac.length > 18) return null;
  try {
    return parseEther(norm);
  } catch {
    return null;
  }
}

export function shortAddr(a?: string | null): string {
  if (!a) return "";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function sameAddr(a?: string | null, b?: string | null): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

export function pctOf(part: bigint, total: bigint): number {
  if (total <= 0n) return 0;
  const bps = Number((part * 10000n) / total); // basis points, avoids float overflow on 1e18-scale values
  return Math.min(100, bps / 100);
}

/// "2d 4h", "3h 12m", "5m", "ended"
export function timeLeft(endSeconds: number, nowMs: number = Date.now()): string {
  const diff = Math.floor(endSeconds - nowMs / 1000);
  if (diff <= 0) return "ended";
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  const m = Math.floor((diff % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${Math.max(m, 1)}m`;
}

/// Cost in wei of `units` (18-decimal atomic amount) at `pricePerUnit` (wei per WHOLE unit),
/// rounded UP - this mirrors RWAUnitMarketplace.buyUnits exactly.
export function unitCost(units: bigint, pricePerUnit: bigint): bigint {
  const ONE = 10n ** 18n;
  return (units * pricePerUnit + ONE - 1n) / ONE;
}
