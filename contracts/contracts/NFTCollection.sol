// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// @title NFTCollection
/// @notice One ERC-721 collection, deployed per creator by CollectionFactory.
///
///         MINT FIRST, TRADE AFTER.
///         1. The creator uploads the art and launches the collection with a mint
///            schedule (start, end), a price per NFT and an optional per-wallet limit.
///         2. Anyone can `publicMint` while the mint is open (the creator shares the
///            minting link). Mint revenue accrues to the collection and is withdrawn
///            by the creator.
///         3. The mint is over when the end time passes, the collection sells out, or
///            the creator calls `endMint()`. Only then does `tradingOpen()` turn true.
///            Until that moment tokens cannot move between wallets at all (enforced in
///            `_update`, so it holds on every marketplace, not just ours) and the
///            KiiEden marketplace refuses to list them or take offers on them.
///
///         WHITELIST + REVEAL.
///         - Optional whitelist: the creator commits a Merkle root of allowed wallets and a
///           window [whitelistStart, whitelistEnd]. Only those wallets can `whitelistMint`
///           during it (optionally at their own price). Public mint opens at `mintStart`.
///         - Optional reveal: until `revealTime`, `tokenURI` returns one shared placeholder
///           for every token; afterwards it returns the real per-token metadata.
///           NOTE: the real base URI is stored on-chain, so this is a display-level reveal
///           (apps and marketplaces show the placeholder), not cryptographic secrecy.
///
///         NO APPROVAL STEP. `isApprovedForAll` reports the KiiEden marketplace as an
///         approved operator for every holder automatically, so listing, buying and
///         "sell now" are single transactions. The marketplace can only move a token
///         inside a listing/offer that the token's current owner created or accepted.
///
///         Metadata lives on IPFS; only the base URI is stored. Royalties via ERC-2981.
contract NFTCollection is ERC721Enumerable, ERC2981, Ownable2Step, Pausable, ReentrancyGuard {
    struct Config {
        string name;
        string symbol;
        string baseURI; // real metadata folder, e.g. ipfs://<cid>/
        string infoURI; // collection.json (banner, links, whitelist list, schedule)
        string placeholderURI; // shown for every token until the reveal (may be empty if no reveal)
        uint256 maxSupply;
        address creator;
        uint96 royaltyBps; // 500 = 5%, capped at 10%
        address marketplace;
        uint256 mintPrice; // wei per NFT in the public mint (0 = free)
        uint64 mintStart; // public mint opens (unix seconds)
        uint64 mintEnd; // mint over; trading opens
        uint256 maxPerWallet; // 0 = unlimited (counts whitelist + public mints)
        bytes32 whitelistRoot; // 0 = no whitelist
        uint64 whitelistStart;
        uint64 whitelistEnd;
        uint256 whitelistPrice; // wei per NFT for whitelisted wallets
        uint64 revealTime; // 0 = revealed from the start
    }

    uint256 public constant MAX_MINT_PER_TX = 50;
    uint256 public constant MAX_RESERVE_PER_TX = 100;

    uint256 public immutable maxSupply;
    address public immutable factory;
    address public immutable marketplace;
    uint256 public immutable mintPrice;
    uint64 public immutable mintStart;
    uint64 public immutable mintEnd;
    uint256 public immutable maxPerWallet;
    bytes32 public immutable whitelistRoot;
    uint64 public immutable whitelistStart;
    uint64 public immutable whitelistEnd;
    uint256 public immutable whitelistPrice;
    uint64 public immutable revealTime;

    string private _baseTokenURI;
    string private _infoURI;
    string private _placeholderURI;
    /// @notice True once the creator revealed early with revealNow().
    bool public revealedEarly;
    bool public metadataFrozen;
    /// @notice True once the creator ended the mint early.
    bool public mintClosed;
    /// @notice Mint revenue the creator has not withdrawn yet.
    uint256 public proceeds;
    mapping(address => uint256) public mintedBy;

    event BaseURIUpdated(string newBaseURI);
    event MetadataFrozen();
    event Minted(address indexed to, uint256 indexed tokenId);
    event MintClosed();
    event ProceedsWithdrawn(uint256 amount);
    event Revealed();

    error SupplyCapReached();
    error MetadataIsFrozen();
    error InvalidRoyalty();
    error ZeroSupply();
    error BadSchedule();
    error BadQuantity();
    error MintNotOpen();
    error MintEnded();
    error WalletLimitReached();
    error InsufficientPayment();
    error RefundFailed();
    error TradingLocked();
    error NothingToWithdraw();
    error WithdrawFailed();
    error WhitelistNotOpen();
    error NotWhitelisted();
    error PlaceholderRequired();
    error AlreadyRevealed();

    constructor(Config memory c) ERC721(c.name, c.symbol) Ownable(c.creator) {
        if (c.royaltyBps > 1000) revert InvalidRoyalty(); // cap creator royalties at 10%
        if (c.maxSupply == 0) revert ZeroSupply();
        if (c.mintEnd <= c.mintStart) revert BadSchedule();
        if (c.whitelistRoot != bytes32(0) && !(c.whitelistEnd > c.whitelistStart && c.whitelistEnd <= c.mintStart)) revert BadSchedule();
        if (c.revealTime != 0 && bytes(c.placeholderURI).length == 0) revert PlaceholderRequired();
        _baseTokenURI = c.baseURI;
        _infoURI = c.infoURI;
        _placeholderURI = c.placeholderURI;
        whitelistRoot = c.whitelistRoot;
        whitelistStart = c.whitelistStart;
        whitelistEnd = c.whitelistEnd;
        whitelistPrice = c.whitelistPrice;
        revealTime = c.revealTime;
        maxSupply = c.maxSupply;
        factory = msg.sender; // always deployed BY CollectionFactory
        marketplace = c.marketplace;
        mintPrice = c.mintPrice;
        mintStart = c.mintStart;
        mintEnd = c.mintEnd;
        maxPerWallet = c.maxPerWallet;
        _setDefaultRoyalty(c.creator, c.royaltyBps);
    }

    // ------------------------------------------------------------------ phases

    /// @notice Minting is live right now.
    function mintOpen() public view returns (bool) {
        return !tradingOpen() && block.timestamp >= mintStart;
    }

    /// @notice The whitelist window is open right now (and a whitelist exists).
    function whitelistOpen() public view returns (bool) {
        return whitelistRoot != bytes32(0) && !tradingOpen() && block.timestamp >= whitelistStart && block.timestamp <= whitelistEnd;
    }

    /// @notice Real metadata is visible (reveal time reached, no reveal configured, or revealed early).
    function revealed() public view returns (bool) {
        return revealedEarly || revealTime == 0 || block.timestamp >= revealTime;
    }

    /// @notice The mint is over (ended, sold out or closed by the creator), so the
    ///         collection can be traded. False while the mint is upcoming or live.
    function tradingOpen() public view returns (bool) {
        return mintClosed || block.timestamp > mintEnd || totalSupply() >= maxSupply;
    }

    // -------------------------------------------------------------------- mint

    /// @notice Public mint - what followers do from the minting link. Overpayment is
    ///         refunded. Reentrancy-guarded (safe-mint calls back into contract wallets).
    function publicMint(uint256 quantity) external payable nonReentrant whenNotPaused {
        if (!mintOpen()) revert MintNotOpen();
        _mintPaid(quantity, mintPrice);
    }

    /// @notice Whitelist mint: only wallets in the creator's whitelist, only during the
    ///         whitelist window. `proof` is the Merkle proof for msg.sender (the app
    ///         builds it from the whitelist file the creator published).
    function whitelistMint(uint256 quantity, bytes32[] calldata proof) external payable nonReentrant whenNotPaused {
        if (!whitelistOpen()) revert WhitelistNotOpen();
        if (!MerkleProof.verifyCalldata(proof, whitelistRoot, keccak256(abi.encodePacked(msg.sender)))) revert NotWhitelisted();
        _mintPaid(quantity, whitelistPrice);
    }

    function _mintPaid(uint256 quantity, uint256 unitPrice) internal {
        if (quantity == 0 || quantity > MAX_MINT_PER_TX) revert BadQuantity();
        if (maxPerWallet != 0 && mintedBy[msg.sender] + quantity > maxPerWallet) revert WalletLimitReached();

        uint256 start = totalSupply();
        if (start + quantity > maxSupply) revert SupplyCapReached();

        uint256 cost = unitPrice * quantity;
        if (msg.value < cost) revert InsufficientPayment();

        // --- effects ---
        mintedBy[msg.sender] += quantity;
        proceeds += cost;

        // --- interactions ---
        for (uint256 i = 0; i < quantity; i++) {
            uint256 tokenId = start + i;
            _safeMint(msg.sender, tokenId);
            emit Minted(msg.sender, tokenId);
        }

        uint256 refund = msg.value - cost;
        if (refund > 0) {
            (bool ok, ) = msg.sender.call{value: refund}("");
            if (!ok) revert RefundFailed();
        }
    }

    /// @notice Creator reserve (team / giveaways). Only while the mint has not ended.
    function reserveMint(address to, uint256 quantity) external onlyOwner whenNotPaused nonReentrant {
        if (quantity == 0 || quantity > MAX_RESERVE_PER_TX) revert BadQuantity();
        if (tradingOpen()) revert MintEnded();
        uint256 start = totalSupply();
        if (start + quantity > maxSupply) revert SupplyCapReached();
        for (uint256 i = 0; i < quantity; i++) {
            uint256 tokenId = start + i;
            _safeMint(to, tokenId);
            emit Minted(to, tokenId);
        }
    }

    /// @notice Creator ends the mint now. This opens trading immediately.
    function endMint() external onlyOwner {
        if (tradingOpen()) revert MintEnded();
        mintClosed = true;
        emit MintClosed();
    }

    /// @notice Creator withdraws mint revenue (pull pattern).
    function withdrawProceeds() external onlyOwner nonReentrant {
        uint256 amount = proceeds;
        if (amount == 0) revert NothingToWithdraw();
        proceeds = 0;
        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) revert WithdrawFailed();
        emit ProceedsWithdrawn(amount);
    }

    // ---------------------------------------------------------------- metadata

    function setBaseURI(string calldata newBaseURI) external onlyOwner {
        if (metadataFrozen) revert MetadataIsFrozen();
        _baseTokenURI = newBaseURI;
        emit BaseURIUpdated(newBaseURI);
    }

    /// @notice Permanently locks metadata (irreversible) - a trust signal for buyers.
    function freezeMetadata() external onlyOwner {
        metadataFrozen = true;
        emit MetadataFrozen();
    }

    /// @notice Collection-level metadata (banner, links, whitelist file, schedule) - the
    ///         OpenSea `contractURI` convention. A separate IPFS file, so it never
    ///         reveals the real token metadata folder.
    function contractURI() external view returns (string memory) {
        return _infoURI;
    }

    /// @notice Creator reveals the real metadata before the scheduled time.
    function revealNow() external onlyOwner {
        if (revealed()) revert AlreadyRevealed();
        revealedEarly = true;
        emit Revealed();
    }

    /// @dev Before the reveal every token shows the same placeholder metadata.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        if (!revealed()) return _placeholderURI;
        return super.tokenURI(tokenId);
    }

    function setDefaultRoyalty(address receiver, uint96 feeBps) external onlyOwner {
        if (feeBps > 1000) revert InvalidRoyalty();
        _setDefaultRoyalty(receiver, feeBps);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    // --------------------------------------------------------------- overrides

    /// @dev The KiiEden marketplace is an approved operator for every holder, so
    ///      nobody ever has to send a separate approval transaction.
    function isApprovedForAll(address owner_, address operator) public view override(ERC721, IERC721) returns (bool) {
        if (operator == marketplace && marketplace != address(0)) return true;
        return super.isApprovedForAll(owner_, operator);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721Enumerable, ERC2981)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    /// @dev Mint-first rule: tokens can be minted (from == 0) at any time, but cannot
    ///      change hands between wallets until the mint is over. Also honours pause.
    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721Enumerable)
        whenNotPaused
        returns (address)
    {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0) && !tradingOpen()) revert TradingLocked();
        return super._update(to, tokenId, auth);
    }
}
