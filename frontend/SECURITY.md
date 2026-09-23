# Security notes

## Reporting a problem
Email the security contact in `frontend/.env.local` (`NEXT_PUBLIC_BUSINESS_EMAIL`) with steps to reproduce.
Please do not open a public issue for anything that could let someone drain funds.

## What is, and isn't, in this repository's threat model
KiiEden has no backend and no database. The attack surface is: (1) the smart contracts, (2) this
Next.js frontend and the third-party services it calls (RPC, IPFS, Pinata, WalletConnect), and
(3) whatever you deploy it on (Vercel).

## If you ever find a secret in git history
1. **Rotate the credential immediately** — a private key, JWT or API key that was ever committed
   must be treated as compromised, even if you remove it from history. Generate a new one and
   revoke the old one at its source (wallet, Pinata dashboard, WalletConnect Cloud, host).
2. Only after rotating, clean the history if you want to (e.g. `git filter-repo` or BFG Repo-Cleaner),
   force-push, and have every collaborator re-clone.
3. Re-run `cd frontend && npm run check:secrets` until it passes.

## Automated checks
- `npm run check:secrets` — scans the working tree and (if run inside a git repo) the full commit
  history for private keys, API keys, JWTs, mnemonics, and tracked `.env` files.
- `npm run check:compliance` — business details configured, no trackers/embeds, alt text, labels,
  legal pages linked, image attributions recorded.
- `npm run check:links` — every internal `href`/`Link` in the app resolves to a real route.
- `npm run typecheck` — `tsc --noEmit`.
- `npm run check:all` runs all four. `npm run build:prod` runs secrets + compliance, then `next build`.

## Where secrets live, and where they must never live
- **Deployer private key** (`contracts/.env`, `DEPLOYER_PRIVATE_KEY`): used only by Hardhat, from
  your machine, to deploy contracts. It is never read by the frontend and never becomes a
  `NEXT_PUBLIC_*` variable. Fund this wallet with only what a deployment needs.
- **Pinata JWT**: typed in by each creator, in their own browser, stored in `sessionStorage` (and
  in `localStorage` only if they opt in via the cookie banner). It is never sent to our servers —
  we have none — only to `api.pinata.cloud`. It is never an env var and never in the repo.
- **Anything with `NEXT_PUBLIC_` is public.** Next.js inlines these into the JavaScript shipped to
  every visitor's browser. Only put values here that are safe for anyone to read (contract
  addresses, RPC URLs, business contact details). `check:secrets` fails the build if a
  `NEXT_PUBLIC_*` name looks like a secret.
- Vercel: set real values as **Environment Variables** in the project settings (Production /
  Preview / Development), never commit `.env.local`.

## Application-layer defences already in the code
- **XSS**: React escapes everything it renders (no `dangerouslySetInnerHTML` anywhere in the app).
  A strict, per-request nonce-based `Content-Security-Policy` (see `middleware.ts`, `lib/csp.ts`)
  blocks any script that isn't explicitly allowed, as defence in depth. All user/IPFS-derived
  links go through `lib/sanitize.ts#safeHref`, which allows only `http(s)` and rejects
  `javascript:`, `data:` and URLs with embedded credentials.
- **Input sanitising**: names, descriptions, attributes and CSV/JSON/XML-imported text are cleaned
  in `lib/sanitize.ts` before being written to IPFS (control characters, bidi-override tricks and
  excess whitespace stripped; length-capped) — this is data written permanently and read by other
  apps, so it gets extra care beyond React's escaping.
- **Rate limiting**: `middleware.ts` + `lib/rateLimit.ts` throttle page requests per client IP.
  This is a serverless-instance-local best effort, not a hard guarantee — for real protection,
  add a rule in Vercel's Firewall (Project → Firewall → Rate Limiting) in front of it.
- **Headers**: HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy`, a locked-down `Permissions-Policy`, and CSP (see `next.config.js` +
  `middleware.ts`).
- **Access control**: the RWA-creation UI is hidden from non-admins, but the real access control
  is the `onlyAdmin` modifier in `RWAFactory.sol` — the UI check is convenience, not security.
  Never rely on hiding a button as the only protection for a privileged action.
- **No traditional API/database to protect.** Every "backend" action (minting, listing, offers,
  RWA trading) is a direct, wallet-signed call to the smart contracts. There is nothing else to
  authenticate, since the blockchain itself enforces who can do what (see each contract's
  `onlyOwner` / `onlyAdmin` / `onlyOwnerOrFactory` modifiers).

## What you still need to do
- Get the smart contracts audited before mainnet (see `README.md`).
- Turn `CSP_MODE=enforce` on only after checking the browser console for violations on every page
  of a preview deployment (some wallet extensions inject their own scripts, which is normal).
- Configure a rate-limit rule at the edge (Vercel Firewall) for anything you consider abuse-prone.
- Rotate `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` if it is ever shared outside your team (it is
  public by nature, but scoped to your project's usage limits).
