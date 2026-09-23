import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { Section } from "@/components/LegalPage";
import { BUSINESS } from "@/lib/business";

export const metadata: Metadata = { title: "Refund Policy | KiiEden" };

const TOC: [string, string][] = [
  ["overview", "Overview"],
  ["returned", "What is returned automatically"],
  ["final", "What is final"],
  ["errors", "Mistakes and disputes"],
  ["law", "Your legal rights"],
];

export default function RefundPage() {
  return (
    <LegalPage
      title="Refund Policy"
      intro="Blockchain payments cannot be reversed by anyone, including us. This policy explains which payments come back to you automatically and which are final."
      toc={TOC}
    >
      <Section id="overview" title="Overview">
        <p>When a transaction is confirmed on the blockchain it is final. The smart contracts move funds according to fixed rules, and we have no ability to undo a transfer, take money back from a seller or creator, or cancel a mint.</p>
      </Section>

      <Section id="returned" title="What is returned automatically">
        <ul>
          <li><strong>Offers.</strong> The amount of an offer is held in escrow. You can cancel it at any time and it is returned to your wallet in the same transaction. If an offer expires, or the NFT you offered on is sold to someone else, your escrow stays yours: cancel it to get it back.</li>
          <li><strong>Overpayment.</strong> If you send more KII than a mint, purchase, contribution or creation fee requires, the excess is refunded automatically in the same transaction.</li>
          <li><strong>Failed transactions.</strong> If a transaction reverts, your KII is not spent, apart from network (gas) fees.</li>
          <li><strong>Liquidity.</strong> Liquidity you add to a real-world-asset pool can be withdrawn at any time, in the amounts the pool then holds for you, which may differ from what you deposited.</li>
        </ul>
      </Section>

      <Section id="final" title="What is final">
        <ul>
          <li><strong>Mints and purchases.</strong> Payment for a mint or a purchase is final once confirmed. There is no refund for a change of mind, for the price falling, or because you did not read the collection details.</li>
          <li><strong>Creation fee.</strong> The fee paid to create a collection is not refunded once the collection exists.</li>
          <li><strong>Real-world-asset units.</strong> IPO contributions and trades of units are final. There is no cooling-off period or automatic refund on the blockchain, including when an IPO closes below its target.</li>
          <li><strong>Network fees.</strong> Gas fees go to the network and cannot be refunded.</li>
        </ul>
      </Section>

      <Section id="errors" title="Mistakes and disputes">
        <p>
          If something went wrong that you believe was our fault (for example a contract error or a page that showed the wrong price), contact{" "}
          {BUSINESS.contactEmail ? <a href={`mailto:${BUSINESS.contactEmail}`}>{BUSINESS.contactEmail}</a> : "the operator's contact address (to be set)"} with your wallet address and transaction hash. We will investigate and, where we can properly do so, put things right. We cannot recover funds sent to a wrong address, or resolve disputes between buyers, sellers and creators, whose deals are with each other.
        </p>
      </Section>

      <Section id="law" title="Your legal rights">
        <p>
          This policy does not limit rights you have by law, for example consumer rights where they apply to you. Where the law gives you a right to withdraw from a digital-content purchase, that right may end once delivery has begun with your consent; because minting delivers the token immediately, we ask for your confirmation before you sign a transaction. See our <Link href="/terms">Terms &amp; Conditions</Link>.
        </p>
      </Section>
    </LegalPage>
  );
}
