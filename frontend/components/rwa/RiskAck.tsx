"use client";

import { useId } from "react";
import Link from "next/link";

/// Required acknowledgement before anyone commits money to a real-world asset.
export default function RiskAck({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <input id={id} type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-violet-500" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id} className="text-xs leading-relaxed text-zinc-300">
        I understand that units of a real-world asset can lose value, may be hard to sell, and are not guaranteed by KiiEden, and that on-chain transactions cannot be reversed. I have read the{" "}
        <Link href="/terms#rwa" target="_blank" className="text-accent-300 underline underline-offset-2">
          risk disclosures
        </Link>
        .
      </label>
    </div>
  );
}
