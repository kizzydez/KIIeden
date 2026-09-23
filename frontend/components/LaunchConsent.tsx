"use client";

import { useId } from "react";
import Link from "next/link";

/// Explicit, un-ticked-by-default consent shown before anything is uploaded or signed.
export default function LaunchConsent({
  rights,
  onRights,
  publicData,
  onPublicData,
}: {
  rights: boolean;
  onRights: (v: boolean) => void;
  publicData: boolean;
  onPublicData: (v: boolean) => void;
}) {
  const uid = useId();
  return (
    <fieldset className="space-y-4 rounded-2xl border border-white/[0.07] bg-black/20 p-5">
      <legend className="eyebrow px-1">Before you continue</legend>
      <div className="flex items-start gap-3">
        <input id={`${uid}-rights`} type="checkbox" required className="mt-1 h-4 w-4 shrink-0 accent-violet-500" checked={rights} onChange={(e) => onRights(e.target.checked)} />
        <label htmlFor={`${uid}-rights`} className="text-sm leading-relaxed text-zinc-300">
          I own, or have permission to use and sell, everything I am uploading (images, text and any names), and it does not infringe anyone&apos;s rights. I have read and accept the{" "}
          <Link href="/terms" target="_blank" className="text-accent-300 underline underline-offset-2">
            Terms &amp; Conditions
          </Link>
          .
        </label>
      </div>
      <div className="flex items-start gap-3">
        <input id={`${uid}-public`} type="checkbox" required className="mt-1 h-4 w-4 shrink-0 accent-violet-500" checked={publicData} onChange={(e) => onPublicData(e.target.checked)} />
        <label htmlFor={`${uid}-public`} className="text-sm leading-relaxed text-zinc-300">
          I understand that my files and any wallet addresses I list are published on IPFS and the blockchain, are public, and cannot be deleted or changed afterwards. See the{" "}
          <Link href="/privacy" target="_blank" className="text-accent-300 underline underline-offset-2">
            Privacy Policy
          </Link>
          .
        </label>
      </div>
    </fieldset>
  );
}
