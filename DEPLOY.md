# Deploying KiiEden: KiiChain testnet + Vercel

Follow this in order. Each step says how to check it worked.

## 1. Deploy the contracts to KiiChain Testnet (Oro)

```bash
cd contracts
cp .env.example .env
# edit .env: DEPLOYER_PRIVATE_KEY = a funded testnet wallet's key (0x..., or without 0x)
npm install
npx hardhat test          # must pass before you deploy anything
npm run deploy:testnet
```
This writes every contract address into `frontend/.env.local` automatically (`NEXT_PUBLIC_*`), so
there's nothing to copy by hand. It also writes `contracts/deployments/1336.json` as a record.

**Verify:** open `frontend/.env.local` and check `NEXT_PUBLIC_FACTORY_ADDRESS` etc. are filled in
(not the placeholder zero address), and that `contracts/deployments/1336.json` exists.

## 2. Run the frontend locally against the testnet deployment

```bash
cd ../frontend
npm install
npm run check:all      # secrets, compliance, links, types — fix anything it reports
npm run dev
```
Open http://localhost:3000. Connect a wallet on KiiChain Testnet, create a test collection, mint,
list, make an offer — walk through the flows once before deploying anywhere public.

**Business details are required before a real deployment**: fill in the `NEXT_PUBLIC_BUSINESS_*`
variables in `frontend/.env.local` (see `.env.example`) with the real operator's details, or
`npm run check:compliance` (and `build:prod`) will fail on purpose.

## 3. Push to a git repository

```bash
cd ..                     # repo root (contains contracts/ and frontend/)
git init                  # if not already a repo
git add -A
git status                # confirm NOTHING under .env / .env.local is listed — .gitignore blocks it
cd frontend && node scripts/scan-secrets.mjs && cd ..   # must exit 0
git commit -m "KiiEden: production-ready testnet build"
git remote add origin <your-repo-url>
git push -u origin main
```

## 4. Deploy the frontend to Vercel

The repository root contains both `contracts/` and `frontend/`; Vercel only builds `frontend/`.

1. **Import the repo** at vercel.com → New Project → select this repository.
2. **Root Directory**: set to `frontend`.
3. **Framework Preset**: Next.js (auto-detected).
4. **Build Command**: `npm run build:prod` (runs the secret/compliance checks first, then `next build`; fails the deploy instead of shipping a broken/unconfigured build).
5. **Environment Variables** — add every `NEXT_PUBLIC_*` from `frontend/.env.local` (the addresses from step 1, `NEXT_PUBLIC_CHAIN_ID=1336`, the RPC URLs, your `NEXT_PUBLIC_BUSINESS_*` details, and `NEXT_PUBLIC_SITE_URL` set to the Vercel URL you'll get, e.g. `https://kiieden.vercel.app`). Also add `CSP_MODE=report-only` for the first deploy.
   - Get a free `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` at https://cloud.walletconnect.com if you want mobile-wallet QR login (optional — MetaMask and other browser wallets work without it).
6. **Deploy.**

**Verify:** open the deployed URL. Check:
- The testnet banner shows at the top.
- DevTools → Console: no CSP errors that block anything real (report-only mode only *logs*, so the site should work either way — you're checking whether it *would* break something once enforced).
- DevTools → Network → click any request → Headers: confirm `Content-Security-Policy-Report-Only`, `Strict-Transport-Security`, `X-Frame-Options` etc. are present.
- `npm run check:links` locally still passes against the same commit.

## 5. Turn CSP from report-only to enforced

After a few days with no unexpected console CSP errors on every page (home, explore, create,
mint, an NFT page, an RWA page, profile), change the Vercel env var:
```
CSP_MODE=enforce
```
Redeploy, then click through the app once more end-to-end to confirm nothing broke.

## 6. Custom domain (optional)

Vercel → Project → Settings → Domains → add your domain, follow its DNS instructions, then update
`NEXT_PUBLIC_SITE_URL` to the final domain and redeploy (this feeds `sitemap.xml`, `robots.txt` and
social-preview metadata).

## Going to mainnet later

1. Get the contracts audited. Do not skip this — the marketplace holds escrow and is an approved
   operator on every collection.
2. `cd contracts && TREASURY_ADDRESS=<multisig> CONFIRM_MAINNET=yes npm run deploy:mainnet`.
3. Transfer ownership of every contract to your multisig (the deploy script prints the exact steps).
4. New Vercel **Production** environment variables: the mainnet addresses,
   `NEXT_PUBLIC_CHAIN_ID=1783`, verified mainnet RPC and explorer URLs (see the README's honest-limits
   section), `CSP_MODE=enforce` from the start (you already validated it on testnet).
5. Keep the testnet deployment around as a Preview/staging environment for testing future changes.

## Rollback

Vercel keeps every deployment. Project → Deployments → find the last good one → "Promote to
Production". The smart contracts themselves cannot be rolled back once deployed — that's why step 1
starts with `npx hardhat test`, and why an audit matters before mainnet.
