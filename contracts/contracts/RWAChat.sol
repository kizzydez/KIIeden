// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./RWAFactory.sol";

/// @title RWAChat
/// @notice A public discussion board per RWA asset, with no server and no database:
///         every message is an event on-chain, so anyone can read it and nobody can be
///         tracked through an account (a wallet address is the only identity).
///
///         Spam and abuse controls:
///           - only wallets that hold units of the asset can post,
///           - messages are limited to 280 bytes,
///           - a short cooldown between one wallet's posts,
///           - moderators (the owner, plus wallets the owner adds) can HIDE a message.
///             Hiding only flags it so the app stops displaying it: the text itself stays
///             on the blockchain forever, which is inherent to on-chain data.
///
///         Because messages are public and permanent, users must be told not to post
///         personal data (the app says so next to the input).
contract RWAChat is Ownable2Step, Pausable {
    RWAFactory public immutable factory;

    uint256 public constant MAX_LENGTH = 280; // bytes
    uint256 public constant COOLDOWN = 20 seconds;

    uint256 public nextMessageId = 1;
    mapping(uint256 => bool) public hidden;
    mapping(address => bool) public isModerator;
    mapping(address => uint256) public lastPostAt;

    event MessagePosted(address indexed asset, address indexed author, uint256 indexed messageId, string text, uint256 timestamp);
    event MessageHidden(uint256 indexed messageId, bool isHidden);
    event ModeratorSet(address indexed account, bool allowed);

    error NotRwaAsset();
    error NotAHolder();
    error EmptyMessage();
    error MessageTooLong();
    error TooFast();
    error NotModerator();
    error ZeroAddress();

    constructor(address _factory) Ownable(msg.sender) {
        if (_factory == address(0)) revert ZeroAddress();
        factory = RWAFactory(_factory);
    }

    function post(address asset, string calldata text) external whenNotPaused returns (uint256 messageId) {
        uint256 len = bytes(text).length;
        if (len == 0) revert EmptyMessage();
        if (len > MAX_LENGTH) revert MessageTooLong();
        if (!factory.isRwaAsset(asset)) revert NotRwaAsset();
        if (IERC20(asset).balanceOf(msg.sender) == 0) revert NotAHolder();
        if (block.timestamp < lastPostAt[msg.sender] + COOLDOWN) revert TooFast();

        lastPostAt[msg.sender] = block.timestamp;
        messageId = nextMessageId++;
        emit MessagePosted(asset, msg.sender, messageId, text, block.timestamp);
    }

    function setHidden(uint256 messageId, bool isHidden) external {
        if (msg.sender != owner() && !isModerator[msg.sender]) revert NotModerator();
        hidden[messageId] = isHidden;
        emit MessageHidden(messageId, isHidden);
    }

    function setModerator(address account, bool allowed) external onlyOwner {
        isModerator[account] = allowed;
        emit ModeratorSet(account, allowed);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
