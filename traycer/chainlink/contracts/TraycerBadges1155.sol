// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/**
 * @title TraycerBadges1155
 * @notice ERC-1155 SFT + CRE consumer in one contract.
 *         Receives reports from Chainlink CRE via KeystoneForwarder and mints badges.
 *
 *         Badge IDs:
 *           1 = first_return
 *           2 = regular       (≥3 returns)
 *           3 = committed     (≥7 returns)
 *           4 = premium_claim (World ID verified)
 *
 * Report format: abi.encode(address wallet, uint256 badgeId, uint256 totalReturns)
 */

interface IReceiver is IERC165 {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}

contract TraycerBadges1155 is ERC1155, IReceiver, Ownable {
    address public s_forwarderAddress;

    event BadgeMinted(address indexed wallet, uint256 indexed badgeId, uint256 totalReturns);
    event BadgeRedeemed(address indexed wallet, uint256 indexed badgeId);
    event ForwarderUpdated(address indexed previous, address indexed current);

    error InvalidSender(address sender, address expected);
    error InvalidBadgeId(uint256 badgeId);
    error NoBadgeToRedeem(uint256 badgeId);

    constructor(
        address _forwarderAddress
    ) ERC1155("https://traycer.xyz/api/badges/{id}.json") Ownable(msg.sender) {
        s_forwarderAddress = _forwarderAddress;
        emit ForwarderUpdated(address(0), _forwarderAddress);
    }

    // ── CRE consumer ──

    function onReport(bytes calldata, bytes calldata report) external override(IReceiver) {
        if (s_forwarderAddress != address(0) && msg.sender != s_forwarderAddress) {
            revert InvalidSender(msg.sender, s_forwarderAddress);
        }

        (address wallet, uint256 badgeId, uint256 totalReturns) = abi.decode(
            report,
            (address, uint256, uint256)
        );

        if (badgeId == 0 || badgeId > 4) revert InvalidBadgeId(badgeId);

        _mint(wallet, badgeId, 1, "");

        emit BadgeMinted(wallet, badgeId, totalReturns);
    }

    // ── Admin ──

    function setForwarderAddress(address _forwarder) external onlyOwner {
        address prev = s_forwarderAddress;
        s_forwarderAddress = _forwarder;
        emit ForwarderUpdated(prev, _forwarder);
    }

    function adminMint(address to, uint256 badgeId, uint256 amount) external onlyOwner {
        if (badgeId == 0 || badgeId > 4) revert InvalidBadgeId(badgeId);
        _mint(to, badgeId, amount, "");
    }

    // ── Public mint (used after off-chain World ID verification) ──

    function mintBadge(uint256 badgeId) external {
        if (badgeId == 0 || badgeId > 4) revert InvalidBadgeId(badgeId);
        _mint(msg.sender, badgeId, 1, "");
        emit BadgeMinted(msg.sender, badgeId, 0);
    }

    // ── Redeem (burn) ──

    function redeemBadge(uint256 badgeId) external {
        if (balanceOf(msg.sender, badgeId) == 0) revert NoBadgeToRedeem(badgeId);
        _burn(msg.sender, badgeId, 1);
        emit BadgeRedeemed(msg.sender, badgeId);
    }

    // ── Demo reset (owner only) ──

    function resetWallet(address wallet) external onlyOwner {
        for (uint256 id = 1; id <= 4; id++) {
            uint256 bal = balanceOf(wallet, id);
            if (bal > 0) {
                _burn(wallet, id, bal);
            }
        }
    }

    // ── ERC165 ──

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC1155, IERC165) returns (bool) {
        return
            interfaceId == type(IReceiver).interfaceId ||
            super.supportsInterface(interfaceId);
    }
}
