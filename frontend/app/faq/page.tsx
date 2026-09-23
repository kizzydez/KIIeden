"use client";

import { useState } from "react";
import Link from "next/link";
import { LEGAL_LAST_UPDATED } from "@/lib/business";
import { PageHeader } from "@/components/ui";
import Icon from "@/components/Icon";

type Item = { q: string; a: React.ReactNode };
type Group = { title: string; items: Item[] };

const GROUPS: Group[] = [
  {
    title: "Getting started",
    items: [
      { q: "Do I need to create an account?", a: "No. Connect a wallet (MetaMask or any EVM wallet) — your address is your account. There is no sign-up, email or password." },
      { q: "Which network does KiiEden run on?", a: "KiiChain. The banner at the top of the page tells you whether you're on the testnet (Oro) or mainnet, and offers to switch your wallet if it's on the wrong one." },
      { q: "Where are images and files stored?", a: "On IPFS, a public, content-addressed storage network. Nothing is stored in a database we control." },
    ],
  },
  {
    title: "Minting and trading",
    items: [
      { q: "How does minting work?", a: "A creator uploads their art and gets a minting link. Followers mint from that link during the schedule the creator set. Once the mint ends — by time, by selling out, or the creator ending it early — the collection becomes tradeable." },
      { q: "What is a whitelist?", a: "An optional window during which only wallets the creator listed can mint, usually at a special price. The public mint opens once it closes." },
      { q: "What is a reveal?", a: "An optional feature where every NFT shows one placeholder image until the creator's reveal time, after which the real artwork appears." },
      { q: "Do I need to approve the marketplace before listing?", a: "No. KiiEden collections automatically allow the marketplace to transfer a token only when you actually sell it or accept an offer — no separate approval transaction." },
      { q: "What is an offer, and what is escrow?", a: "Anyone who doesn't own an NFT can make an offer; the amount is held in the marketplace contract (escrow) until it is accepted or cancelled. The owner can accept the highest active offer at any time with \"Sell Now\", which pays out from escrow instantly." },
    ],
  },
  {
    title: "Real-world assets",
    items: [
      { q: "Who can list a real-world asset?", a: "Only platform administrators. This is enforced by the smart contract, not just the interface." },
      { q: "What happens after an IPO ends?", a: "Units trade on an automated demand-and-supply pool: buying raises the price, selling lowers it. A price chart and order book are shown on each asset's page." },
      {
        q: "Is buying an RWA unit risky?",
        a: (
          <>
            Yes. Prices can fall, units may be hard to sell, and nothing is guaranteed. Read the risk disclosures in our{" "}
            <Link href="/terms#rwa" className="text-accent-300 underline underline-offset-2">
              Terms &amp; Conditions
            </Link>
            .
          </>
        ),
      },
    ],
  },
  {
    title: "Fees and payments",
    items: [
      { q: "What does it cost to create a collection?", a: "A flat KII fee, shown in your wallet before you confirm. It does not change with how many NFTs are in the collection." },
      { q: "Are there fees on trading?", a: "Yes — see the fee section of our Terms & Conditions for the current percentages. Fees are shown before you confirm each transaction." },
      { q: "Can I get a refund?", a: "Blockchain transactions can't be reversed by us. See our Refund Policy for what is returned automatically (like cancelled offers and overpayment) and what is final." },
    ],
  },
  {
    title: "Security and privacy",
    items: [
      { q: "Does KiiEden ever ask for my private key or recovery phrase?", a: "Never. Nobody legitimate will ever ask for it. If someone does, it's a scam." },
      { q: "What data does KiiEden collect?", a: "As little as possible — no accounts, no analytics, no tracking. See our Privacy Policy for the full list." },
    ],
  },
];

function FaqItem({ item, id }: { item: Item; id: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-white/[0.07] last:border-b-0">
      <h3>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-4 py-4 text-left"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="font-medium text-white">{item.q}</span>
          <Icon name="arrow" className={`shrink-0 text-zinc-400 transition-transform ${open ? "rotate-90" : ""}`} />
        </button>
      </h3>
      {open && (
        <div id={id} className="pb-4 text-sm leading-relaxed text-zinc-300">
          {item.a}
        </div>
      )}
    </div>
  );
}

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Support" title="Frequently asked questions" subtitle={`Last updated ${LEGAL_LAST_UPDATED}. Can't find your answer? Use the help button in the corner.`} />
      <div className="space-y-10">
        {GROUPS.map((g) => (
          <section key={g.title} aria-labelledby={`grp-${g.title}`}>
            <h2 id={`grp-${g.title}`} className="mb-2 font-display text-lg font-semibold tracking-tight text-white">
              {g.title}
            </h2>
            <div className="glass px-5">
              {g.items.map((it, i) => (
                <FaqItem key={it.q} item={it} id={`faq-${g.title}-${i}`} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
