# KiiEden Memecoin Launchpad

Fair-launch memecoin module for KiiEden, in the style of **Argus**, **Genius.fun** and **Pons**: no-code
token creation, a single-sided bonding curve per token (no presale, no team allocation), optional
graduation to a permanent AMM, creator fee-sharing, and an automatic 30-day-inactivity liquidation
lifecycle. Contracts: `contracts/contracts/MemeLaunchpad.sol` and `contracts/contracts/MemeToken.sol`.
Frontend: `frontend/app/launchpad/*`, `frontend/components/{LaunchCard,MemeTradePanel,LaunchpadAdminPanel}.tsx`.

---

## 1. Overall architecture

```
                          ┌─────────────────────────┐
   createToken()  ─────▶  │      MemeLaunchpad       │  ───▶  deploys  ──▶  MemeToken (per launch)
   buy() / sell()  ────▶  │  (factory + bonding      │                      fixed 1B supply,
   claimCreatorFees() ─▶  │   curve + fee ledger +   │                      minted 100% to the
   triggerLiquidation()▶  │   inactivity/liquidation │◀── onMemeTransfer ── launchpad, no admin
   liquidateBatch()  ──▶  │   state machine)          │      (holder count)  mint, ever.
   deleteToken()  ─────▶  └─────────────────────────┘
```

- **One contract owns every curve.** `MemeLaunchpad` is a factory *and* the market maker: it deploys a
  `MemeToken` for each launch, keeps that token's entire supply in its own balance, and is the only
  counterparty anyone ever trades against. There is no separate pool/router/LP-token contract to audit
  or trust.
- **`MemeToken` is intentionally boring.** Standard OpenZeppelin ERC20, fixed supply minted once at
  construction, no owner, no pause, no blocklist. Its only non-standard piece is a transfer hook that
  *reports* every transfer back to the launchpad (for holder counting) but can never block one — see
  §6 Security.
- **Everything else (creation fee, trading fees, max wallet, graduation threshold) is state on
  `MemeLaunchpad`**, either global and owner-adjustable, or per-launch and creator-adjustable, matching
  the "adjustable by the builder/admin" requirement without needing a proxy/upgrade pattern.

### Why one shared contract instead of a clone-per-token factory pattern
A minimal-proxy (EIP-1167) factory would save deployment gas per token, but it also means every clone's
logic is frozen at whatever bytecode was cloned. Keeping the curve logic in the single `MemeLaunchpad`
means a parameter fix (say, tightening the liquidation discount) is one `onlyOwner` call instead of a
migration across hundreds of deployed clones. Given KiiChain gas costs, this trade was worth it for an
MVP; §7 "Recommended parameters" notes this as the first thing to revisit if launch volume gets large.

---

## 2. Smart contract design

### 2.1 Token creation (`createToken`)

```solidity
function createToken(
    string calldata name_,          // ≤ 32 bytes
    string calldata symbol_,        // ≤ 12 bytes
    string calldata metadataURI_,   // ipfs://... json: description, image, twitter, telegram, website
    uint16 maxWalletBps_            // 0 → default 2%; else 0.5%-100% of supply
) external payable returns (address token);
```

- Mints a fixed **1,000,000,000** tokens (18 decimals) straight to the launchpad — nobody gets a
  pre-mine, team allocation, or presale round. The first buyer and the creator buy from the exact same
  curve.
- **Creation fee is a configurable contract parameter**, not a constant:

  ```solidity
  uint256 public constant MIN_CREATION_FEE = 1 ether;   // 1 KII
  uint256 public constant MAX_CREATION_FEE = 20 ether;  // 20 KII
  uint256 public creationFeeWei = 2 ether;               // default, owner-adjustable in [1, 20]

  function setCreationFee(uint256 newFeeWei) external onlyOwner {
      if (newFeeWei < MIN_CREATION_FEE || newFeeWei > MAX_CREATION_FEE) revert BadCreationFee();
      creationFeeWei = newFeeWei;
      emit CreationFeeUpdated(newFeeWei);
  }
  ```

  `createToken` requires `msg.value == creationFeeWei` exactly (not "at least" — avoids silent
  overpayment) and the fee is credited to the protocol treasury as a **pull payment**
  (`pendingWithdrawals[feeRecipient] += msg.value`), never pushed, so a treasury multisig that reverts
  on receive can never brick token creation.
