import { parseEventLogs } from "viem";
import { factoryAbi } from "./contracts";

/// Pull the new collection's address out of a launch/create transaction receipt.
export function collectionFromReceipt(receipt: { logs: readonly unknown[] }): `0x${string}` | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const logs = parseEventLogs({ abi: factoryAbi, eventName: "CollectionCreated", logs: receipt.logs as any });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((logs[0]?.args as any)?.collection as `0x${string}`) ?? null;
  } catch {
    return null;
  }
}
