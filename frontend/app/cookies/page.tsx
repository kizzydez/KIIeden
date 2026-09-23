import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { Section } from "@/components/LegalPage";
import CookieSettingsButton from "@/components/CookieSettingsButton";

export const metadata: Metadata = { title: "Cookies Policy | KiiEden" };

const TOC: [string, string][] = [
  ["what", "What we use"],
  ["table", "Storage in your browser"],
  ["third", "Third-party content"],
  ["choices", "Your choices"],
];

const ROWS: [string, string, string, string][] = [
  ["kiieden_consent_v1", "Remembers your choice on this banner", "Necessary", "Until you change or clear it"],
  ["Wallet connection keys (set by the wallet libraries, e.g. names starting wagmi, rk- or wc@2:)", "Keeps your wallet connected between visits and remembers the last network", "Necessary for the wallet feature you asked for", "Until you disconnect or clear site data"],
  ["kiieden_pinata_jwt", "Remembers the Pinata upload key you typed in, so you don't retype it", "Optional (only if you allow it)", "Tab session; on this device only with consent"],
];

export default function CookiesPage() {
  return (
    <LegalPage
      title="Cookies Policy"
      intro="This page lists everything the site keeps in your browser. We use no analytics, advertising, social-media or other tracking cookies, and no tracking scripts."
      toc={TOC}
    >
      <Section id="what" title="What we use">
        <p>
          We use your browser&apos;s local and session storage (the same purpose as cookies) only for the items in the table below. We do not set cookies ourselves.
        </p>
      </Section>

      <Section id="table" title="Storage in your browser">
        <div className="overflow-x-auto rounded-2xl border border-white/[0.07]">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <caption className="sr-only">Items kept in your browser, their purpose, category and duration</caption>
            <thead className="bg-white/[0.04] text-zinc-200">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Name</th>
                <th scope="col" className="px-4 py-3 font-semibold">Purpose</th>
                <th scope="col" className="px-4 py-3 font-semibold">Category</th>
                <th scope="col" className="px-4 py-3 font-semibold">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06] text-zinc-300">
              {ROWS.map((r) => (
                <tr key={r[0]}>
                  <th scope="row" className="px-4 py-3 align-top font-mono text-xs font-normal text-zinc-200">{r[0]}</th>
                  <td className="px-4 py-3 align-top">{r[1]}</td>
                  <td className="px-4 py-3 align-top">{r[2]}</td>
                  <td className="px-4 py-3 align-top">{r[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="third" title="Third-party content">
        <p>
          NFT images and metadata are loaded from public IPFS gateways, and blockchain data from RPC providers. Those services receive your IP address and may set their own cookies, which we do not control. See the <Link href="/privacy#thirdparties">Privacy Policy</Link> for the list. We embed no frames, videos, maps or social widgets.
        </p>
      </Section>

      <Section id="choices" title="Your choices">
        <p>You can change your choice at any time, and you can clear this site&apos;s data in your browser settings. Withdrawing consent removes a remembered upload key immediately.</p>
        <CookieSettingsButton />
      </Section>
    </LegalPage>
  );
}