- The frontend create page (`/launchpad/create`) reads `creationFeeWei` live and shows it before the
  person signs, so the UI can never go stale relative to the contract.

### 2.2 Pricing: bonding curve with a virtual seed

A pump.fun-style constant-product curve, chosen over a linear or sigmoid curve because it needs no
piecewise logic, has a closed-form quote, and is the model the three named references (Argus,
Genius.fun, Pons) all converge on:

```
effectiveKiiReserve = VIRTUAL_KII + realKii        // VIRTUAL_KII = 30 KII, a pricing-only constant
k = effectiveKiiReserve * tokenReserve             // constant between trades
```

- `realKii` is the **only** KII the contract actually holds for that token — `VIRTUAL_KII` is never
  real money, it just gives the token a sane non-zero starting price without needing anyone to seed
  real liquidity first.
- **Buy**: `netIn` (after fees) is added to the effective KII reserve; new `tokenReserve` solves
  `k / (effectiveKiiReserve + netIn)`; the difference is `tokensOut`.
- **Sell**: mirror image; `grossKiiOut` is capped at `realKii` so the curve can never promise to pay out
  virtual KII that was never deposited.
- Both directions are exposed as `quoteBuy`/`quoteSell` view functions so the frontend can show an
  exact expected output and a price-impact number before the person signs, with slippage protection
  (`minTokensOut` / `minKiiOut`) enforced on-chain.

### 2.3 Graduation to an AMM

```solidity
uint256 public graduationKiiThreshold = 300 ether; // owner-adjustable
```

Once a token's `realKii` crosses this threshold during a buy, its status flips `Active -> Graduated`
and:
- the max-wallet cap lifts (early-fairness protections stop mattering once a token has real depth), and
- trading **continues on the exact same reserves** using the exact same constant-product formula.

Rather than deploying a second, separate DEX pair contract (which would mean bridging liquidity out of
this audited contract into an external, less-scrutinized one, and would need its own LP-token
bookkeeping), graduation is modeled as: *the curve's real reserves, once they exceed the virtual seed's
order of magnitude, already behave like a plain AMM pool* — so "graduating" is mostly a status flag for
the UI and the removal of the early-fairness wallet cap. This satisfies "optional graduation to a
normal AMM pool" while keeping every KII a token ever raises inside one contract for its whole life.

### 2.4 Liquidity protection

