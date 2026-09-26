"use client";

import Link from "next/link";
import Image from "next/image";
import { NETWORK_LABEL } from "@/lib/config";
import { BUSINESS, BUSINESS_COMPLETE } from "@/lib/business";
import { reopenConsent } from "@/lib/consent";
import { telHref } from "@/lib/business";
import CopyButton from "./CopyButton";

const LEGAL: [string, string][] = [
  ["/terms", "Terms & Conditions"],
  ["/privacy", "Privacy Policy"],
  ["/cookies", "Cookies Policy"],
  ["/refund", "Refund Policy"],
];

export default function Footer() {
  return (
    <footer className="relative z-10 mt-24 border-t border-white/[0.06]">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 md:grid-cols-3">
          <div>
            <div className="flex items-center gap-2.5">
              <Image src="/logo-mark.png" alt="" width={28} height={28} className="rounded-md" />
              <span className="font-display text-base font-semibold text-white">KiiEden</span>
            </div>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-zinc-400">NFT and real-world asset marketplace on {NETWORK_LABEL}. Wallet-only: no accounts, no passwords.</p>
          </div>

          <nav aria-label="Legal">
            <h2 className="eyebrow mb-3">Support</h2>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/faq" className="text-zinc-300 hover:text-white">
                  FAQ
                </Link>
              </li>
              <li>
                <Link href="/search" className="text-zinc-300 hover:text-white">
                  Search
                </Link>
              </li>
              {LEGAL.map(([href, label]) => (
                <li key={href}>
                  <Link href={href} className="text-zinc-300 hover:text-white">
                    {label}
                  </Link>
                </li>
              ))}
              <li>
                <button type="button" data-cookie-settings="" onClick={reopenConsent} className="text-zinc-300 hover:text-white">
                  Cookie settings
                </button>
              </li>
            </ul>
          </nav>

          <div>
            <h2 className="eyebrow mb-3">Operated by</h2>
            {BUSINESS_COMPLETE ? (
              <address className="space-y-1 text-sm not-italic leading-relaxed text-zinc-300">
                <p className="font-semibold text-white">{BUSINESS.legalName}</p>
                <p>{BUSINESS.registeredAddress}</p>
                <p>Registration no. {BUSINESS.registrationNumber}</p>
                {BUSINESS.vatNumber && <p>VAT no. {BUSINESS.vatNumber}</p>}
                <p className="flex items-center gap-1">
                  <a href={`mailto:${BUSINESS.contactEmail}`} className="text-accent-300 underline underline-offset-2">
                    {BUSINESS.contactEmail}
                  </a>
                  <CopyButton value={BUSINESS.contactEmail} label="email address" />
                </p>
                {telHref(BUSINESS.phone) && (
                  <p>
                    <a href={telHref(BUSINESS.phone)} className="text-accent-300 underline underline-offset-2">
                      {BUSINESS.phone}
                    </a>
                  </p>
                )}
              </address>
            ) : (
              <p className="text-sm text-amber-300">Business details are not configured yet. Set the NEXT_PUBLIC_BUSINESS_* variables before launch.</p>
            )}
          </div>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-6">
          <p className="text-xs text-zinc-400">© {new Date().getFullYear()} {BUSINESS.tradingName}. All rights reserved.</p>
          <p className="max-w-2xl text-xs leading-relaxed text-zinc-400">
            Digital assets and tokenized real-world assets are risky and can lose value. Nothing on this site is financial, legal or tax advice.
          </p>
        </div>
      </div>
    </footer>
  );
}
