"use client";

import { useState } from "react";
import Link from "next/link";
import { useOrigin } from "@/lib/useNow";
import Icon from "./Icon";

/// The shareable minting link, with a copy button.
export default function MintLinkCard({ collection, title = "Your minting link" }: { collection: string; title?: string }) {
  const origin = useOrigin();
  const [copied, setCopied] = useState(false);
  const url = `${origin}/mint/${collection}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the link is still selectable in the field */
    }
  }

  return (
    <div className="glass p-6 text-left">
      <p className="eyebrow">{title}</p>
      <p className="mt-2 text-sm text-zinc-400">Share this with your followers. They mint from it while the mint is open.</p>
      <div className="mt-4 flex gap-2">
        <input readOnly className="input font-mono text-xs" value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Minting link" />
        <button type="button" onClick={copy} className="btn btn-secondary shrink-0">
          <Icon name={copied ? "check" : "copy"} />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <Link href={`/mint/${collection}`} className="mt-4 inline-flex items-center gap-2 text-sm text-accent-300 hover:text-accent-400">
        Open the mint page <Icon name="arrow" />
      </Link>
    </div>
  );
}