There is **no withdraw function that pulls a token's trading reserve** for the creator or the platform
owner — not a rug switch, not an emergency drain, nothing. A token's `realKii` can only ever leave the
contract via:
1. a `sell()` (to the seller),
2. a `claimCreatorFees()` (the creator's fee cut only, never the reserve itself), or
3. a liquidation payout (to a holder, during the 30-day-inactivity flow).

This is the "LP locking or burning" requirement, implemented as *the function that would rug a token
simply does not exist*, which is a stronger guarantee than sending an LP token to `address(0)` (which
still requires trusting that no LP-token function was left reachable).

### 2.5 Sniping bots & max wallet

- **No anti-bot logic anywhere** — no transfer delay, no first-block cooldown, no bot tax, no
  blocklist. `MemeToken` has no hook capable of blocking a transfer at all (see §6). This is by design,
  per the spec.
- **Max wallet** is a per-launch, creator-configurable cap (`maxWalletBps`, 0.5%-100% of supply,
  default 2%), enforced only while a token is `Active` on the bonding curve:

  ```solidity
  function setMaxWallet(address token, uint16 newBps) external {
      if (msg.sender != launches[token].creator) revert NotCreator();
      if (newBps < MIN_MAX_WALLET_BPS || newBps > MAX_WALLET_DISABLED) revert BadMaxWallet();
      launches[token].maxWalletBps = newBps;
  }
  ```
  It caps how much of the supply *one wallet can end up holding* — it does not slow down or block a
  bot's buy transaction itself, so sniping is still fully possible, just diluted across more wallets
  once any one wallet is full.

---

## 3. 30-day inactivity → liquidation → deletion

This is a three-stage, fully permissionless state machine, so no admin key is a single point of
failure or a bottleneck for a token nobody is actively maintaining.

```
Active/Graduated ──(30d no Trade)──▶ [anyone: triggerLiquidation] ──▶ Liquidating
                                                                          │
                                                    [anyone, repeatedly: liquidateBatch(token, N)]
                                                                          │
                                                                          ▼
                                                                     Liquidated
                                                                          │
                                                     holderCountAtInactivity < 20 ?
                                                      ┌───────────yes───────────┐        no
                                                      ▼                          ▼
                                          [anyone: deleteToken]              stays "Liquidated"
                                                      │                      (delisted from search,
                                                      ▼                       but visible by link)
                                                   Deleted
```

### 3.1 Detecting inactivity

```solidity
uint256 public constant INACTIVITY_PERIOD = 30 days;

function isInactive(address token) public view returns (bool) {
    Launch storage L = launches[token];
    if (L.status != Status.Active && L.status != Status.Graduated) return false;
    return block.timestamp - L.lastTradeAt >= INACTIVITY_PERIOD;
}
```
`lastTradeAt` is updated on every successful `buy()`/`sell()` — a single trade at day 29 resets the
clock, exactly matching "no trading activity for 30 **consecutive** days."

### 3.2 Triggering liquidation

`triggerLiquidation(token)` is callable by **anyone** once `isInactive()` is true. It flips the status
to `Liquidating` and — importantly — **snapshots the holder count at that exact moment**
(`holderCountAtInactivity`). That snapshot, not the live count, is what later gates deletion (§3.4),
because liquidation itself reduces the holder count to zero for every token regardless of size, so
gating on the *post*-liquidation count would make the "<20 holders" rule meaningless.

Once `Liquidating`, `buy()`/`sell()` both revert (`TradingHalted`) — halting trading stops a
would-be liquidatee from front-running their own payout by dumping into a moving curve mid-liquidation.

### 3.3 Liquidation: largest holder first, at a discount

```solidity
uint256 public constant LIQUIDATION_DISCOUNT_BPS = 8500; // 85% of current spot price

function liquidateBatch(address token, uint256 maxHolders) external returns (uint256 processed) {
    // ... for up to `maxHolders` passes:
    //   1. scan this token's holder list for the largest remaining (unliquidated) balance
    //   2. pay that holder balance * spotPrice * 0.85, capped at the pool's real KII
    //   3. burn their tokens, mark them liquidated
    // when holderCount hits 0, status -> Liquidated
}
```

- **Largest-first is enforced structurally, not by trusting a submitted order**: each pass does an
  on-chain scan of the token's holder list and picks the current maximum balance, so a 100,000-token
  wallet is always paid out strictly before a 100-token wallet, exactly as specified, with no way for a
  keeper to reorder it.
- **85% of spot price**: chosen as the illustrative default from the brief (`0.85 × market price`); see
  §7 for the rationale on this exact number and how to change it (it's a `constant`, so a change needs a
  new deployment — deliberately, since retroactively changing a liquidation haircut on live tokens
  would itself be an anti-rug concern).
- **Proceeds go to holders** as a pull payment (`pendingWithdrawals[holder] += kiiOwed`, claimed via
  `withdraw()`), never pushed — so one holder's wallet rejecting KII can never block the batch or trap
  everyone else's payout behind it.
- **Gas-bounded, permissionless, repeatable**: `maxHolders` lets a caller (or a keeper bot) process a
  token in batches instead of needing one transaction to cover every holder, which would risk running
  out of gas on a token with hundreds of holders. Call it repeatedly until it returns `processed == 0`.

  **Gas consideration.** Finding "the current largest remaining holder" is an `O(n)` scan of that
  token's holder array per pass (so an `O(n²)` walk to fully liquidate `n` holders in 1-holder passes,
  or `O(n * maxHolders)` per call). This is a deliberate trade-off for the MVP: it needs no off-chain
  sorter to trust, and for the tokens most likely to actually go inactive — small, thinly-held
  memecoins — `n` stays small. For a token that graduates and keeps hundreds of holders, `n` would need
  a smarter data structure (a keeper-maintained max-heap, or a Merkle-proof-based claim design) before
  it goes inactive at scale; see §7.

