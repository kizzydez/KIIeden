import type { ReactNode } from "react";
import { BUSINESS, BUSINESS_COMPLETE, LEGAL_LAST_UPDATED } from "@/lib/business";

/// Shared layout for the legal pages: readable measure, table of contents, and the real business details.
export default function LegalPage({ title, intro, toc, children }: { title: string; intro: string; toc: [string, string][]; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl page-enter">
      <p className="eyebrow mb-3">Legal</p>
      <h1 className="font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h1>
      <p className="mt-3 text-sm text-zinc-400">Last updated {LEGAL_LAST_UPDATED}</p>
      <p className="mt-6 leading-relaxed text-zinc-300">{intro}</p>

      <nav aria-label={`${title} contents`} className="glass mt-8 p-5">
        <p className="eyebrow mb-3">Contents</p>
        <ol className="grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
          {toc.map(([id, label], i) => (
            <li key={id}>
              <a href={`#${id}`} className="text-zinc-300 hover:text-white">
                {i + 1}. {label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="legal mt-10 space-y-10">{children}</div>

      <section className="glass mt-14 p-6" aria-labelledby="who-heading">
        <h2 id="who-heading" className="font-display text-lg font-semibold text-white">
          Who we are
        </h2>
        {BUSINESS_COMPLETE ? (
          <address className="mt-3 space-y-1 text-sm not-italic leading-relaxed text-zinc-300">
            <p className="font-semibold text-white">
              {BUSINESS.legalName} (trading as {BUSINESS.tradingName})
            </p>
            <p>Registered address: {BUSINESS.registeredAddress}</p>
            <p>Registration number: {BUSINESS.registrationNumber}</p>
            {BUSINESS.vatNumber && <p>VAT number: {BUSINESS.vatNumber}</p>}
            <p>
              Contact:{" "}
              <a href={`mailto:${BUSINESS.contactEmail}`} className="text-accent-300 underline underline-offset-2">
                {BUSINESS.contactEmail}
              </a>
            </p>
          </address>
        ) : (
          <p className="mt-3 text-sm text-amber-300" role="alert">
            The operator&apos;s business details have not been configured. Set the NEXT_PUBLIC_BUSINESS_* variables before launch.
          </p>
        )}
      </section>
    </div>
  );
}

export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-24">
      <h2 id={`${id}-h`} className="font-display text-xl font-semibold tracking-tight text-white">
        {title}
      </h2>
      <div className="mt-3 space-y-3 leading-relaxed text-zinc-300 [&_a]:text-accent-300 [&_a]:underline [&_a]:underline-offset-2 [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-white">{children}</div>
    </section>
  );
}
