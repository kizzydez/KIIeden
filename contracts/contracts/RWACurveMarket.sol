// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./RWAFactory.sol";
import "./RWAAsset.sol";

/// @title RWACurveMarket
/// @notice Demand-and-supply trading for RWA units once their IPO has ended.
///
///         Each asset gets ONE liquidity pool holding KII and units, priced by the
///         constant-product curve  kiiReserve * unitReserve = k.
///           - Buying pulls units out of the pool and pushes KII in: the price RISES
///             (a pump). A large buy moves the price more than a small one.
///           - Selling pushes units in and pulls KII out: the price FALLS (a dump).
///           - Every trade emits `Trade` with the price after it, which is exactly what
///             a candlestick chart needs (open/high/low/close per time bucket).
///
///         Why this is safe: the curve can only ever pay out KII that is really in the
///         pool, and it never lets a reserve reach zero, so it cannot be drained or
///         left insolvent. Slippage limits on every trade protect against sandwiching.
///
///         Opening the market: the first liquidity provider deposits KII + units and
///         thereby sets the opening price (it must be within 0.25x - 4x of the IPO
///         price, so a bad actor can't open a wildly mispriced pool). After that anyone
///         can add liquidity at the current ratio and earns the 0.3% LP fee (fees stay
///         in the pool and are collected when liquidity is removed). A small protocol
///         fee goes to the platform.
///
///         Units can't move before the IPO ends (RWAAsset enforces it), so this
///         market only works after the IPO.
contract RWACurveMarket is Ownable2Step, Pausable, ReentrancyGuard {
    struct Pool {
        uint256 kiiReserve;
        uint256 unitReserve;
        uint256 totalShares;
    }

    RWAFactory public immutable factory;

    mapping(address => Pool) public pools;
    mapping(address => mapping(address => uint256)) public shares; // asset => provider => LP shares

    /// @notice Pull-payment balance for the protocol fee.
    mapping(address => uint256) public pendingWithdrawals;

    uint256 public constant LP_FEE_BPS = 30; // 0.30% stays in the pool for liquidity providers
    uint256 public constant MAX_PROTOCOL_FEE_BPS = 100;
    uint256 public protocolFeeBps = 20; // 0.20% to the platform
    address public feeRecipient;
    uint256 public constant MINIMUM_LIQUIDITY = 1000; // permanently locked on the first deposit

    event Trade(
        address indexed asset,
        address indexed trader,
        bool isBuy,
        uint256 kiiAmount,
        uint256 unitAmount,
        uint256 priceAfter,
        uint256 timestamp
    );
    event LiquidityAdded(address indexed asset, address indexed provider, uint256 kiiAmount, uint256 unitAmount, uint256 sharesMinted, uint256 priceAfter);
    event LiquidityRemoved(address indexed asset, address indexed provider, uint256 kiiAmount, uint256 unitAmount, uint256 sharesBurned, uint256 priceAfter);
    event Withdrawn(address indexed account, uint256 amount);

    error NotRwaAsset();
    error IpoNotEnded();
    error NoMarket();
    error ZeroAmount();
    error PriceOutOfBand();
    error SlippageExceeded();
    error InsufficientShares();
    error TransferFailed();
    error FeeTooHigh();
    error ZeroAddress();
    error NothingToWithdraw();

    constructor(address _factory, address _feeRecipient) Ownable(msg.sender) {
        if (_factory == address(0) || _feeRecipient == address(0)) revert ZeroAddress();
        factory = RWAFactory(_factory);
        feeRecipient = _feeRecipient;
    }

    // ---------------------------------------------------------------- views

    /// @notice KII (wei) per WHOLE unit at the current pool ratio; 0 if no market yet.
    function price(address asset) public view returns (uint256) {
        Pool storage p = pools[asset];
        if (p.unitReserve == 0) return 0;
        return (p.kiiReserve * 1e18) / p.unitReserve;
    }

    /// @notice Units you would receive for `kiiIn`, after fees (mirrors buy()).
    function quoteBuy(address asset, uint256 kiiIn) external view returns (uint256 unitsOut) {
        Pool storage p = pools[asset];
        if (p.totalShares == 0) return 0;
        (unitsOut, , ) = _buyMath(p.kiiReserve, p.unitReserve, kiiIn);
    }

    /// @notice KII you would receive for selling `unitsIn`, after fees (mirrors sell()).
    function quoteSell(address asset, uint256 unitsIn) external view returns (uint256 kiiOut) {
        Pool storage p = pools[asset];
        if (p.totalShares == 0) return 0;
        (kiiOut, , ) = _sellMath(p.kiiReserve, p.unitReserve, unitsIn);
    }

    // ----------------------------------------------------------- liquidity

    /// @notice Add liquidity. `msg.value` is the KII side; the matching amount of units
    ///         is pulled from you (approve this contract for the units first). The
    ///         first deposit sets the opening price and needs `unitsMax` = the exact
    ///         amount of units to seed.
    function addLiquidity(address asset, uint256 unitsMax, uint256 minShares)
        external
        payable
        nonReentrant
        whenNotPaused
        returns (uint256 sharesMinted)
    {
        _checkAsset(asset);
        if (msg.value == 0 || unitsMax == 0) revert ZeroAmount();

        Pool storage p = pools[asset];
        uint256 unitsUsed;

        if (p.totalShares == 0) {
            unitsUsed = unitsMax;
            uint256 openingPrice = (msg.value * 1e18) / unitsUsed;
            uint256 ipoPrice = RWAAsset(asset).pricePerUnit();
            if (openingPrice < ipoPrice / 4 || openingPrice > ipoPrice * 4) revert PriceOutOfBand();
            uint256 root = _sqrt(msg.value * unitsUsed);
            if (root <= MINIMUM_LIQUIDITY) revert ZeroAmount();
            sharesMinted = root - MINIMUM_LIQUIDITY;
            p.totalShares = root; // MINIMUM_LIQUIDITY of it belongs to nobody, forever
        } else {
            unitsUsed = (msg.value * p.unitReserve + p.kiiReserve - 1) / p.kiiReserve; // round up
            if (unitsUsed > unitsMax) revert SlippageExceeded();
            sharesMinted = (msg.value * p.totalShares) / p.kiiReserve;
            p.totalShares += sharesMinted;
        }
        if (sharesMinted == 0 || sharesMinted < minShares) revert SlippageExceeded();

        p.kiiReserve += msg.value;
        p.unitReserve += unitsUsed;
        shares[asset][msg.sender] += sharesMinted;

        if (!IERC20(asset).transferFrom(msg.sender, address(this), unitsUsed)) revert TransferFailed();

        emit LiquidityAdded(asset, msg.sender, msg.value, unitsUsed, sharesMinted, price(asset));
    }

    /// @notice Remove liquidity: burn shares, receive your share of both reserves.
    ///         Works even while the market is paused so nobody is ever locked in.
    function removeLiquidity(address asset, uint256 sharesToBurn, uint256 minKii, uint256 minUnits) external nonReentrant {
        Pool storage p = pools[asset];
        if (sharesToBurn == 0) revert ZeroAmount();
        if (shares[asset][msg.sender] < sharesToBurn) revert InsufficientShares();

        uint256 kiiOut = (sharesToBurn * p.kiiReserve) / p.totalShares;
        uint256 unitsOut = (sharesToBurn * p.unitReserve) / p.totalShares;
        if (kiiOut < minKii || unitsOut < minUnits) revert SlippageExceeded();

        shares[asset][msg.sender] -= sharesToBurn;
        p.totalShares -= sharesToBurn;
        p.kiiReserve -= kiiOut;
        p.unitReserve -= unitsOut;

        emit LiquidityRemoved(asset, msg.sender, kiiOut, unitsOut, sharesToBurn, price(asset));

        if (unitsOut > 0 && !IERC20(asset).transfer(msg.sender, unitsOut)) revert TransferFailed();
        if (kiiOut > 0) {
            (bool ok, ) = msg.sender.call{value: kiiOut}("");
            if (!ok) revert TransferFailed();
        }
    }

    // ------------------------------------------------------------- trading

    /// @notice BUY units with KII (`msg.value`). Demand pushes the price up.
    function buy(address asset, uint256 minUnitsOut) external payable nonReentrant whenNotPaused {
        _checkAsset(asset);
        Pool storage p = pools[asset];
        if (p.totalShares == 0) revert NoMarket();
        if (msg.value == 0) revert ZeroAmount();

        (uint256 unitsOut, uint256 protocolFee, uint256 net) = _buyMath(p.kiiReserve, p.unitReserve, msg.value);
        if (unitsOut == 0 || unitsOut < minUnitsOut) revert SlippageExceeded();

        // --- effects ---
        p.kiiReserve += net;
        p.unitReserve -= unitsOut;
        pendingWithdrawals[feeRecipient] += protocolFee;
        emit Trade(asset, msg.sender, true, msg.value, unitsOut, price(asset), block.timestamp);

        // --- interaction ---
        if (!IERC20(asset).transfer(msg.sender, unitsOut)) revert TransferFailed();
    }

    /// @notice SELL `unitsIn` units for KII (approve this contract first). Supply pushes
    ///         the price down.
    function sell(address asset, uint256 unitsIn, uint256 minKiiOut) external nonReentrant whenNotPaused {
        _checkAsset(asset);
        Pool storage p = pools[asset];
        if (p.totalShares == 0) revert NoMarket();
        if (unitsIn == 0) revert ZeroAmount();

        (uint256 kiiOut, uint256 protocolFee, uint256 gross) = _sellMath(p.kiiReserve, p.unitReserve, unitsIn);
        if (kiiOut == 0 || kiiOut < minKiiOut) revert SlippageExceeded();

        // --- effects ---
        p.unitReserve += unitsIn;
        p.kiiReserve -= gross;
        pendingWithdrawals[feeRecipient] += protocolFee;
        emit Trade(asset, msg.sender, false, kiiOut, unitsIn, price(asset), block.timestamp);

        // --- interactions ---
        if (!IERC20(asset).transferFrom(msg.sender, address(this), unitsIn)) revert TransferFailed();
        (bool ok, ) = msg.sender.call{value: kiiOut}("");
        if (!ok) revert TransferFailed();
    }

    // ------------------------------------------------------------ internals

    /// @dev buy: protocol fee comes off the top, then the LP fee is applied to the
    ///      input like Uniswap v2. Returns (unitsOut, protocolFee, netKiiAddedToPool).
    function _buyMath(uint256 kiiReserve, uint256 unitReserve, uint256 kiiIn)
        internal
        view
        returns (uint256 unitsOut, uint256 protocolFee, uint256 net)
    {
        protocolFee = (kiiIn * protocolFeeBps) / 10000;
        net = kiiIn - protocolFee;
        uint256 netAfterLp = net * (10000 - LP_FEE_BPS);
        unitsOut = (netAfterLp * unitReserve) / (kiiReserve * 10000 + netAfterLp);
    }

    /// @dev sell: LP fee on the units in, protocol fee on the KII out.
    ///      Returns (kiiToSeller, protocolFee, grossKiiLeavingPool).
    function _sellMath(uint256 kiiReserve, uint256 unitReserve, uint256 unitsIn)
        internal
        view
        returns (uint256 kiiOut, uint256 protocolFee, uint256 gross)
    {
        uint256 inAfterLp = unitsIn * (10000 - LP_FEE_BPS);
        gross = (inAfterLp * kiiReserve) / (unitReserve * 10000 + inAfterLp);
        protocolFee = (gross * protocolFeeBps) / 10000;
        kiiOut = gross - protocolFee;
    }

    function _checkAsset(address asset) internal view {
        if (!factory.isRwaAsset(asset)) revert NotRwaAsset();
        if (!RWAAsset(asset).ipoEnded()) revert IpoNotEnded();
    }

    function _sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }

    // ---------------------------------------------------------------- admin

    /// @notice Pull-payment withdrawal of the protocol fee.
    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        pendingWithdrawals[msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
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
