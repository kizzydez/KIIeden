// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./RWAFactory.sol";

/// @title RWAUnitMarketplace
/// @notice Secondary market for RWA units, once their IPO has closed (RWAAsset
///         itself blocks transfers until then, so any order placed too early
///         simply can't be filled — no separate check needed here beyond the
///         ERC20 transferFrom itself reverting).
///         Partial-fill sell orders: a seller lists up to X units at a fixed
///         price-per-unit, buyers can take any amount up to what's left. Same
///         pull-payment + checks-effects-interactions pattern as Marketplace.sol.
contract RWAUnitMarketplace is Ownable2Step, Pausable, ReentrancyGuard {
    struct Order {
        address seller;
        address asset; // RWAAsset (ERC20) address
        uint256 remainingUnits;
        uint256 pricePerUnit; // KII (wei) per whole unit
        bool active;
    }

    RWAFactory public immutable factory;

    mapping(uint256 => Order) public orders;
    uint256 public nextOrderId = 1;

    mapping(address => uint256) public pendingWithdrawals;

    uint256 public protocolFeeBps = 150; // 1.5%
    uint256 public constant MAX_PROTOCOL_FEE_BPS = 500;
    address public feeRecipient;

    event OrderPlaced(uint256 indexed orderId, address indexed asset, address indexed seller, uint256 units, uint256 pricePerUnit);
    event OrderFilled(uint256 indexed orderId, address indexed buyer, uint256 unitsBought, uint256 kiiPaid);
    event OrderCancelled(uint256 indexed orderId);
    event Withdrawn(address indexed account, uint256 amount);

    error NotRwaAsset();
    error ZeroAmount();
    error OrderNotActive();
    error NotSeller();
    error InsufficientAllowanceOrBalance();
    error TooManyUnitsRequested();
    error InsufficientPayment();
    error FeeTooHigh();
    error ZeroAddress();
    error NothingToWithdraw();
    error WithdrawFailed();

    constructor(address _factory, address _feeRecipient) Ownable(msg.sender) {
        if (_feeRecipient == address(0)) revert ZeroAddress();
        factory = RWAFactory(_factory);
        feeRecipient = _feeRecipient;
    }

    /// @notice List units for sale. Requires prior `asset.approve(marketplace, amount)`.
    ///         Units stay in the seller's wallet until a buyer actually fills the
    ///         order (pull-based custody, same philosophy as the NFT Marketplace's
    ///         setApprovalForAll pattern — the contract never holds funds/tokens
    ///         it doesn't need to).
    function listUnits(address asset, uint256 units, uint256 pricePerUnit) external whenNotPaused returns (uint256 orderId) {
        if (!factory.isRwaAsset(asset)) revert NotRwaAsset();
        if (units == 0 || pricePerUnit == 0) revert ZeroAmount();
        if (IERC20(asset).balanceOf(msg.sender) < units) revert InsufficientAllowanceOrBalance();
        if (IERC20(asset).allowance(msg.sender, address(this)) < units) revert InsufficientAllowanceOrBalance();

        orderId = nextOrderId++;
        orders[orderId] = Order({
            seller: msg.sender,
            asset: asset,
            remainingUnits: units,
            pricePerUnit: pricePerUnit,
            active: true
        });

        emit OrderPlaced(orderId, asset, msg.sender, units, pricePerUnit);
    }

    function cancelOrder(uint256 orderId) external {
        Order storage o = orders[orderId];
        if (!o.active) revert OrderNotActive();
        if (o.seller != msg.sender) revert NotSeller();
        o.active = false;
        emit OrderCancelled(orderId);
    }

    /// @notice Buy up to `units` from an order (partial fill allowed).
    ///         Checks-Effects-Interactions: order state updated before the two
    ///         external calls (ERC20 transferFrom, and — only for the leftover
    ///         KII — a refund). Seller/fee proceeds go through pendingWithdrawals
    ///         (pull), never pushed.
    function buyUnits(uint256 orderId, uint256 units) external payable nonReentrant whenNotPaused {
        Order storage o = orders[orderId];
        if (!o.active) revert OrderNotActive();
        if (units == 0) revert ZeroAmount();
        if (units > o.remainingUnits) revert TooManyUnitsRequested();

        // `units` is an atomic ERC20 amount (18 decimals) but pricePerUnit is
        // KII per WHOLE unit, so divide out the 1e18 scale — same fix as the
        // RWAAsset.contribute() bug, same reason.
        // Round UP so a buyer can never take dust-sized amounts for free
        // (with floor division, 1 wei of units at a normal price costs 0).
        uint256 cost = (units * o.pricePerUnit + 1e18 - 1) / 1e18;
        if (msg.value < cost) revert InsufficientPayment();

        address seller = o.seller;
        address asset = o.asset;

        // --- Effects ---
        o.remainingUnits -= units;
        if (o.remainingUnits == 0) {
            o.active = false;
        }

        uint256 protocolCut = (cost * protocolFeeBps) / 10000;
        uint256 sellerProceeds = cost - protocolCut;
        pendingWithdrawals[seller] += sellerProceeds;
        pendingWithdrawals[feeRecipient] += protocolCut;

        uint256 refund = msg.value - cost;

        emit OrderFilled(orderId, msg.sender, units, cost);

        // --- Interactions ---
        bool ok = IERC20(asset).transferFrom(seller, msg.sender, units);
        require(ok, "unit transfer failed");

        if (refund > 0) {
            (bool sent, ) = msg.sender.call{value: refund}("");
            require(sent, "refund failed");
        }
    }

    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        pendingWithdrawals[msg.sender] = 0;

        (bool sent, ) = msg.sender.call{value: amount}("");
        if (!sent) revert WithdrawFailed();

        emit Withdrawn(msg.sender, amount);
    }

    function setProtocolFeeBps(uint256 newBps) external onlyOwner {
        if (newBps > MAX_PROTOCOL_FEE_BPS) revert FeeTooHigh();
        protocolFeeBps = newBps;
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
