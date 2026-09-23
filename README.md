# KiiEden - NFT + RWA marketplace on KiiChain

Wallet-only, no database. Contracts in `contracts/` (Hardhat), app in `frontend/` (Next.js 14, wagmi/viem, RainbowKit, Tailwind).

## Run it

```bash
cd contracts
cp .env.example .env            # set DEPLOYER_PRIVATE_KEY (funded testnet wallet)
npm install
npx hardhat test                # run this first
npm run deploy:testnet          # writes every address into ../frontend/.env.local

cd ../frontend
npm install
npm run dev                     # restart it after every deploy (env vars are read at start)
```
**These contracts are new (constructor and function changes), so redeploy; old addresses will not work.**
Add a Pinata JWT on the create pages (stored only in your browser).

## Product flow

**Create -> mint link -> mint -> trade**
1. Creator uploads the art (single NFT or a collection of any size, plus attributes file and a banner) and sets mint price, per-wallet limit and mint start/end. One transaction creates the collection; nothing is minted up front.
2. The creator gets a **minting link** (`/mint/<collection>`). Followers mint from it while the mint is open. Mint revenue is withdrawn by the creator.
3. The mint ends at the end time, when it sells out, or when the creator ends it. **Only then** can the collection be traded. This is enforced in the NFT contract itself (transfers between wallets revert until then) and again in the marketplace.
4. After the mint: **list, buy, make offers, Sell Now**.

**No approval step.** KiiEden collections report the marketplace as an approved operator, so listing is one transaction and the NFT stays in the owner's wallet. The marketplace can only move a token inside a listing or offer that its current owner created or accepted.

**Offers + escrow.** Anyone who does not own the NFT can make an offer; the amount is deposited into escrow in the same transaction. The highest active offer is the Sell Now price; the owner clicks Sell Now and the NFT goes to the bidder while the seller is paid from escrow instantly. Bidders can cancel any time for a full refund.

**RWA (admin creates, everyone trades).**
- Only admin wallets see or reach RWA creation (`RWAFactory.owner()` plus wallets added with `setAdmin`; enforced on-chain).
- IPO has a start time: Upcoming / New (first 3 days) / Ongoing, then Trading.
- After the IPO ends, units trade on a **demand-and-supply curve** (constant-product pool, `RWACurveMarket`): buys pump the price, sells dump it, candlestick chart from on-chain `Trade` events. Any unit holder can open the market by depositing units + KII (opening price must be 0.25x-4x of the IPO price); anyone can then add liquidity and earn 0.3%. Peer-to-peer limit orders still exist as a second option.
- RWA explore shows small preview images and filters: Upcoming IPO, New IPO, Ongoing IPO, Trading.

**Platform fee** (2 KII testnet, 1 KII mainnet, owner-adjustable up to 50 KII) is charged inside the create transaction. It is no longer displayed on any page.
Change it: `FEE_MANAGER_ADDRESS=0x... FEE_KII=50 npx hardhat run scripts/setFee.js --network kiiMainnet`.

## Latest round: production hardening + Vercel deploy

**Security**: nonce-based CSP (`middleware.ts`), security headers (HSTS, X-Frame-Options, Permissions-Policy...), per-client rate limiting, input sanitising for everything written to IPFS (`lib/sanitize.ts`), `safeHref` on every user/IPFS-derived link (blocks `javascript:`/`data:`), secrets kept out of the bundle (Pinata key never in an env var), removed the unused `solc` and dead `compile-check.js`. New checks: `npm run check:secrets` (scans working tree + git history), `npm run check:links`, `npm run check:compliance` (from before), `npm run check:all` / `build:prod`. See `SECURITY.md`.

**UI/UX**: dark/light theme toggle (purple+black stays default), sticky header, fixed mobile menu, FAQ (expandable), site search, custom 404 and error pages, real favicon/app icons + manifest, per-page titles and meta descriptions, sitemap.xml/robots.txt, confirmation dialogs before irreversible actions (end mint, reveal early, sell now, remove all liquidity), copy-to-clipboard on every address, floating help button, dynamic copyright year, clickable email/phone in the footer, testnet notice banner, loading and error boundaries, horizontal-scroll and touch-target fixes. No emojis (still).

**Deploy**: see `DEPLOY.md` for the exact KiiChain-testnet-then-Vercel steps.

## New in this round

- **Whitelist:** creator pastes or uploads wallet addresses, sets a whitelist window (and optionally a separate price). The list is published on IPFS; only its Merkle root is stored on-chain, and `whitelistMint` accepts only wallets that can prove they are on it. The public mint opens after the window.
- **Reveal:** creator sets an exact reveal date and time; until then `tokenURI` returns one placeholder for every token (a default image is used if none is uploaded); afterwards the real metadata. The creator can also reveal early. The real metadata folder address is stored on-chain, so this is a display-level reveal, not a cryptographic secret.
- **Home page:** three Trending boxes (NFTs, collections, RWA) computed from on-chain events.
- **RWA page:** asset information on the left; on the right the trading panel, market data (current price, market cap, total in circulation, all-time high/low, 24h high/low), order book (curve depth plus peer-to-peer sell orders), liquidity and an on-chain discussion (`RWAChat`: unit holders only, 280 bytes, cooldown, moderator hide).
- **Compliance:** see `COMPLIANCE.md` (what is done, what the automated check verifies, what you must do). `cd frontend && npm run check:compliance`.

## Contracts

| Contract | Role |
|---|---|
| `FeeManager` | flat KII creation fee, hard ceiling 50 KII |
| `CollectionFactory` | `createCollection(...)` with mint schedule/price/limit |
| `NFTCollection` | ERC-721 + royalties, public mint, mint-first transfer lock, `contractURI` |
| `Marketplace` | listings, offers with escrow, Sell Now, royalties (pull payments) |
| `RWAFactory` / `RWAAsset` | admin-only RWA listing, IPO with start time |
| `RWACurveMarket` | RWA demand/supply curve trading + liquidity |
| `RWAUnitMarketplace` | peer-to-peer RWA orders |
| `RWAChat` | on-chain discussion per RWA asset |

## Honest limits

- **I cannot compile Solidity or run npm in my sandbox.** The previous round's contracts compiled and 61 of 67 tests passed on your machine (the other 6 were a test-funding issue, since fixed). The new whitelist, reveal and chat contracts and their tests (84 in total) have NOT been run: run `npx hardhat test` first and send me any compile or test error.
- The frontend was type-checked against stub types and server-rendered with mocks, not built against the real packages.
- Not audited. The marketplace holds offer escrow and is a universal operator on every collection, so an audit is essential before mainnet.
- The curve market needs a first liquidity provider (a unit holder) to open it; until then only peer-to-peer orders work.
- IPO raises have no refund / soft cap. Yield distribution to RWA holders is off-chain.
- Mainnet RPC default (third-party) and explorer URLs are unverified.
- Still not built: auctions, ERC-1155, T-REX/ERC-3643 compliance, subgraph.
