import { NEW_IPO_WINDOW_SECONDS } from "./config";

export type MintPhase = "upcoming" | "whitelist" | "live" | "ended";

export function mintPhase(s: { mintStart: number; tradingOpen: boolean; mintOpen: boolean; whitelistOpen?: boolean }, nowSec: number): MintPhase {
  if (s.tradingOpen) return "ended";
  if (s.mintOpen || nowSec >= s.mintStart) return "live";
  if (s.whitelistOpen) return "whitelist";
  return "upcoming";
}

export type RwaPhase = "upcoming" | "new" | "ongoing" | "trading";

export const RWA_PHASE_LABEL: Record<RwaPhase, string> = {
  upcoming: "Upcoming IPO",
  new: "New IPO",
  ongoing: "Ongoing IPO",
  trading: "Trading",
};

/// Upcoming: opens in the future. New: open and started within the last 3 days.
/// Ongoing: open for longer than that. Trading: the IPO is over.
export function rwaPhase(a: { ipoStartTime: bigint }, state: { ipoOpen: boolean; ipoEnded: boolean } | undefined, nowSec: number): RwaPhase {
  const start = Number(a.ipoStartTime);
  if (state?.ipoEnded) return "trading";
  if (nowSec < start) return "upcoming";
  if (state && !state.ipoOpen) return "trading";
  return nowSec - start < NEW_IPO_WINDOW_SECONDS ? "new" : "ongoing";
}

/// "2d 4h 10m", "3h 12m 05s", "45s"
export function countdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(sec).padStart(2, "0")}s`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, "0")}s`;
  return `${sec}s`;
}
