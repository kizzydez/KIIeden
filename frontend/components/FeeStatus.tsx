"use client";

import { useProtocolFee } from "@/lib/data";

/// Stays invisible unless the launch contract can't be read - then it says exactly why.
export default function FeeStatus() {
  const { data: fee, error, isLoading, refetch } = useProtocolFee();

  if (fee !== undefined) return null;
  if (isLoading) return null;
  const message = error instanceof Error ? error.message : "The creation fee hasn't loaded yet.";
  return (
    <div className="glass p-4 border-amber-500/30 text-sm">
      <p className="font-semibold text-amber-300">Can&apos;t reach the launch contract</p>
      <p className="text-zinc-300 mt-1 leading-relaxed">{message}</p>
      <button type="button" className="btn btn-secondary btn-sm mt-3" onClick={() => void refetch()}>
        Try again
      </button>
    </div>
  );
}
