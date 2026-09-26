// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./MemeToken.sol";

/// @title MemeLaunchpad
/// @notice Fair-launch memecoin launchpad for KiiEden, in the style of Argus /
///         Genius.fun / Pons: no-code token creation, a single-sided bonding curve
///         per token (no presale, no team allocation — everyone buys from the same
///         curve from block zero), optional graduation to a permanent AMM once
///         enough KII has been raised, and a 30-day inactivity → discounted
///         liquidation → conditional deletion lifecycle. See LAUNCHPAD.md for the
///         full design writeup.
///
///         PRICING: a pump.fun-style constant-product curve with a virtual KII seed
///         (`VIRTUAL_KII`) so the token has a sane, non-zero starting price without
///         needing anyone to seed real liquidity first:
///             effectiveKiiReserve = VIRTUAL_KII + realKii
///             effectiveKiiReserve * tokenReserve = k   (constant between trades)
///         Buys move KII in / tokens out and push the price up; sells do the
///         opposite. `realKii` is the ONLY KII the contract actually holds for that
///         token — VIRTUAL_KII is never real money, it just shapes the curve.
///
///         LIQUIDITY PROTECTION: there is no separate withdrawable LP. `realKii` for
///         a token can only ever leave this contract via a sell(), a creator-fee
///         claim (creator's cut only) or a liquidation payout to a holder. Neither
///         the creator nor the platform owner has any function that pulls a token's
///         trading reserve for themselves — that IS the "LP burn" guarantee, just
///         implemented as "no withdraw function exists" rather than sending LP
///         tokens to address(0).
///
///         SNIPING BOTS: allowed by design. There is no transfer delay, launch
///         cooldown, or per-block trade limit anywhere in this contract.
contract MemeLaunchpad is Ownable2Step, Pausable, ReentrancyGuard, ILaunchpadHook {
    enum Status {
        Active, // trading on the bonding curve
        Graduated, // raised enough KII; same pool now behaves as a plain AMM, wallet cap lifted
        Liquidating, // 30 days silent; being paid out largest-holder-first
        Liquidated, // every holder paid out
        Deleted // Liquidated AND had <20 holders when the inactivity timer fired -> delisted
    }

    struct Launch {
        address token;
        address creator;
        uint96 createdAt;
        uint96 lastTradeAt;
        uint256 realKii; // actual KII this token's curve holds (payout capacity)
        uint256 tokenReserve; // actual tokens still held by the curve (unsold supply)
        uint16 maxWalletBps; // creator-configurable, out of 10000; 10000 = disabled
        uint16 creatorFeeBps; // snapshot of creatorFeeBpsDefault at creation time
        uint32 holderCount; // live count, maintained by onMemeTransfer()
        uint32 holderCountAtInactivity; // snapshot taken when the 30-day timer fires
        Status status;
        string metadataURI; // ipfs://... json: description, image, twitter/telegram/website
    }

    // ------------------------------------------------------------- parameters
    uint256 public constant MIN_CREATION_FEE = 1 ether; // 1 KII
    uint256 public constant MAX_CREATION_FEE = 20 ether; // 20 KII
    uint256 public creationFeeWei = 2 ether; // default 2 KII, owner-adjustable in [1,20]

    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether; // fixed for every launch, 18 decimals
    uint256 public constant VIRTUAL_KII = 30 ether; // pricing-only seed, never real balance
    uint256 public graduationKiiThreshold = 300 ether; // realKii raised that flips a token to Graduated

    uint16 public constant MAX_PROTOCOL_FEE_BPS = 150; // 1.5% hard ceiling
    uint16 public protocolFeeBps = 50; // 0.50% default

    uint16 public constant MIN_CREATOR_FEE_BPS = 50; // 0.50%
    uint16 public constant MAX_CREATOR_FEE_BPS = 100; // 1.00%
    uint16 public creatorFeeBpsDefault = 75; // 0.75% default, within the recommended 0.5-1% band

    uint16 public constant MIN_MAX_WALLET_BPS = 50; // 0.5% of supply, tightest allowed
    uint16 public constant MAX_WALLET_DISABLED = 10000; // 100% = no cap
    uint16 public constant DEFAULT_MAX_WALLET_BPS = 200; // 2% of supply, used when a creator passes 0

    uint256 public constant INACTIVITY_PERIOD = 30 days;
    uint256 public constant LIQUIDATION_DISCOUNT_BPS = 8500; // holders are bought out at 85% of spot price
    uint256 public constant DELETION_HOLDER_LIMIT = 20; // only <20-holder tokens can be delisted after liquidation

    address public feeRecipient;

    // ------------------------------------------------------------------ state
    mapping(address => Launch) public launches; // token => launch data
    mapping(address => bool) public isMemeToken;
    address[] public allTokens;

    mapping(address => uint256) public pendingCreatorFees; // token => claimable KII for its creator
    mapping(address => uint256) public pendingWithdrawals; // account => claimable KII (protocol fees + liquidation payouts)

    mapping(address => address[]) public holders; // token => every address ever seen holding it
    mapping(address => mapping(address => bool)) public trackedHolder; // token => holder => currently counted
    mapping(address => mapping(address => bool)) public liquidatedHolder; // token => holder => already paid out

    // ------------------------------------------------------------------ events
    event TokenCreated(address indexed token, address indexed creator, string name, string symbol, string metadataURI, uint16 maxWalletBps, uint256 feePaid);
    event Trade(address indexed token, address indexed trader, bool isBuy, uint256 kiiAmount, uint256 tokenAmount, uint256 priceAfter, uint256 timestamp);
    event TokenGraduated(address indexed token, uint256 realKiiRaised);
    event CreatorFeesClaimed(address indexed token, address indexed creator, uint256 amount);
    event Withdrawn(address indexed account, uint256 amount);
    event MaxWalletUpdated(address indexed token, uint16 newBps);
    event LiquidationTriggered(address indexed token, uint256 holderCountSnapshot);
    event HolderLiquidated(address indexed token, address indexed holder, uint256 tokenAmount, uint256 kiiPaid, uint256 priceUsed);
    event TokenDeleted(address indexed token, uint256 holderCountAtLiquidation);
    event CreationFeeUpdated(uint256 newFeeWei);
    event ProtocolFeeUpdated(uint16 newBps);
    event CreatorFeeDefaultUpdated(uint16 newBps);
    event GraduationThresholdUpdated(uint256 newThreshold);

    // ------------------------------------------------------------------ errors
    error ZeroAddress();
    error ZeroAmount();
    error NotLaunch();
    error BadName();
    error BadMaxWallet();
    error BadCreationFee();
    error WrongFee(uint256 required, uint256 sent);
    error FeeTooHigh();
    error TradingHalted();
    error SlippageExceeded();
    error MaxWalletExceeded();
    error TransferFailed();
    error NotCreator();
    error NothingToWithdraw();
    error StillActive();
    error AlreadyLiquidating();
    error NotLiquidating();
    error NotLiquidated();
    error TooManyHolders();

    constructor(address _feeRecipient) Ownable(msg.sender) {
        if (_feeRecipient == address(0)) revert ZeroAddress();
        feeRecipient = _feeRecipient;
    }

    // ================================================================ CREATE
    /// @notice No-code token creation. Deploys a brand-new MemeToken, mints its
    ///         entire fixed supply to this contract, and opens the bonding curve
    ///         immediately — there is no presale and no team allocation.
    /// @param name_ ERC20 name (<=32 bytes)
    /// @param symbol_ ERC20 symbol (<=12 bytes)
    /// @param metadataURI_ ipfs:// URI to a JSON blob: { description, image, twitter, telegram, website }
    /// @param maxWalletBps_ Per-wallet cap in bps of total supply while Active; 0 = use the 2% default
    function createToken(string calldata name_, string calldata symbol_, string calldata metadataURI_, uint16 maxWalletBps_)
        external
        payable
        whenNotPaused
        nonReentrant
        returns (address token)
    {
        if (msg.value != creationFeeWei) revert WrongFee(creationFeeWei, msg.value);
        if (bytes(name_).length == 0 || bytes(name_).length > 32) revert BadName();
        if (bytes(symbol_).length == 0 || bytes(symbol_).length > 12) revert BadName();

        uint16 mw = maxWalletBps_ == 0 ? MAX_WALLET_DISABLED : maxWalletBps_;
        if (mw < MIN_MAX_WALLET_BPS || mw > MAX_WALLET_DISABLED) revert BadMaxWallet();

        token = address(new MemeToken(name_, symbol_, TOTAL_SUPPLY));

        launches[token] = Launch({
            token: token,
            creator: msg.sender,
            createdAt: uint96(block.timestamp),
            lastTradeAt: uint96(block.timestamp),
            realKii: 0,
            tokenReserve: TOTAL_SUPPLY,
            maxWalletBps: mw,
            creatorFeeBps: creatorFeeBpsDefault,
            holderCount: 0,
            holderCountAtInactivity: 0,
            status: Status.Active,
            metadataURI: metadataURI_
        });
        isMemeToken[token] = true;
        allTokens.push(token);

        pendingWithdrawals[feeRecipient] += msg.value; // creation fee -> protocol treasury, pull payment

        emit TokenCreated(token, msg.sender, name_, symbol_, metadataURI_, mw, msg.value);
    }

    // ================================================================= TRADE
    /// @notice Buy `token` with `msg.value` KII. Reverts if fewer than `minTokensOut`
    ///         tokens would be received (slippage protection).
    function buy(address token, uint256 minTokensOut) external payable nonReentrant whenNotPaused {
        Launch storage L = launches[token];
        if (L.token == address(0)) revert NotLaunch();
        if (L.status != Status.Active && L.status != Status.Graduated) revert TradingHalted();
        if (msg.value == 0) revert ZeroAmount();

        uint256 protocolFee = (msg.value * protocolFeeBps) / 10000;
        uint256 creatorFee = (msg.value * L.creatorFeeBps) / 10000;
        uint256 netIn = msg.value - protocolFee - creatorFee;

        uint256 kiiBefore = VIRTUAL_KII + L.realKii;
        uint256 k = kiiBefore * L.tokenReserve;
        uint256 tokenReserveAfter = k / (kiiBefore + netIn);
        uint256 tokensOut = L.tokenReserve - tokenReserveAfter;
        if (tokensOut == 0 || tokensOut < minTokensOut) revert SlippageExceeded();

        bool willGraduate = L.status == Status.Active && (L.realKii + netIn) >= graduationKiiThreshold;

        if (L.status == Status.Active && !willGraduate && L.maxWalletBps < MAX_WALLET_DISABLED) {
            uint256 cap = (TOTAL_SUPPLY * L.maxWalletBps) / 10000;
            uint256 balAfter = IERC20(token).balanceOf(msg.sender) + tokensOut;
            if (balAfter > cap) revert MaxWalletExceeded();
        }

        L.realKii += netIn;
        L.tokenReserve = tokenReserveAfter;
        L.lastTradeAt = uint96(block.timestamp);
        pendingWithdrawals[feeRecipient] += protocolFee;
        pendingCreatorFees[token] += creatorFee;

        if (willGraduate) {
            L.status = Status.Graduated;
            emit TokenGraduated(token, L.realKii);
        }
        emit Trade(token, msg.sender, true, msg.value, tokensOut, _spotPrice(L), block.timestamp);
        if (!IERC20(token).transfer(msg.sender, tokensOut)) revert TransferFailed();
    }

    /// @notice Sell `tokensIn` of `token` for KII (approve this contract first).
    function sell(address token, uint256 tokensIn, uint256 minKiiOut) external nonReentrant whenNotPaused {
        Launch storage L = launches[token];
        if (L.token == address(0)) revert NotLaunch();
        if (L.status != Status.Active && L.status != Status.Graduated) revert TradingHalted();
        if (tokensIn == 0) revert ZeroAmount();

        uint256 kiiBefore = VIRTUAL_KII + L.realKii;
        uint256 k = kiiBefore * L.tokenReserve;
        uint256 tokenReserveAfter = L.tokenReserve + tokensIn;
        uint256 kiiAfter = k / tokenReserveAfter;
        uint256 grossKiiOut = kiiBefore - kiiAfter;
        if (grossKiiOut > L.realKii) grossKiiOut = L.realKii; // never promise virtual KII that isn't real

        uint256 protocolFee = (grossKiiOut * protocolFeeBps) / 10000;
        uint256 creatorFee = (grossKiiOut * L.creatorFeeBps) / 10000;
        uint256 kiiOut = grossKiiOut - protocolFee - creatorFee;
        if (kiiOut == 0 || kiiOut < minKiiOut) revert SlippageExceeded();

        L.realKii -= grossKiiOut;
        L.tokenReserve = tokenReserveAfter;
        L.lastTradeAt = uint96(block.timestamp);
        pendingWithdrawals[feeRecipient] += protocolFee;
        pendingCreatorFees[token] += creatorFee;

        emit Trade(token, msg.sender, false, kiiOut, tokensIn, _spotPrice(L), block.timestamp);

        if (!IERC20(token).transferFrom(msg.sender, address(this), tokensIn)) revert TransferFailed();
        (bool ok, ) = msg.sender.call{value: kiiOut}("");
        if (!ok) revert TransferFailed();
    }

    // -------------------------------------------------------------- quoting
    function quoteBuy(address token, uint256 kiiIn) external view returns (uint256 tokensOut) {
        Launch storage L = launches[token];
        if (L.token == address(0) || kiiIn == 0) return 0;
        uint256 protocolFee = (kiiIn * protocolFeeBps) / 10000;
        uint256 creatorFee = (kiiIn * L.creatorFeeBps) / 10000;
        uint256 netIn = kiiIn - protocolFee - creatorFee;
        uint256 kiiBefore = VIRTUAL_KII + L.realKii;
        uint256 k = kiiBefore * L.tokenReserve;
        tokensOut = L.tokenReserve - k / (kiiBefore + netIn);
    }

    function quoteSell(address token, uint256 tokensIn) external view returns (uint256 kiiOut) {
        Launch storage L = launches[token];
        if (L.token == address(0) || tokensIn == 0) return 0;
        uint256 kiiBefore = VIRTUAL_KII + L.realKii;
        uint256 k = kiiBefore * L.tokenReserve;
        uint256 kiiAfter = k / (L.tokenReserve + tokensIn);
        uint256 gross = kiiBefore - kiiAfter;
        if (gross > L.realKii) gross = L.realKii;
        uint256 protocolFee = (gross * protocolFeeBps) / 10000;
        uint256 creatorFee = (gross * L.creatorFeeBps) / 10000;
        kiiOut = gross - protocolFee - creatorFee;
    }

    function price(address token) external view returns (uint256) {
        Launch storage L = launches[token];
        if (L.token == address(0)) revert NotLaunch();
        return _spotPrice(L);
    }

    function _spotPrice(Launch storage L) internal view returns (uint256) {
        if (L.tokenReserve == 0) return 0;
        return ((VIRTUAL_KII + L.realKii) * 1e18) / L.tokenReserve;
    }

    // ------------------------------------------------------------- creator fees
    function claimCreatorFees(address token) external nonReentrant {
        Launch storage L = launches[token];
        if (msg.sender != L.creator) revert NotCreator();
        uint256 amt = pendingCreatorFees[token];
        if (amt == 0) revert NothingToWithdraw();
        pendingCreatorFees[token] = 0;
        (bool ok, ) = msg.sender.call{value: amt}("");
        if (!ok) revert TransferFailed();
        emit CreatorFeesClaimed(token, msg.sender, amt);
    }

    /// @notice Creator can tighten or loosen their own token's per-wallet cap at any
    ///         time (bounded the same as at creation). Has no effect once Graduated.
    function setMaxWallet(address token, uint16 newBps) external {
        Launch storage L = launches[token];
        if (msg.sender != L.creator) revert NotCreator();
        if (newBps < MIN_MAX_WALLET_BPS || newBps > MAX_WALLET_DISABLED) revert BadMaxWallet();
        L.maxWalletBps = newBps;
        emit MaxWalletUpdated(token, newBps);
    }

    // ---------------------------------------------------------- holder tracking
    /// @dev Called by every MemeToken after each transfer (including buys, sells,
    ///      plain wallet-to-wallet transfers, and liquidation burns). Never reverts.
    function onMemeTransfer(address from, address to, uint256) external override {
        if (!isMemeToken[msg.sender]) return;
        Launch storage L = launches[msg.sender];

        if (from != address(0) && from != address(this) && trackedHolder[msg.sender][from]) {
            if (IERC20(msg.sender).balanceOf(from) == 0) {
                trackedHolder[msg.sender][from] = false;
                if (L.holderCount > 0) L.holderCount -= 1;
            }
        }
        if (to != address(0) && to != address(this) && !trackedHolder[msg.sender][to] && IERC20(msg.sender).balanceOf(to) > 0) {
            trackedHolder[msg.sender][to] = true;
            holders[msg.sender].push(to);
            L.holderCount += 1;
        }
    }

    /// @notice Every currently-holding wallet for `token` (view-only; safe to call
    ///         off-chain even for a large list since it costs no gas as `eth_call`).
    function activeHolders(address token) external view returns (address[] memory list) {
        address[] storage all = holders[token];
        uint256 count;
        for (uint256 i = 0; i < all.length; i++) if (trackedHolder[token][all[i]]) count++;
        list = new address[](count);
        uint256 j;
        for (uint256 i = 0; i < all.length; i++) {
            if (trackedHolder[token][all[i]]) list[j++] = all[i];
        }
    }

    // ----------------------------------------------------- inactivity & liquidation
    /// @notice True once a live token has gone 30 full days without a single buy or
    ///         sell. Anyone can check this; it drives the "Inactive" status badge.
    function isInactive(address token) public view returns (bool) {
        Launch storage L = launches[token];
        if (L.token == address(0)) return false;
        if (L.status != Status.Active && L.status != Status.Graduated) return false;
        return block.timestamp - L.lastTradeAt >= INACTIVITY_PERIOD;
    }

    /// @notice Permissionless: flips a 30-day-silent token to Liquidating and
    ///         snapshots its holder count (that snapshot is what later gates the
    ///         <20-holder deletion rule, not the count after liquidation has run).
    function triggerLiquidation(address token) external {
        Launch storage L = launches[token];
        if (L.token == address(0)) revert NotLaunch();
        if (L.status == Status.Liquidating) revert AlreadyLiquidating();
        if (!isInactive(token)) revert StillActive();
        L.status = Status.Liquidating;
        L.holderCountAtInactivity = L.holderCount;
        emit LiquidationTriggered(token, L.holderCount);
    }

    /// @notice Permissionless keeper call. Pays out up to `maxHolders` holders of an
    ///         inactive token, LARGEST BALANCE FIRST, at 85% of the current spot
    ///         price, funded out of that token's own `realKii`. Bounded per call so
    ///         a token with many holders can never make liquidation run out of gas —
    ///         call repeatedly (e.g. from a keeper bot) until `processed` returns 0.
    ///         Finding "the largest remaining holder" is an O(n) scan of that
    ///         token's holder list per pass; this is intentional (see LAUNCHPAD.md
    ///         "Gas considerations") rather than requiring a trusted off-chain sort.
    function liquidateBatch(address token, uint256 maxHolders) external nonReentrant returns (uint256 processed) {
        Launch storage L = launches[token];
        if (L.status != Status.Liquidating) revert NotLiquidating();
        if (maxHolders == 0) revert ZeroAmount();

        address[] storage list = holders[token];
        uint256 discounted = (_spotPrice(L) * LIQUIDATION_DISCOUNT_BPS) / 10000;

        for (uint256 pass = 0; pass < maxHolders; pass++) {
            address biggest;
            uint256 biggestBal;
            for (uint256 i = 0; i < list.length; i++) {
                address h = list[i];
                if (liquidatedHolder[token][h] || !trackedHolder[token][h]) continue;
                uint256 bal = IERC20(token).balanceOf(h);
                if (bal > biggestBal) {
                    biggestBal = bal;
                    biggest = h;
                }
            }
            if (biggest == address(0)) break; // nobody left to pay out

            uint256 kiiOwed = (biggestBal * discounted) / 1e18;
            if (kiiOwed > L.realKii) kiiOwed = L.realKii; // never pay out more than this token's pool actually holds

            liquidatedHolder[token][biggest] = true;
            trackedHolder[token][biggest] = false;
            L.holderCount -= 1;
            L.realKii -= kiiOwed;

            MemeToken(L.token).burnFrom(biggest, biggestBal);
            if (kiiOwed > 0) pendingWithdrawals[biggest] += kiiOwed;

            emit HolderLiquidated(token, biggest, biggestBal, kiiOwed, discounted);
            processed++;
        }

        if (L.holderCount == 0) L.status = Status.Liquidated;
    }

    /// @notice Permissionless: once a token is fully liquidated (every holder paid
    ///         out), remove it from the Launchpad listing — but ONLY if it had
    ///         fewer than 20 holders at the moment its 30-day inactivity timer
    ///         fired. Larger tokens stay listed and permanently marked Liquidated
    ///         instead of Deleted, so their trading history and creator page stay
    ///         visible (many wallets were involved; silently erasing them would be
    ///         worse for transparency than a "Liquidated" badge).
    function deleteToken(address token) external {
        Launch storage L = launches[token];
        if (L.status != Status.Liquidated) revert NotLiquidated();
        if (L.holderCountAtInactivity >= DELETION_HOLDER_LIMIT) revert TooManyHolders();
        L.status = Status.Deleted;
        emit TokenDeleted(token, L.holderCountAtInactivity);
    }

    // ----------------------------------------------------------------- withdraw
    /// @notice Pull-payment withdrawal for protocol fees AND liquidation payouts.
    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        pendingWithdrawals[msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(msg.sender, amount);
    }

    // ------------------------------------------------------------------- views
    function totalTokens() external view returns (uint256) {
        return allTokens.length;
    }

    // ------------------------------------------------------------------- admin
    /// @notice Adjustable creation fee, hard-bounded to [1, 20] KII (spec requirement).
    function setCreationFee(uint256 newFeeWei) external onlyOwner {
        if (newFeeWei < MIN_CREATION_FEE || newFeeWei > MAX_CREATION_FEE) revert BadCreationFee();
        creationFeeWei = newFeeWei;
        emit CreationFeeUpdated(newFeeWei);
    }

    function setProtocolFeeBps(uint16 newBps) external onlyOwner {
        if (newBps > MAX_PROTOCOL_FEE_BPS) revert FeeTooHigh();
        protocolFeeBps = newBps;
        emit ProtocolFeeUpdated(newBps);
    }

    /// @notice Only affects tokens created AFTER this call — every existing token
    ///         keeps the creatorFeeBps it was created with.
    function setDefaultCreatorFeeBps(uint16 newBps) external onlyOwner {
        if (newBps < MIN_CREATOR_FEE_BPS || newBps > MAX_CREATOR_FEE_BPS) revert FeeTooHigh();
        creatorFeeBpsDefault = newBps;
        emit CreatorFeeDefaultUpdated(newBps);
    }

    function setGraduationThreshold(uint256 newThresholdWei) external onlyOwner {
        if (newThresholdWei == 0) revert ZeroAmount();
        graduationKiiThreshold = newThresholdWei;
        emit GraduationThresholdUpdated(newThresholdWei);
    }

    function setFeeRecipient(address newRecipient) external onlyOwner {
        if (newRecipient == address(0)) revert ZeroAddress();
        feeRecipient = newRecipient;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
