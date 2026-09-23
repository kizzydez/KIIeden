"use client";

import { useEffect } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg py-16 text-center page-enter">
      <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-full border border-rose-500/40 bg-rose-500/10 text-2xl text-rose-300">
        <Icon name="x" />
      </div>
      <h1 className="font-display text-2xl font-semibold tracking-tight text-white">Something went wrong</h1>
      <p className="mt-3 leading-relaxed text-zinc-400">This page hit an unexpected error. No transaction was sent because of this. Try again, or go back to the home page.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button type="button" className="btn btn-primary" onClick={() => reset()}>
          Try again
        </button>
        <Link href="/" className="btn btn-secondary">
          Back to home
        </Link>
      </div>
      {error.digest && <p className="mt-6 text-xs text-zinc-400">Reference: {error.digest}</p>}
    </div>
  );
}
