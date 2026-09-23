import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { Section } from "@/components/LegalPage";
import { BUSINESS } from "@/lib/business";

export const metadata: Metadata = { title: "Privacy Policy | KiiEden" };

const TOC: [string, string][] = [
  ["summary", "The short version"],
  ["data", "What data is involved"],
  ["thirdparties", "Third parties that receive data"],
  ["blockchain", "Public and permanent data"],
  ["basis", "Why we process data"],
  ["retention", "How long data is kept"],
  ["rights", "Your rights"],
  ["children", "Children"],
  ["contact", "Contact and complaints"],
];

export default function PrivacyPage() {
  const mail = BUSINESS.privacyEmail;
  return (
    <LegalPage
      title="Privacy Policy"
      intro="KiiEden is built to need as little personal data as possible. This policy explains exactly what is processed, by whom, and what your choices are."
      toc={TOC}
    >
      <Section id="summary" title="The short version">
        <ul>
          <li>No accounts, no email sign-up, no passwords, no analytics, no advertising and no tracking scripts.</li>
          <li>We do not run a database of users. The website is a static interface; what you do is done by your wallet talking to the blockchain.</li>
          <li>Anything you write to the blockchain or IPFS is public and cannot be erased, by design.</li>
        </ul>
      </Section>

      <Section id="data" title="What data is involved">
        <ul>
          <li><strong>Your wallet address.</strong> Read from your wallet when you connect, used in your browser to show your NFTs, offers and balances. We do not store it on a server.</li>
          <li><strong>Technical data.</strong> Like any website, our hosting provider receives your IP address, browser type, and the pages requested in standard server logs. We use this only to deliver and secure the site.</li>
          <li><strong>Content you upload.</strong> Images, names, descriptions, attributes, links and documents you choose to publish, and any whitelist of wallet addresses. These are sent to your pinning provider (Pinata) and published on IPFS.</li>
          <li><strong>Messages you post</strong> in an asset discussion, which are written to the blockchain together with your wallet address.</li>
          <li><strong>Stored in your browser only:</strong> your privacy choice, the wallet connection kept by your wallet library, and, if you type it in, your Pinata key (for the tab, or on this device only if you allow optional storage). See the <Link href="/cookies">Cookies Policy</Link>.</li>
        </ul>
        <p>We do not ask for your name, email, phone number, ID or location, and we do not build profiles.</p>
      </Section>

      <Section id="thirdparties" title="Third parties that receive data">
        <p>Using the site causes your browser to contact these services directly. They see your IP address and what is requested, and have their own privacy policies:</p>
        <ul>
          <li><strong>KiiChain RPC node providers</strong>, to read blockchain data and submit your transactions.</li>
          <li><strong>Public IPFS gateways</strong> (by default ipfs.io, dweb.link and gateway.pinata.cloud), to load NFT images and metadata.</li>
          <li><strong>Pinata</strong>, only when you upload: it receives your files and your API key.</li>
          <li><strong>WalletConnect</strong>, only if you connect with a mobile wallet through it.</li>
          <li><strong>Our hosting provider</strong>, which serves the website.</li>
        </ul>
        <p>Fonts are served from our own site (downloaded at build time), not from a font provider at runtime. We embed no third-party widgets, frames or social plug-ins.</p>
        <p>These providers may be located outside your country. We do not sell personal data or share it for advertising.</p>
      </Section>

      <Section id="blockchain" title="Public and permanent data">
        <p>
          Blockchain transactions, NFT metadata addresses, whitelists and discussion messages are public and permanent. Because nobody can alter a blockchain, we cannot erase this data or make a wallet address anonymous once it has been linked to you. Do not publish personal data on IPFS or in discussions. Our rights below apply to data we control; they cannot be exercised against the blockchain itself.
        </p>
      </Section>

      <Section id="basis" title="Why we process data">
        <ul>
          <li>To deliver the service you ask for (reading and writing your transactions), which is necessary to perform our contract with you.</li>
          <li>To keep the site secure and working (server logs): our legitimate interest.</li>
          <li>To remember your upload key on your device, if you allow it: your consent, which you can withdraw at any time from &quot;Cookie settings&quot; in the footer.</li>
          <li>To meet legal obligations, for example responding to lawful requests.</li>
        </ul>
      </Section>

      <Section id="retention" title="How long data is kept">
        <p>Server logs are kept by the hosting provider for a short period set in their terms. Browser storage stays until you clear it or change your choice. Public blockchain and IPFS data is permanent.</p>
      </Section>

      <Section id="rights" title="Your rights">
        <p>
          Depending on where you live (for example under the GDPR, UK GDPR or CCPA) you may have the right to access, correct, delete, restrict or object to the processing of your personal data, to data portability, to withdraw consent, and to complain to your data protection authority. To use these rights for data we control, contact{" "}
          {mail ? <a href={`mailto:${mail}`}>{mail}</a> : "the operator's privacy contact (to be set)"}. We will not discriminate against you for using them.
        </p>
      </Section>

      <Section id="children" title="Children">
        <p>KiiEden is for adults (18+). We do not knowingly collect data from children. Contact us if you believe a child has used the service.</p>
      </Section>

      <Section id="contact" title="Contact and complaints">
        <p>
          For anything about privacy, write to {mail ? <a href={`mailto:${mail}`}>{mail}</a> : "the operator's privacy contact (to be set)"}. You also have the right to complain to your local data protection authority. This policy may change; the date at the top shows the current version.
        </p>
      </Section>
    </LegalPage>
  );
}