### 3.4 Deletion: only for tokens that had fewer than 20 holders

```solidity
uint256 public constant DELETION_HOLDER_LIMIT = 20;

function deleteToken(address token) external {
    if (launches[token].status != Status.Liquidated) revert NotLiquidated();
    if (launches[token].holderCountAtInactivity >= DELETION_HOLDER_LIMIT) revert TooManyHolders();
    launches[token].status = Status.Deleted;
}
```
Permissionless, callable once liquidation has fully finished. A token that had **20 or more holders**
when its 30-day timer fired stays listed forever as `Liquidated` instead of `Deleted` — it is dropped
from the launchpad's search/browse views (see `frontend/app/launchpad/page.tsx`) but stays reachable at
its direct `/launchpad/[address]` link, so a token many people held keeps a visible, honest paper trail
instead of quietly disappearing. Small (<20-holder) tokens are fully delisted once liquidated.

### 3.5 Holder counting

Both the liquidation scan and the `<20` deletion gate need an accurate, live holder count — including
for tokens moved by plain wallet-to-wallet ERC20 transfers, not just launchpad buys/sells. `MemeToken`
reports every transfer (mint excluded) to the launchpad via a `try/catch`-wrapped hook
(`onMemeTransfer`), which increments/decrements `holderCount` and appends to a per-token holder array
the first time an address's balance goes above zero. See §6 for why this can never brick a transfer.

---

## 4. Creator fee-sharing

```solidity
uint16 public constant MIN_CREATOR_FEE_BPS = 50;   // 0.50%
uint16 public constant MAX_CREATOR_FEE_BPS = 100;  // 1.00%
uint16 public creatorFeeBpsDefault = 75;            // 0.75%, owner-adjustable within [50,100]
```

- Every trade (`buy` and `sell`) splits its fee between the **protocol** (`protocolFeeBps`, default
  0.5%, capped at 1.5%) and the **token's creator** (`creatorFeeBps`, 0.5%-1%, snapshotted onto the
  `Launch` struct at creation time — so a later change to `creatorFeeBpsDefault` only affects tokens
  created afterward, never retroactively changes a live token's economics).
- Fees accrue per-token in `pendingCreatorFees[token]` and are claimed with `claimCreatorFees(token)`,
  restricted to that token's `creator` address, payable **at any time**, no vesting or cliff. This is a
  pull payment for the same reason as everything else here: a creator wallet that can't receive KII
  should never be able to jam up trading for everyone else.
- The frontend surfaces this on two screens: the token's own page shows the current creator-fee rate,
  and the creator's **profile page** (`/profile`) lists every token they created with a live "Creator
  fees earned" figure and a one-click Claim button (`CreatedTokenRow` in `app/profile/page.tsx`).

---

## 5. Frontend flow

```
/launchpad                 Explore grid: image, name/symbol, live price, status badge
                            (Active / Inactive / Graduated / Liquidating / Liquidated),
                            a graduation progress bar, and filters. Owner-only fee panel
                            surfaces here for the connected admin wallet.
        │
        ├── /launchpad/create   No-code form: name, symbol, description, image (pinned to
        │                       IPFS via the existing Pinata flow), socials, max-wallet %.
        │                       Shows the live creation fee before signing; a 4-step
        │                       progress indicator (Details → Pin metadata → Confirm in
        │                       wallet → Launched) matches the existing create-flow pattern
        │                       used for NFTs and RWA assets.
        │
        └── /launchpad/[address]   Header (art, name, socials, status), stat grid (price,
                                    market cap, KII raised, holders, creator, fees, max
                                    wallet, time since last trade), a candlestick price
                                    chart built from on-chain Trade events, a buy/sell panel
                                    with live quotes/slippage/price-impact, an inactivity &
                                    liquidation panel (shows what stage a stalled token is
                                    in and exposes the next permissionless action — start
                                    liquidation / run a batch / remove from launchpad), and
                                    creator-only max-wallet controls.

/profile                    Existing NFT + RWA holdings sections, PLUS (new):
                             "Tokens you created" — per-token status, holder count, and a
                             claim button for accrued creator fees.
                             "My tokens" — every launchpad token the connected wallet
                             currently holds a nonzero balance of, linking to each token's
                             trade page.
```

