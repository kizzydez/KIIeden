import { DEPLOY_BLOCK, FALLBACK_LOOKBACK_BLOCKS } from "./config";

/// Minimal shape of the viem public client we rely on (kept loose on purpose so
/// this helper works with whatever client wagmi hands us).
export type LogClient = {
  getBlockNumber: () => Promise<bigint>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getContractEvents: (args: any) => Promise<any[]>;
};

export type EventQuery = {
  address: `0x${string}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  abi: any;
  eventName: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args?: Record<string, any>;
};

type CacheEntry = { scannedTo: bigint; logs: unknown[] };
const cache = new Map<string, CacheEntry>();

function keyOf(chainId: number | undefined, q: EventQuery): string {
  return JSON.stringify(
    [chainId ?? 0, q.address.toLowerCase(), q.eventName, q.args ?? null],
    (_k, v) => (typeof v === "bigint" ? v.toString() : v)
  );
}

/// Fetch every log of one event from the deploy block to the chain tip.
///
/// Why this exists instead of a single getContractEvents(fromBlock: 0):
///  - many public RPCs reject eth_getLogs over a wide block range, which made
///    the whole UI look empty ("no listings") while the chain was fine;
///  - it adapts: on an RPC error it halves the window and retries, and grows
///    it again after successes;
///  - it is incremental: results are cached per (chain, contract, event, args),
///    so a refetch only scans blocks that appeared since the last call.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getEventLogs(client: LogClient, chainId: number | undefined, q: EventQuery): Promise<any[]> {
  const key = keyOf(chainId, q);
  const latest = await client.getBlockNumber();

  const cached = cache.get(key);
  let from: bigint;
  if (cached) {
    from = cached.scannedTo + 1n;
  } else if (DEPLOY_BLOCK > 0n) {
    from = DEPLOY_BLOCK;
  } else {
    from = latest > FALLBACK_LOOKBACK_BLOCKS ? latest - FALLBACK_LOOKBACK_BLOCKS : 0n;
  }

  const logs: unknown[] = cached ? [...cached.logs] : [];
  let step = 50_000n;
  const MIN_STEP = 500n;
  const MAX_STEP = 500_000n;
  let failures = 0;

  while (from <= latest) {
    const to = from + step - 1n > latest ? latest : from + step - 1n;
    try {
      const chunk = await client.getContractEvents({
        address: q.address,
        abi: q.abi,
        eventName: q.eventName,
        args: q.args,
        fromBlock: from,
        toBlock: to,
      });
      logs.push(...chunk);
      from = to + 1n;
      failures = 0;
      if (step < MAX_STEP) step = step * 2n > MAX_STEP ? MAX_STEP : step * 2n;
    } catch (err) {
      failures += 1;
      await new Promise((r) => setTimeout(r, 250 * failures));
      if (step > MIN_STEP) {
        step = step / 2n < MIN_STEP ? MIN_STEP : step / 2n;
      } else if (failures > 3) {
        throw err; // window is already tiny and it still fails: it's a real RPC problem
      }
    }
  }

  cache.set(key, { scannedTo: latest, logs });
  return logs;
}

/// Drop cached logs (used after we know something changed, e.g. a new listing).
export function clearLogCache() {
  cache.clear();
}
