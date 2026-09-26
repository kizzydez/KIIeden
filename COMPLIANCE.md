# Production compliance checklist

This file separates what the code now does, what the automated check verifies, and what only you (and a lawyer) can do.
Run `cd frontend && npm run check:compliance` at any time.

## Done in the code

| Item | What was done |
|---|---|
| Colour contrast (WCAG 2.1 AA) | Every text/background pair in the palette was calculated (see below). Failing greys (`zinc-500/600`, hint, placeholder, eyebrow) and the light end of the primary button gradient were darkened or lightened until all text is 4.5:1 or better. Text is never dimmed with opacity. |
| Alt text | Every `<img>` has an `alt`: descriptive for artwork, banners, previews and RWA photos; empty only for purely decorative images (logo beside the text "KiiEden", hero art). Checked by script. |
| Accessibility | Skip-to-content link; `<main id="main">`; visible focus outline on everything; every form control has a programmatic label (or `aria-label`); drop zones are named and keyboard operable; `aria-pressed` on toggle buttons; live regions for toasts and chat; tables have captions and header cells; countdown and progress bars have text/`role="progressbar"`; reduced-motion respected. An automated DOM audit over 30 rendered pages found no unlabeled controls, missing alts, unnamed buttons, duplicate ids, heading jumps or unsafe `target="_blank"` links. |
| Keyboard-accessible forms | All forms use native inputs/buttons; checkboxes are real checkboxes with labels; hover-only controls also appear on keyboard focus. |
| Clear button labels | Generic labels replaced ("Update" -> "Update price", "List" -> "List for sale"; icon-only buttons have descriptive names). |
| Legal pages | `/terms`, `/privacy`, `/cookies`, `/refund`, linked from the footer, written to describe what this app actually does (wallet-only, IPFS, no analytics, third parties listed). RWA risk disclosures are at `/terms#rwa`. |
| Cookie consent | Banner with equal-weight "Allow optional storage" / "Necessary only", reopenable from the footer. It controls the one optional item (remembering the Pinata key on the device; otherwise session-only). Withdrawing consent removes the stored key. |
| Form consent | Un-ticked required checkboxes before any launch (rights to the content + public/permanent data), before trading RWA units (risk acknowledgement), and before posting in a discussion. Wallet lists get a specific warning. |
| Only necessary data | No accounts, no email, no analytics, no server database. Nothing is collected beyond what a wallet transaction and IPFS upload require. |
| Tracking scripts / 3rd-party embeds | None. Fonts are self-hosted at build time. The script scans the source and dependencies for trackers, iframes and external `<script src>`. |
| Fake reviews / misleading claims | No reviews, ratings or testimonials existed (checked). Reworded: "verified real-world assets" -> "real-world assets" (listing is not an endorsement); "royalties enforced on-chain" -> paid on KiiEden sales, other marketplaces may not honour them; "fully on-chain" -> media stored on IPFS; yield labelled an issuer estimate, not guaranteed. |
| Image copyright | `public/ATTRIBUTIONS.md` records the source of every shipped image and the script fails if one is missing. User uploads require the creator's rights confirmation. |
| Security headers | `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, no `X-Powered-By`. |

## What you must do before launch (I cannot do these)

1. **Business details.** Set the `NEXT_PUBLIC_BUSINESS_*` variables in `frontend/.env.local` with the real legal entity (name, registered address, registration number, governing jurisdiction, contact email). Nothing was invented; the footer and every legal page show a warning until it is set, and `check:compliance` fails.
2. **Have a lawyer review the four legal pages** for your jurisdiction and business model, then update `LEGAL_LAST_UPDATED` in `lib/business.ts`. They are accurate about the software, but they are not legal advice and are not a substitute for review.
3. **Confirm the logo rights** (`public/ATTRIBUTIONS.md` says to confirm) - I cannot verify who owns the K logo.
4. **Compliance with local laws** cannot be established by code. Get advice on at least:
   - **Securities / investment law for RWA units.** Fractional interests in real-world assets are regulated as securities in many countries. You may need licences, prospectuses, investor eligibility checks or to geo-block.
   - **KYC / AML / sanctions screening** if you are, or are treated as, a virtual-asset service provider (e.g. under MiCA, the EU AML rules, FinCEN, FATF travel rule).
   - **Consumer law** (withdrawal rights for digital content, refund rules, unfair terms), **data protection** (GDPR / UK GDPR / CCPA: hosting provider agreement, records of processing, whether you need a representative or DPO), **tax** (VAT on the fees, reporting), **age restrictions**.
   - **Notice-and-takedown** process for copyright claims (the Terms give an email route; you need someone to act on it).
5. **Third-party services**: check the terms and privacy of your RPC provider, IPFS gateways, Pinata and hosting provider, and keep the Privacy Policy list in sync if you change any.
6. **Audit the smart contracts** and update the Terms sentence about audits when a report exists.
7. **Content-Security-Policy**: not set on purpose (wallet libraries need several origins). Add and test one on your final host.
8. **Wallet-list (whitelist) data** is public on IPFS. If you operate as a data controller for creators' lists you need a lawful basis; the creator confirmation is a start, not a substitute.

## Contrast results (calculated, dark theme)

Worst-case background is the lightest glass surface (#1b142e).

| Text | Colour | Ratio |
|---|---|---|
| Body / headings | #ffffff, zinc-300 | 12 - 18 : 1 |
| Secondary text | zinc-400 (#a1a1aa) | 6.9 : 1 |
| Hints / labels | #b3a9cf / #b9afd4 | 8.0 : 1 |
| Eyebrow captions | #a79dc4 | 6.9 : 1 |
| Placeholders | #9a91b5 | 6.0 : 1 |
| Links / accents | accent-300 / 400 | 10.2 / 6.9 : 1 |
| White on primary button | gradient #6a1fe0 -> #8a3ff5 | 7.3 -> 5.1 : 1 |
| Status colours | rose-300, emerald-300, amber-300 | 9.4 - 12.3 : 1 |

Removed (failed): zinc-500 (3.7), zinc-600 (2.3), old hint (4.0), old placeholder (3.2), white on #9b5cff / #b58cff (3.9 / 2.6).
A full-page computed-style test (e.g. axe / Lighthouse) in a real browser is still recommended after `npm run build`.
