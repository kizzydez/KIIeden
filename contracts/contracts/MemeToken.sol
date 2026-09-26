// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Thin callback so the launchpad always knows who holds a token, even
///         when people move it with a plain `transfer()` outside of buy()/sell().
///         Needed for the 30-day inactivity + holder-count rules in MemeLaunchpad.
interface ILaunchpadHook {
    function onMemeTransfer(address from, address to, uint256 amount) external;
}

/// @title MemeToken
/// @notice Minimal fixed-supply ERC20 deployed by MemeLaunchpad for every fair-launch
///         memecoin. Deliberately boring:
///           - No owner, no admin mint, no pause, no blocklist.
///           - The ENTIRE supply is minted once, to the launchpad itself, at creation.
///             The launchpad then sells it out of its own balance via the bonding
///             curve — nobody (not the creator, not Anthropic^H^H^H^H^H^H^H the
///             platform) can mint more later. That is the anti-rug guarantee that
///             matters most: supply can only ever go down (via liquidation burns),
///             never up.
///           - Sniping bots are never blocked: there is no transfer delay, no bot
///             tax, no blacklist hook. The only restriction is the launchpad's own
///             per-wallet cap during the bonding-curve phase (see MemeLaunchpad).
///           - `burnFrom` is restricted to the launchpad and used ONLY for the
///             30-day-inactivity liquidation flow (see MemeLaunchpad.liquidateBatch),
///             where a holder's balance is bought out at a discount and then burned
///             so the same tokens can't be liquidated twice.
contract MemeToken is ERC20 {
    address public immutable launchpad;

    error NotLaunchpad();

    constructor(string memory name_, string memory symbol_, uint256 totalSupply_) ERC20(name_, symbol_) {
        launchpad = msg.sender;
        _mint(msg.sender, totalSupply_);
    }

    /// @notice Burn `amount` from `holder`. Only ever called by MemeLaunchpad, only
    ///         during liquidation of an inactive token, after the holder has already
    ///         been credited the KII payout as a pull-payment.
    function burnFrom(address holder, uint256 amount) external {
        if (msg.sender != launchpad) revert NotLaunchpad();
        _burn(holder, amount);
    }

    /// @dev Reports every non-mint transfer (including burns) to the launchpad so it
    ///      can keep an accurate holder count. Wrapped in try/catch: a bug or a
    ///      future upgrade on the launchpad side can NEVER brick token transfers —
    ///      the hook is informational only, never a gate.
    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (from != address(0)) {
            try ILaunchpadHook(launchpad).onMemeTransfer(from, to, value) {} catch {}
        }
    }
}