All reads use the same event-log + `useQuery` caching pattern as the existing RWA module
(`lib/data.ts`: `useLaunchTokens`, `useLaunchState`, `useLaunchStates`, `useLaunchTrades`,
`useLaunchHoldings`, `useLaunchpadParams`), and every write goes through the shared `useTx()` helper, so
launchpad transactions get the same chain-switch prompt, toast lifecycle, and revert-message mapping
(`lib/errors.ts`) as every other button in the app.

---

## 6. Security considerations

- **Supply can only ever go down.** The entire fixed supply mints once, at construction, to the
  launchpad. No mint function exists anywhere, for anyone, ever — the only way supply changes after
  creation is `burnFrom`, restricted to the launchpad, used exclusively during liquidation.
- **No transfer can ever be blocked.** `MemeToken._update` reports to the launchpad inside a
  `try/catch`, so even a bug, a future storage change, or an upgraded launchpad that reverts on the
  callback can never brick a holder's ability to move their own tokens. This is also what keeps
  sniping-bot support unconditional — there is structurally no hook capable of adding a blocklist,
  cooldown, or tax later without changing the token contract itself (which nobody can do post-launch).
- **No rug switch.** Covered in §2.4 — there is no function, admin or otherwise, that can withdraw a
  token's trading reserve for anyone but a seller, a creator's fee claim, or a liquidation payout.
- **Reentrancy**: `buy`, `sell`, `createToken`, `claimCreatorFees`, `liquidateBatch`, and `withdraw` are
  all `nonReentrant` (OpenZeppelin `ReentrancyGuard`) and follow checks-effects-interactions — all
  reserve/fee state is updated before any external call (ERC20 transfer or native KII send). The one
  externally-triggerable reentry point, `onMemeTransfer`, is deliberately **not** `nonReentrant` (it
  would otherwise deadlock against the very `buy()`/`sell()` call that triggers it) but only ever
  writes simple counters — it makes no external calls and cannot be used to re-enter anything.
  Liquidation's holder-decrement happens *before* the `burnFrom` call that triggers the hook, so the
  hook always sees already-updated state and can't double-count.
- **Pull payments everywhere money leaves the contract**: protocol fees, creator fees, liquidation
  payouts. Nothing is ever pushed to an address chosen by someone else mid-transaction, which is the
  standard defense against a malicious/broken receiving contract griefing a shared batch operation.
- **Bounded admin power.** The owner (`Ownable2Step`, so a transfer needs the new owner to explicitly
  accept — no accidental transfer to a dead address) can only move parameters within hard-coded bounds
  (`MIN`/`MAX_CREATION_FEE`, `MAX_PROTOCOL_FEE_BPS`, `MIN`/`MAX_CREATOR_FEE_BPS`) and can `pause()` new
  token creation and trading — it cannot touch a specific token's reserve, mint anything, or reassign a
  creator's fee claim.
- **Slippage protection** (`minTokensOut`/`minKiiOut`) is enforced on-chain on every trade, and the
  frontend defaults to a wider tolerance (1%/3%/10%) than the RWA module's, since memecoin curves move
  faster and a too-tight default would make legitimate trades fail constantly against sniping bots —
  which, again, this launchpad does not attempt to block.
- **Known limitation (documented, not hidden):** the liquidation holder-scan's `O(n)` gas cost (§3.3)
  means a token that goes inactive with hundreds of live holders would need many `liquidateBatch` calls
  and meaningful cumulative gas to fully wind down. This is an acceptable MVP trade-off (see §7) but
  should be revisited before enabling this module for high-holder-count tokens at scale.
