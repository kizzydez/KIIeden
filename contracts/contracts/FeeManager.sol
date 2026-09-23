// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title FeeManager
/// @notice Collects the flat protocol-usage fee, denominated directly in native
///         KII, that is charged for creating an NFT or a collection.
///
/// @dev DESIGN NOTE - why this replaced the USD/oracle fee:
///      The previous version priced the fee at "$5 in KII" using a keeper-pushed
///      price. That needed a bot running 24/7; when the price went stale every
///      create/launch button reverted. A flat KII amount has no moving parts:
///      nothing to keep alive, nothing to attack, nothing to go stale.
///
///      Defaults (set at deploy time by scripts/deploy.js):
///        - KiiChain testnet (Oro, 1336): 2 KII
///        - KiiChain mainnet (1783):      1 KII
///      The owner (a multisig on mainnet) can change the fee at any time, up to
///      the hard on-chain ceiling `MAX_FEE` of 50 KII, so a compromised owner key
///      can never set an abusive fee.
contract FeeManager is Ownable2Step, Pausable, ReentrancyGuard {
    /// @notice Hard ceiling for the fee, enforced on-chain: 50 KII.
    uint256 public constant MAX_FEE = 50 ether;

    /// @notice Current fee in wei (native KII has 18 decimals).
    uint256 public platformFee;

    /// @notice Where collected fees are sent.
    address public treasury;

    event FeeUpdated(uint256 oldFee, uint256 newFee);
    event FeeCharged(address indexed payer, address indexed collectedFor, uint256 amountKii);
    event TreasuryChanged(address indexed oldTreasury, address indexed newTreasury);

    error FeeAboveMax(uint256 max, uint256 requested);
    error InsufficientFee(uint256 required, uint256 sent);
    error ZeroAddress();
    error TransferFailed();

    constructor(address _treasury, uint256 _initialFee) Ownable(msg.sender) {
        if (_treasury == address(0)) revert ZeroAddress();
        if (_initialFee > MAX_FEE) revert FeeAboveMax(MAX_FEE, _initialFee);
        treasury = _treasury;
        platformFee = _initialFee;
        emit FeeUpdated(0, _initialFee);
    }

    /// @notice Amount of native KII (wei) required to create an NFT / collection.
    function feeInKii() external view returns (uint256) {
        return platformFee;
    }

    /// @notice Charge the flat fee. Called by CollectionFactory as
    ///         `chargeFee{value: msg.value}(collectedFor, payer)`.
    ///         Reverts on underpayment and refunds any overpayment to `payer`.
    /// @param collectedFor Address the fee is charged for (collection), for indexing.
    /// @param payer The end user to refund any overpayment to. The caller is
    ///        normally an intermediary contract, so `msg.sender` here is NOT the
    ///        user and the refund destination has to be passed explicitly.
    function chargeFee(address collectedFor, address payer)
        external
        payable
        nonReentrant
        whenNotPaused
        returns (uint256 charged)
    {
        uint256 required = platformFee;
        if (msg.value < required) revert InsufficientFee(required, msg.value);
        if (payer == address(0)) revert ZeroAddress();

        charged = required;
        uint256 refund = msg.value - required;

        emit FeeCharged(payer, collectedFor, charged);

        // Interactions last (checks-effects-interactions).
        if (charged > 0) {
            (bool sentTreasury, ) = treasury.call{value: charged}("");
            if (!sentTreasury) revert TransferFailed();
        }

        if (refund > 0) {
            (bool sentRefund, ) = payer.call{value: refund}("");
            if (!sentRefund) revert TransferFailed();
        }
    }

    // --- Admin (Ownable2Step -> transfer to a multisig before mainnet) ---

    /// @notice Change the fee. Bounded by MAX_FEE (50 KII).
    function setFee(uint256 newFee) external onlyOwner {
        if (newFee > MAX_FEE) revert FeeAboveMax(MAX_FEE, newFee);
        emit FeeUpdated(platformFee, newFee);
        platformFee = newFee;
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        emit TreasuryChanged(treasury, newTreasury);
        treasury = newTreasury;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
