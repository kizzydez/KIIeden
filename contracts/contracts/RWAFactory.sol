// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./RWAAsset.sol";

/// @title RWAFactory
/// @notice The ONLY way a new real-world asset gets listed on the platform.
///         `createAsset` is `onlyOwner` — restrict ownership to your ops
///         multisig. This is intentionally centralized: unlike NFT collections
///         (anyone can launch one), real-world assets need off-chain legal
///         verification (custody, title, valuation) before they belong on
///         chain at all, so listing them is an admin action, not a public one.
contract RWAFactory is Ownable2Step, Pausable {
    address[] public allAssets;
    mapping(address => bool) public isRwaAsset;
    /// @notice Extra admin wallets allowed to list assets (the owner always is).
    mapping(address => bool) public isAdmin;

    event AssetCreated(
        address indexed asset,
        string name,
        string symbol,
        uint256 totalUnits,
        uint256 pricePerUnit,
        uint256 ipoStartTime,
        uint256 ipoEndTime,
        address assetTreasury
    );
    event AdminSet(address indexed account, bool allowed);

    error NotAdmin();
    error BadIpoStart();

    modifier onlyAdmin() {
        if (msg.sender != owner() && !isAdmin[msg.sender]) revert NotAdmin();
        _;
    }

    constructor() Ownable(msg.sender) {}

    /// @notice Owner grants or revokes admin (asset-listing) rights for a wallet.
    function setAdmin(address account, bool allowed) external onlyOwner {
        isAdmin[account] = allowed;
        emit AdminSet(account, allowed);
    }

    /// @notice Admin-only: list a new real-world asset and open its IPO.
    /// @param name_ ERC20 name, e.g. "123 Main St Fractional Units"
    /// @param symbol_ ERC20 symbol, e.g. "MAIN123"
    /// @param totalUnits_ Total fractional units for sale (18 decimals, like any ERC20 amount)
    /// @param pricePerUnit_ KII (wei) per whole unit
    /// @param ipoStart_ Unix time the IPO opens; 0 = open immediately (a future time = "upcoming IPO")
    /// @param ipoDuration_ Seconds the IPO stays open, counted from its start
    /// @param assetTreasury_ Address (ideally a multisig) that receives IPO proceeds — the legal custodian of the asset
    /// @param assetMetadataURI_ IPFS URI to the asset's legal/valuation documentation
    function createAsset(
        string calldata name_,
        string calldata symbol_,
        uint256 totalUnits_,
        uint256 pricePerUnit_,
        uint256 ipoStart_,
        uint256 ipoDuration_,
        address assetTreasury_,
        string calldata assetMetadataURI_
    ) external onlyAdmin whenNotPaused returns (address asset) {
        require(totalUnits_ > 0, "zero supply");
        require(pricePerUnit_ > 0, "zero price");
        if (ipoStart_ != 0 && ipoStart_ < block.timestamp) revert BadIpoStart();
        uint256 startTs = ipoStart_ == 0 ? block.timestamp : ipoStart_;

        asset = address(
            new RWAAsset(
                name_,
                symbol_,
                totalUnits_,
                pricePerUnit_,
                ipoStart_,
                ipoDuration_,
                owner(), // admin retains control of the asset contract (pause, treasury updates)
                assetTreasury_,
                assetMetadataURI_
            )
        );

        allAssets.push(asset);
        isRwaAsset[asset] = true;

        emit AssetCreated(
            asset,
            name_,
            symbol_,
            totalUnits_,
            pricePerUnit_,
            startTs,
            startTs + ipoDuration_,
            assetTreasury_
        );
    }

    function totalAssets() external view returns (uint256) {
        return allAssets.length;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
