// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title RWAAsset
/// @notice One real-world asset = one of these contracts = one ERC-20 "unit" token.
///         Only the RWAFactory's admin can create these (see RWAFactory.createAsset,
///         onlyOwner). Each unit represents a fixed fractional share of the asset.
///
///         Lifecycle:
///         1. IPO phase (`ipoActive == true`): buyers call `contribute{value}()` and
///            receive units minted 1:1 against their KII contribution at
///            `pricePerUnit`, up to `totalUnits`. Units are NON-transferable during
///            this phase (enforced in `_update`) so nobody can run a secondary
///            market before the raise is even final — only the admin-declared
///            terms apply.
///         2. IPO closes (admin calls `closeIpo()`, or it self-closes once fully
///            subscribed). Proceeds are pulled by `assetTreasury` (pull pattern).
///            Units become freely transferable ERC-20 tokens from this point,
///            tradeable on RWAUnitMarketplace or anywhere else.
///
///         "Bid for a proportion of the asset" is implemented as: your
///         contribution / totalRaise == your proportion of totalUnits, which is
///         the same thing algebraically, done as a fixed-price crowdsale rather
///         than a competitive-bid auction — simpler to secure and to reason
///         about for real-money real-world assets. A competitive englist-style
///         allocation auction is a reasonable Phase 2 upgrade if fixed-price
///         under/over-subscription isn't what you want.
contract RWAAsset is ERC20, Ownable2Step, Pausable, ReentrancyGuard {
    uint256 public immutable totalUnits; // hard cap on supply, in whole units (18 decimals via ERC20)
    uint256 public immutable pricePerUnit; // KII (wei) per whole unit
    uint256 public immutable ipoStartTime; // IPO opens here (may be in the future: "upcoming")
    uint256 public immutable ipoEndTime;
    address public assetTreasury; // receives IPO proceeds — the entity legally holding the RWA
    string public assetMetadataURI; // IPFS doc: legal wrapper, valuation, custody proof, etc.

    bool public ipoActive = true;
    uint256 public unitsSold;
    uint256 public pendingTreasuryWithdrawal;

    mapping(address => uint256) public contributed; // KII contributed per address, for records/refund edge cases

    event Contributed(address indexed buyer, uint256 kiiPaid, uint256 unitsMinted);
    event IpoClosed(uint256 totalRaised, uint256 unitsSold);
    event TreasuryWithdrawn(uint256 amount);
    event AssetMetadataUpdated(string newURI);

    error IpoNotActive();
    error IpoStillActive();
    error SoldOut();
    error ZeroValue();
    error TransfersLockedDuringIpo();
    error ZeroAddress();
    error NothingToWithdraw();
    error WithdrawFailed();

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 totalUnits_,
        uint256 pricePerUnit_,
        uint256 ipoStart_, // 0 = open immediately
        uint256 ipoDuration_,
        address admin_,
        address assetTreasury_,
        string memory assetMetadataURI_
    ) ERC20(name_, symbol_) Ownable(admin_) {
        if (assetTreasury_ == address(0)) revert ZeroAddress();
        totalUnits = totalUnits_;
        pricePerUnit = pricePerUnit_;
        uint256 start = ipoStart_ == 0 ? block.timestamp : ipoStart_;
        ipoStartTime = start;
        ipoEndTime = start + ipoDuration_;
        assetTreasury = assetTreasury_;
        assetMetadataURI = assetMetadataURI_;
    }

    /// @notice Buy units during the IPO window. Units are only sold in whole-unit
    ///         increments (fractional atomic amounts are never minted) — any KII
    ///         beyond the last whole unit you can afford, or beyond remaining
    ///         supply, is refunded. Same overpayment-refund pattern as
    ///         FeeManager, proven elsewhere in this project.
    function contribute() external payable nonReentrant whenNotPaused {
        if (!isIpoOpen()) revert IpoNotActive();
        if (msg.value == 0) revert ZeroValue();
        if (unitsSold >= totalUnits) revert SoldOut();

        // totalUnits/unitsSold are tracked in ERC20 atomic amounts (18 decimals,
        // i.e. "1000 whole units" is stored as 1000e18) so balances/allowances/
        // transfers all behave like a normal ERC20. pricePerUnit is KII per ONE
        // WHOLE unit, so we work in whole-unit counts here and scale by 1e18
        // only when minting/tracking supply.
        uint256 wholeUnitsRequested = msg.value / pricePerUnit;
        uint256 remainingWhole = (totalUnits - unitsSold) / 1e18;
        uint256 wholeUnitsToMint = wholeUnitsRequested > remainingWhole ? remainingWhole : wholeUnitsRequested;
        if (wholeUnitsToMint == 0) revert ZeroValue(); // sent less than one unit's worth

        uint256 atomicUnitsToMint = wholeUnitsToMint * 1e18;
        uint256 cost = wholeUnitsToMint * pricePerUnit;
        uint256 refund = msg.value - cost;

        unitsSold += atomicUnitsToMint;
        contributed[msg.sender] += cost;
        pendingTreasuryWithdrawal += cost;

        emit Contributed(msg.sender, cost, atomicUnitsToMint);

        _mint(msg.sender, atomicUnitsToMint);

        if (unitsSold == totalUnits) {
            _closeIpo();
        }

        if (refund > 0) {
            (bool sent, ) = msg.sender.call{value: refund}("");
            require(sent, "refund failed");
        }
    }

    /// @notice True while units can be bought right now: the IPO has started, has
    ///         not been closed and its deadline has not passed. Time-aware on purpose:
    ///         `ipoActive` is only flipped when someone calls closeIpo() (or the
    ///         asset sells out), so a flag alone would leave the asset in limbo after
    ///         the deadline.
    function isIpoOpen() public view returns (bool) {
        return ipoActive && block.timestamp >= ipoStartTime && block.timestamp <= ipoEndTime;
    }

    /// @notice True once the IPO is over (sold out, closed, or past its deadline).
    ///         From this moment units are freely transferable and can be traded.
    function ipoEnded() public view returns (bool) {
        return !ipoActive || block.timestamp > ipoEndTime;
    }

    /// @notice Admin can close the IPO early (e.g. the raise window is over even
    ///         if not fully subscribed). Anyone can call this after ipoEndTime
    ///         has passed, so the asset isn't stuck waiting on the admin.
    function closeIpo() external {
        if (msg.sender != owner() && block.timestamp <= ipoEndTime) revert IpoStillActive();
        if (!ipoActive) revert IpoNotActive();
        _closeIpo();
    }

    function _closeIpo() internal {
        ipoActive = false;
        emit IpoClosed(unitsSold * pricePerUnit, unitsSold);
    }

    /// @notice Pull-payment withdrawal of IPO proceeds by the designated treasury.
    ///         Only available once the raise is over (sold out, closed, or past
    ///         its deadline) so the treasury can't drain funds mid-IPO.
    function withdrawProceeds() external nonReentrant {
        require(msg.sender == assetTreasury, "not treasury");
        if (!ipoEnded()) revert IpoStillActive();
        uint256 amount = pendingTreasuryWithdrawal;
        if (amount == 0) revert NothingToWithdraw();
        pendingTreasuryWithdrawal = 0;

        (bool sent, ) = assetTreasury.call{value: amount}("");
        if (!sent) revert WithdrawFailed();

        emit TreasuryWithdrawn(amount);
    }

    function setAssetTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        assetTreasury = newTreasury;
    }

    function setAssetMetadataURI(string calldata newURI) external onlyOwner {
        assetMetadataURI = newURI;
        emit AssetMetadataUpdated(newURI);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @dev Blocks transfers (not mints/burns) while the IPO is still open, and
    ///      respects the emergency pause at all times.
    function _update(address from, address to, uint256 value) internal override whenNotPaused {
        if (!ipoEnded() && from != address(0) && to != address(0)) {
            revert TransfersLockedDuringIpo();
        }
        super._update(from, to, value);
    }
}
