// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @dev Implemented by KiiEden collections: true once the mint is over.
interface ITradingGate {
    function tradingOpen() external view returns (bool);
}

/// @title Marketplace
/// @notice Fixed-price listings, offers with escrow, and "Sell Now".
///
///         - LISTING NEEDS NO APPROVAL for KiiEden collections: they report this
///           marketplace as an approved operator (see NFTCollection.isApprovedForAll),
///           so `list` is a single transaction and the NFT stays in the seller's wallet.
///         - MINT FIRST: nothing can be listed, bought or offered on until the
///           collection's mint has ended (`tradingOpen()`).
///         - OFFERS: anyone who does not own the NFT can make an offer by depositing
///           the amount into escrow (this contract). The owner clicks Sell Now to
///           take the best offer: the NFT moves to the bidder and the seller is paid
///           from escrow in the same transaction. Bidders can cancel any time and are
///           refunded from escrow.
///         - Royalties (ERC-2981) and the protocol fee come out of every sale; they use
///           pull payments so a broken receiver can never block a sale.
contract Marketplace is Ownable2Step, Pausable, ReentrancyGuard {
    struct Listing {
        address seller;
        address nft;
        uint256 tokenId;
        uint256 price; // in native KII, wei
        bool active;
    }

    /// @notice listingId => Listing
    mapping(uint256 => Listing) public listings;
    /// @notice nft => tokenId => active listingId (0 = none). listingId 0 is never issued.
    mapping(address => mapping(uint256 => uint256)) public activeListingId;
    uint256 public nextListingId = 1;

    /// @notice Pull-payment balances: anyone owed KII (sellers, royalty
    ///         recipients, protocol fee) withdraws themselves. Never push funds
    ///         inside a state-changing external call.
    mapping(address => uint256) public pendingWithdrawals;

    /// @notice Protocol trade fee in basis points (separate from the flat KII
    ///         creation fee - this is the ongoing marketplace take rate).
    uint256 public protocolFeeBps = 250; // 2.5%
    uint256 public constant MAX_PROTOCOL_FEE_BPS = 500; // hard cap, enforced on-chain
    address public feeRecipient;

    /// @notice Running lifetime volume per NFT collection, in KII wei, for the
    ///         Volume Tracker / Blue Badge threshold ($5,000 USD equivalent).
    mapping(address => uint256) public collectionVolumeKii;

    event Listed(uint256 indexed listingId, address indexed nft, uint256 indexed tokenId, address seller, uint256 price);
    event PriceUpdated(uint256 indexed listingId, uint256 newPrice);
    event Cancelled(uint256 indexed listingId);
    event Sold(uint256 indexed listingId, address indexed buyer, uint256 price);
    event Withdrawn(address indexed account, uint256 amount);
    event ProtocolFeeUpdated(uint256 newBps);
    event FeeRecipientUpdated(address newRecipient);

    error NotSeller();
    error ListingNotActive();
    error InsufficientPayment();
    error ZeroPrice();
    error NotTokenOwner();
    error NotApproved();
    error MintingNotEnded();
    error OfferNotActive();
    error OfferExpired();
    error OfferTooLow();
    error NotBidder();
    error OwnerCannotOffer();
    error BadDuration();
    error TransferFailed();
    error FeeTooHigh();
    error ZeroAddress();
    error NothingToWithdraw();
    error WithdrawFailed();

    // ------------------------------------------------------------------ offers
    struct Offer {
        address bidder;
        address nft;
        uint256 tokenId;
        uint256 amount; // held in escrow by this contract
        uint64 expiresAt;
        bool active;
    }

    mapping(uint256 => Offer) public offers;
    uint256 public nextOfferId = 1;
    uint256 public constant MIN_OFFER_DURATION = 1 hours;
    uint256 public constant MAX_OFFER_DURATION = 30 days;

    event OfferMade(uint256 indexed offerId, address indexed nft, uint256 indexed tokenId, address bidder, uint256 amount, uint64 expiresAt);
    event OfferCancelled(uint256 indexed offerId);
    event OfferAccepted(uint256 indexed offerId, address indexed nft, uint256 indexed tokenId, address seller, address bidder, uint256 price);

    constructor(address _feeRecipient) Ownable(msg.sender) {
        if (_feeRecipient == address(0)) revert ZeroAddress();
        feeRecipient = _feeRecipient;
    }

    /// @notice List an owned NFT at a fixed price. One transaction: KiiEden
    ///         collections approve this marketplace automatically. (A foreign ERC-721
    ///         still needs `setApprovalForAll` first.) The NFT stays in the seller's
    ///         wallet until it sells.
    function list(address nft, uint256 tokenId, uint256 price) external whenNotPaused returns (uint256 listingId) {
        if (price == 0) revert ZeroPrice();
        if (IERC721(nft).ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        _requireTradable(nft);
        if (!IERC721(nft).isApprovedForAll(msg.sender, address(this))) revert NotApproved();

        // BUG FIX: if this token already had an active listing (e.g. it was listed,
        // transferred away and came back, or re-listed at a new price), retire the
        // old one. Otherwise the stale, cheaper listing stays buyable forever.
        uint256 previousId = activeListingId[nft][tokenId];
        if (previousId != 0 && listings[previousId].active) {
            listings[previousId].active = false;
            emit Cancelled(previousId);
        }

        listingId = nextListingId++;
        listings[listingId] = Listing({
            seller: msg.sender,
            nft: nft,
            tokenId: tokenId,
            price: price,
            active: true
        });
        activeListingId[nft][tokenId] = listingId;

        emit Listed(listingId, nft, tokenId, msg.sender, price);
    }

    function updatePrice(uint256 listingId, uint256 newPrice) external whenNotPaused {
        Listing storage l = listings[listingId];
        if (!l.active) revert ListingNotActive();
        if (l.seller != msg.sender) revert NotSeller();
        if (newPrice == 0) revert ZeroPrice();
        l.price = newPrice;
        emit PriceUpdated(listingId, newPrice);
    }

    function cancel(uint256 listingId) external {
        Listing storage l = listings[listingId];
        if (!l.active) revert ListingNotActive();
        if (l.seller != msg.sender) revert NotSeller();
        l.active = false;
        activeListingId[l.nft][l.tokenId] = 0;
        emit Cancelled(listingId);
    }

    /// @notice Buy a listing. Checks-Effects-Interactions: listing is deactivated
    ///         (effects) before the NFT transfer and before any funds move.
    ///         Seller/royalty/protocol funds are credited to pendingWithdrawals
    ///         (pull pattern) rather than pushed, so this function itself only
    ///         performs ONE external interaction — the NFT transfer — inside the
    ///         nonReentrant guard.
    function buy(uint256 listingId) external payable nonReentrant whenNotPaused {
        Listing storage l = listings[listingId];
        if (!l.active) revert ListingNotActive();
        if (msg.value < l.price) revert InsufficientPayment();

        address seller = l.seller;
        address nft = l.nft;
        uint256 tokenId = l.tokenId;
        uint256 price = l.price;

        // Stale listing guard: the seller must still own the token.
        if (IERC721(nft).ownerOf(tokenId) != seller) revert NotTokenOwner();

        // --- Effects ---
        l.active = false;
        activeListingId[nft][tokenId] = 0;

        pendingWithdrawals[seller] += _credit(nft, tokenId, price);

        uint256 refund = msg.value - price;

        // --- Interaction: single external call, transferring the NFT ---
        IERC721(nft).safeTransferFrom(seller, msg.sender, tokenId);

        if (refund > 0) {
            (bool sentRefund, ) = msg.sender.call{value: refund}("");
            require(sentRefund, "refund failed");
        }

        emit Sold(listingId, msg.sender, price);
    }

    // ------------------------------------------------------------------ offers

    /// @notice Make an offer on an NFT you do not own. `msg.value` is deposited into
    ///         escrow immediately. The offer is valid for `duration` seconds.
    function makeOffer(address nft, uint256 tokenId, uint256 duration)
        external
        payable
        nonReentrant
        whenNotPaused
        returns (uint256 offerId)
    {
        if (msg.value == 0) revert ZeroPrice();
        if (duration < MIN_OFFER_DURATION || duration > MAX_OFFER_DURATION) revert BadDuration();
        if (IERC721(nft).ownerOf(tokenId) == msg.sender) revert OwnerCannotOffer();
        _requireTradable(nft);

        offerId = nextOfferId++;
        uint64 expiresAt = uint64(block.timestamp + duration);
        offers[offerId] = Offer({
            bidder: msg.sender,
            nft: nft,
            tokenId: tokenId,
            amount: msg.value,
            expiresAt: expiresAt,
            active: true
        });

        emit OfferMade(offerId, nft, tokenId, msg.sender, msg.value, expiresAt);
    }

    /// @notice Withdraw your offer and get the escrowed KII back immediately.
    ///         Always available (even when the marketplace is paused).
    function cancelOffer(uint256 offerId) external nonReentrant {
        Offer storage o = offers[offerId];
        if (!o.active) revert OfferNotActive();
        if (o.bidder != msg.sender) revert NotBidder();

        uint256 amount = o.amount;
        o.active = false;
        emit OfferCancelled(offerId);

        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    /// @notice SELL NOW - the owner takes an offer. The frontend passes the highest
    ///         active offer; `minAmount` protects the seller if that offer was
    ///         replaced by a lower one in the meantime. In one transaction: the NFT
    ///         goes to the bidder, and the seller is paid from escrow (minus royalty
    ///         and protocol fee).
    function sellNow(uint256 offerId, uint256 minAmount) external nonReentrant whenNotPaused {
        Offer storage o = offers[offerId];
        if (!o.active) revert OfferNotActive();
        if (block.timestamp > o.expiresAt) revert OfferExpired();
        if (o.amount < minAmount) revert OfferTooLow();

        address nft = o.nft;
        uint256 tokenId = o.tokenId;
        address bidder = o.bidder;
        uint256 price = o.amount;

        if (IERC721(nft).ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        _requireTradable(nft);

        // --- effects ---
        o.active = false;
        uint256 listed = activeListingId[nft][tokenId];
        if (listed != 0) {
            if (listings[listed].active) {
                listings[listed].active = false;
                emit Cancelled(listed);
            }
            activeListingId[nft][tokenId] = 0;
        }
        uint256 sellerProceeds = _credit(nft, tokenId, price);

        // --- interactions ---
        IERC721(nft).safeTransferFrom(msg.sender, bidder, tokenId);
        (bool ok, ) = msg.sender.call{value: sellerProceeds}("");
        if (!ok) revert TransferFailed();

        emit OfferAccepted(offerId, nft, tokenId, msg.sender, bidder, price);
    }

    // ---------------------------------------------------------------- internals

    /// @dev Credits the protocol fee and the royalty (pull payments) and returns what
    ///      is left for the seller. Also books the sale volume.
    function _credit(address nft, uint256 tokenId, uint256 price) internal returns (uint256 sellerProceeds) {
        uint256 protocolCut = (price * protocolFeeBps) / 10000;
        uint256 royaltyCut;
        address royaltyReceiver;

        if (IERC165(nft).supportsInterface(type(IERC2981).interfaceId)) {
            (royaltyReceiver, royaltyCut) = ERC2981(nft).royaltyInfo(tokenId, price);
            if (royaltyReceiver == address(0)) royaltyCut = 0;
            // A misbehaving ERC-2981 contract could report a royalty larger than the
            // sale price and make the subtraction below underflow. Clamp it.
            if (royaltyCut > price - protocolCut) royaltyCut = price - protocolCut;
        }

        sellerProceeds = price - protocolCut - royaltyCut;
        pendingWithdrawals[feeRecipient] += protocolCut;
        if (royaltyCut > 0) {
            pendingWithdrawals[royaltyReceiver] += royaltyCut;
        }
        collectionVolumeKii[nft] += price;
    }

    /// @dev Mint-first rule. KiiEden collections expose `tradingOpen()`; anything
    ///      else (a foreign ERC-721) has no mint phase and is always tradable.
    function _requireTradable(address nft) internal view {
        try ITradingGate(nft).tradingOpen() returns (bool open) {
            if (!open) revert MintingNotEnded();
        } catch {}
    }

    /// @notice Withdraw accumulated KII owed to msg.sender (seller proceeds,
    ///         royalties, or protocol fee). Pull pattern: this is the ONLY place
    ///         funds leave the contract to an arbitrary address, and it follows
    ///         checks-effects-interactions (balance zeroed before the call).
    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        pendingWithdrawals[msg.sender] = 0;

        (bool sent, ) = msg.sender.call{value: amount}("");
        if (!sent) revert WithdrawFailed();

        emit Withdrawn(msg.sender, amount);
    }

    // --- Admin ---

    function setProtocolFeeBps(uint256 newBps) external onlyOwner {
        if (newBps > MAX_PROTOCOL_FEE_BPS) revert FeeTooHigh();
        protocolFeeBps = newBps;
        emit ProtocolFeeUpdated(newBps);
    }

    function setFeeRecipient(address newRecipient) external onlyOwner {
        if (newRecipient == address(0)) revert ZeroAddress();
        feeRecipient = newRecipient;
        emit FeeRecipientUpdated(newRecipient);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