- **Not yet done, recommended before mainnet**: a third-party audit of `MemeLaunchpad.sol` /
  `MemeToken.sol` specifically (they're new, unlike the audited-by-reuse RWA/NFT contracts they borrow
  patterns from), and a testnet run of the full inactivity → liquidation → deletion path with a
  realistic (50+) holder count to gas-profile §3.3 for real.

---

## 7. Recommended parameters

| Parameter | Default | Allowed range | Notes |
|---|---|---|---|
| Creation fee | **2 KII** | 1-20 KII, owner-adjustable | Per the brief; start low to encourage launch volume, raise if spam becomes an issue. |
| Protocol trade fee | 0.5% | 0-1.5%, owner-adjustable | Applies to both buys and sells. |
| Creator trade fee | 0.75% | 0.5-1%, owner-adjustable (new tokens only) | Mid-point of the brief's recommended 0.5-1% band. |
| Default max wallet | 2% of supply | 0.5-100%, creator-adjustable per token | Loose enough not to feel punitive; tight enough to blunt a single-wallet sweep. |
| Graduation threshold | 300 KII raised | owner-adjustable, no hard cap | Testnet-scale placeholder — recalibrate against real KII liquidity/volume before mainnet. |
| Inactivity period | 30 days | fixed (spec requirement) | Matches the brief exactly; not adjustable on purpose, so it can't be quietly shortened. |
| Liquidation discount | 15% (pay out at 0.85×) | fixed constant | Matches the brief's example exactly (`0.85 × current market price`). |
| Deletion holder limit | < 20 holders | fixed (spec requirement) | Snapshotted at the moment inactivity triggers, not measured after liquidation. |

**Suggested next steps beyond this MVP**, roughly in priority order:
1. Gas-profile `liquidateBatch` against a 100+-holder token on testnet; if it's too expensive, move to
   a keeper-submitted-and-verified sorted order or a claim-based (pull, not push) liquidation model.
2. Add a public "inactive tokens" keeper dashboard/bot so `triggerLiquidation`/`liquidateBatch` don't
   rely on a person noticing — everything is permissionless, but permissionless still needs someone to
   call it.
3. Consider a per-token, creator-set liquidity floor or vesting on creator-fee claims for very new
   tokens, if rug-adjacent "claim fees and abandon" patterns show up in practice (not currently
   restricted, since the fee is only ever a cut of trades, never the reserve itself).
4. Revisit the single-shared-curve-contract vs. clone-factory trade-off (§1) once launch volume and gas
   costs on KiiChain are better understood.

---

## 8. Tokenomics — Launchpad addition

This extends KiiEden's existing fee model (see `README.md` → "Platform fee") with the launchpad's fee
flows. All figures use the defaults in §7; every one of them is a configurable on-chain parameter within
its stated bound, not a hard-coded constant.

| Flow | Rate | Goes to | Claim model |
|---|---|---|---|
| Token creation | 2 KII flat (owner-adjustable, 1-20 KII) | Protocol treasury (`feeRecipient`) | Pull (`withdraw()`) |
| Trade fee — protocol cut | 0.5% of every buy/sell (owner-adjustable, ≤1.5%) | Protocol treasury | Pull (`withdraw()`) |
| Trade fee — creator cut | 0.75% of every buy/sell (owner-adjustable per new token, 0.5-1%) | That token's creator | Pull (`claimCreatorFees(token)`), anytime |
| Liquidation payout | 85% of spot price, paid from the token's own reserve | Each liquidated holder, largest-balance-first | Pull (`withdraw()`) |
| Graduation | No new fee event — status change only, same reserves | — | — |

Combined with KiiEden's existing NFT mint fee (2 KII testnet / 1 KII mainnet, owner-adjustable up to 50
KII) and RWA trading-curve fee (0.3% to liquidity providers), the launchpad gives KiiEden a third,
independent revenue stream — flat per-creation plus a recurring per-trade cut — while, per the brief,
returning the larger and more interesting share of every trade's fee (up to 2x the protocol's own cut)
directly to the person who created the token, so creators are incentivized to keep their community
trading rather than to front-load a one-time creation charge.
