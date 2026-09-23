// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./NFTCollection.sol";
import "./FeeManager.sol";

/// @title CollectionFactory
/// @notice Launchpad entry point. A creator uploads art to IPFS, calls
///         `createCollection` once (paying the flat protocol fee via FeeManager) and
///         gets a collection whose public mint is scheduled between `mintStart` and
///         `mintEnd`. Followers then mint from the minting link; trading opens after
///         the mint ends (see NFTCollection).
///
///         The same call covers a "single NFT" (maxSupply = 1, or a small edition)
///         and a full collection (maxSupply = N, any size - nothing is minted up
///         front, so there is no gas-limit ceiling on collection size).
contract CollectionFactory is Ownable2Step, Pausable {
    FeeManager public immutable feeManager;
    /// @notice KiiEden Marketplace: made an automatic operator on every collection so
    ///         that listing needs no approval transaction.
    address public immutable marketplace;

    address[] public allCollections;
    mapping(address => address[]) public collectionsByCreator;
    mapping(address => bool) public isCollection;

    event CollectionCreated(
        address indexed collection,
        address indexed creator,
        string name,
        string symbol,
        uint256 maxSupply
    );

    error ZeroSupply();
    error BadSchedule();
    error ZeroAddress();

    constructor(address _feeManager, address _marketplace) Ownable(msg.sender) {
        if (_feeManager == address(0) || _marketplace == address(0)) revert ZeroAddress();
        feeManager = FeeManager(_feeManager);
        marketplace = _marketplace;
    }

    struct CreateParams {
        string name;
        string symbol;
        string baseURI;
        string infoURI;
        string placeholderURI;
        uint256 maxSupply;
        uint96 royaltyBps;
        uint256 mintPrice;
        uint64 mintStart; // 0 = public mint starts immediately
        uint64 mintEnd;
        uint256 maxPerWallet; // 0 = unlimited
        bytes32 whitelistRoot; // 0 = no whitelist
        uint64 whitelistStart; // 0 = whitelist opens immediately (only meaningful with a whitelist)
        uint64 whitelistEnd; // must be <= the public mint start
        uint256 whitelistPrice;
        uint64 revealTime; // 0 = revealed from the start; else must be in the future
    }

    function createCollection(CreateParams calldata p) external payable whenNotPaused returns (address collection) {
        if (p.maxSupply == 0) revert ZeroSupply();
        uint64 start = p.mintStart == 0 ? uint64(block.timestamp) : p.mintStart;
        if (p.mintEnd <= start || p.mintEnd <= block.timestamp) revert BadSchedule();

        uint64 wlStart = p.whitelistStart;
        if (p.whitelistRoot != bytes32(0)) {
            if (wlStart == 0) wlStart = uint64(block.timestamp);
            if (p.whitelistEnd <= wlStart || p.whitelistEnd > start) revert BadSchedule();
        }
        if (p.revealTime != 0 && p.revealTime <= block.timestamp) revert BadSchedule();

        // Fee first: it forwards the fee to the treasury and refunds any excess
        // directly to msg.sender (the creator), so it is settled before we deploy.
        feeManager.chargeFee{value: msg.value}(address(0), msg.sender);

        NFTCollection.Config memory cfg = NFTCollection.Config({
            name: p.name,
            symbol: p.symbol,
            baseURI: p.baseURI,
            infoURI: p.infoURI,
            placeholderURI: p.placeholderURI,
            maxSupply: p.maxSupply,
            creator: msg.sender,
            royaltyBps: p.royaltyBps,
            marketplace: marketplace,
            mintPrice: p.mintPrice,
            mintStart: start,
            mintEnd: p.mintEnd,
            maxPerWallet: p.maxPerWallet,
            whitelistRoot: p.whitelistRoot,
            whitelistStart: wlStart,
            whitelistEnd: p.whitelistEnd,
            whitelistPrice: p.whitelistPrice,
            revealTime: p.revealTime
        });
        collection = address(new NFTCollection(cfg));

        allCollections.push(collection);
        collectionsByCreator[msg.sender].push(collection);
        isCollection[collection] = true;

        emit CollectionCreated(collection, msg.sender, p.name, p.symbol, p.maxSupply);
    }

    function totalCollections() external view returns (uint256) {
        return allCollections.length;
    }

    function getCreatorCollections(address creator) external view returns (address[] memory) {
        return collectionsByCreator[creator];
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
