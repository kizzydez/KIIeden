import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { Section } from "@/components/LegalPage";
import { BUSINESS } from "@/lib/business";

export const metadata: Metadata = { title: "Terms & Conditions | KiiEden" };

const TOC: [string, string][] = [
  ["service", "What KiiEden is"],
  ["eligibility", "Who can use it"],
  ["wallets", "Wallets and transactions"],
  ["creators", "Creators and uploaded content"],
  ["minting", "Minting, whitelists and reveals"],
  ["trading", "Trading, offers and fees"],
  ["rwa", "Real-world assets: risk disclosures"],
  ["prohibited", "Prohibited use"],
  ["disclaimers", "Disclaimers and liability"],
  ["changes", "Changes, law and contact"],
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms & Conditions"
      intro="These terms govern your use of the KiiEden website and the smart contracts it connects to. By connecting a wallet, uploading content or sending a transaction you agree to them. If you do not agree, do not use the service."
      toc={TOC}
    >
      <Section id="service" title="What KiiEden is">
        <p>
          KiiEden is a non-custodial interface to smart contracts on KiiChain. It lets creators launch NFT collections, lets people mint and trade them, and lists tokenized units of real-world assets. We do not hold your keys, we do not hold your assets, and we cannot reverse, cancel or recover a blockchain transaction.
        </p>
        <p>
          The website has no user accounts. Your wallet address is the only identifier. The smart contracts, not us, hold offer escrow and mint revenue until it is withdrawn by the person entitled to it. Unless we publish an independent audit report, assume the contracts are unaudited, and use them only with amounts you can afford to lose.
        </p>
      </Section>

      <Section id="eligibility" title="Who can use it">
        <ul>
          <li>You must be at least 18 years old and able to enter a binding contract.</li>
          <li>You must not be a person or entity subject to sanctions, and you must not use the service if it is unlawful where you live or where you are located.</li>
          <li>Some features, in particular real-world assets, may be restricted or prohibited in your country. It is your responsibility to check, and to pay any taxes that apply to you.</li>
        </ul>
      </Section>

      <Section id="wallets" title="Wallets and transactions">
        <p>
          You are responsible for your wallet, keys and recovery phrase. Every transaction is public, final and irreversible once confirmed. Network (gas) fees are paid to the network, not to us, and are not refundable. Always check the amount and the contract shown by your wallet before you confirm.
        </p>
      </Section>

      <Section id="creators" title="Creators and uploaded content">
        <ul>
          <li>You may only upload content you own or have permission to use and sell. You must not upload content that infringes copyright, trademark, privacy or other rights.</li>
          <li>Files you upload are stored on IPFS and are public. IPFS is content-addressed: once published, content cannot be deleted or edited by us or by you, and other people may keep copies. Links and metadata written to the blockchain are permanent.</li>
          <li>If you list wallet addresses in a whitelist, the list is published on IPFS. Include only wallets whose owners agreed to be listed.</li>
          <li>You are responsible for the rights you grant buyers, and for any tax, consumer-law or securities-law obligations that arise from your collection.</li>
          <li>We may remove a collection or asset from this website (not from the blockchain) that we reasonably believe breaks these terms or the law. If you believe your work has been copied, contact us at the address below with the details.</li>
          <li>Creator royalties are paid on sales made through the KiiEden marketplace. Other marketplaces may not honour them.</li>
        </ul>
      </Section>

      <Section id="minting" title="Minting, whitelists and reveals">
        <ul>
          <li>Each collection has its own schedule set by its creator. Mint payments go to the collection contract for the creator, and are final once confirmed (see the <Link href="/refund">Refund Policy</Link>).</li>
          <li>Until the mint ends, sells out, or the creator ends it, the tokens cannot be transferred between wallets and cannot be traded on KiiEden.</li>
          <li>A whitelist restricts minting to listed wallets during the creator&apos;s window. A reveal shows a placeholder image until the creator&apos;s reveal time. The address of the real metadata is stored on the blockchain, so a reveal is a display feature, not a guarantee of secrecy.</li>
          <li>We do not verify creators or their claims about a collection, its rarity, its roadmap or its future value.</li>
        </ul>
      </Section>

      <Section id="trading" title="Trading, offers and fees">
        <ul>
          <li><strong>Listings.</strong> Listing an NFT does not move it out of your wallet. It is transferred only when a buyer pays your price, or when you accept an offer.</li>
          <li><strong>Offers and escrow.</strong> An offer places its full amount in escrow in the marketplace contract. You can cancel and receive it back at any time. An owner can accept an active offer at any time.</li>
          <li><strong>Fees.</strong> At the time of writing: a flat creation fee (paid in KII when a collection is created and shown by your wallet before you confirm, set by the operator within an on-chain maximum); a marketplace fee of 2.5% of each NFT sale; a fee of 1.5% on peer-to-peer real-world-asset orders; and on the real-world-asset trading pool, 0.30% to liquidity providers plus 0.20% to the operator. The operator can change these within maximums fixed in the contracts (5% for the marketplaces, 1% for the pool fee, 50 KII for the creation fee). Changes apply to later transactions only.</li>
          <li>Prices are set by users and by an automated formula, not by us. Past prices do not predict future prices.</li>
        </ul>
      </Section>

      <Section id="rwa" title="Real-world assets: risk disclosures">
        <p>
          Real-world asset (RWA) units on KiiEden represent whatever rights the asset&apos;s documents describe. Read those documents before you buy. In particular:
        </p>
        <ul>
          <li><strong>Not an offer by us, not advice.</strong> Assets are listed by the platform administrator. A listing is not an endorsement, valuation, credit rating or guarantee, and we do not promise any return, yield, rent, resale value or liquidity. Yield figures shown are provided by the issuer and are not guaranteed.</li>
          <li><strong>Regulation.</strong> Tokenized interests in real-world assets may be regulated as securities or investment products in your country, and may be unavailable to you. You are responsible for checking whether you are allowed to buy, hold or sell them.</li>
          <li><strong>Legal ownership.</strong> Your rights depend on off-chain documents and on the issuer and custodian named on the asset page. Holding units on the blockchain may not, on its own, give you legal title to the property.</li>
          <li><strong>Price and liquidity.</strong> After the IPO, units trade on an automated pool. The price moves with buying and selling and can fall sharply. There may be no buyer at a price you want, and large trades move the price against you. Liquidity providers can lose value compared with simply holding the units.</li>
          <li><strong>Subscriptions are final.</strong> There is no cooling-off period or automatic refund for IPO contributions on the blockchain, and an IPO that raises less than its target is not refunded.</li>
          <li><strong>Technology.</strong> Smart contracts can contain bugs. A loss caused by a bug, an exploit, or a mistake in a transaction may be permanent.</li>
        </ul>
        <p>Discussion posts on asset pages are written by other users, are public and permanent, and are not advice or endorsement.</p>
      </Section>

      <Section id="prohibited" title="Prohibited use">
        <p>You must not use KiiEden to break the law, to launder money, to evade sanctions, to sell counterfeit or stolen goods, to upload illegal content (including content that sexually exploits minors), to harass others in discussions, to manipulate markets, or to attack or attempt to disrupt the website or the contracts.</p>
      </Section>

      <Section id="disclaimers" title="Disclaimers and liability">
        <p>
          The service is provided &quot;as is&quot; and &quot;as available&quot;. To the extent permitted by law we exclude warranties of any kind, and we are not liable for losses caused by your wallet, the network, third-party services (RPC providers, IPFS gateways and pinning services), market movements, smart-contract bugs, or content created by users.
        </p>
        <p>
          Nothing in these terms excludes or limits liability that cannot be excluded or limited by law, including liability for death or personal injury caused by negligence, for fraud, or your statutory consumer rights where they apply to you.
        </p>
      </Section>

      <Section id="changes" title="Changes, law and contact">
        <p>
          We may update these terms; the date at the top shows the latest version, and changes apply to use after that date. These terms are governed by the laws of {BUSINESS.jurisdiction || "the country of the operator (to be set)"}, without affecting any mandatory consumer protections in the country where you live.
        </p>
        <p>
          Questions, complaints and copyright notices:{" "}
          {BUSINESS.contactEmail ? <a href={`mailto:${BUSINESS.contactEmail}`}>{BUSINESS.contactEmail}</a> : "the operator's contact address (to be set)"}. See also our <Link href="/privacy">Privacy Policy</Link>, <Link href="/cookies">Cookies Policy</Link> and <Link href="/refund">Refund Policy</Link>.
        </p>
      </Section>
    </LegalPage>
  );
}
