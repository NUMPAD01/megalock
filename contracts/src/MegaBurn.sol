// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title MegaBurn - Token burning contract for MegaETH
/// @notice Allows anyone to permanently burn ERC20 tokens
contract MegaBurn is ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public constant DEAD_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    /// @notice Total amount burned per token address
    mapping(address token => uint256 amount) public totalBurned;

    /// @notice Amount burned per user per token
    mapping(address user => mapping(address token => uint256 amount)) public userBurned;

    event TokensBurned(
        address indexed token,
        address indexed burner,
        uint256 amount
    );

    error ZeroAmount();
    error ZeroAddress();

    /// @notice Burn ERC20 tokens by sending them to the dead address
    /// @param token The ERC20 token to burn
    /// @param amount The amount to burn
    function burn(address token, uint256 amount) external nonReentrant {
        if (token == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        IERC20(token).safeTransferFrom(msg.sender, DEAD_ADDRESS, amount);

        totalBurned[token] += amount;
        userBurned[msg.sender][token] += amount;

        emit TokensBurned(token, msg.sender, amount);
    }

    /// @notice Burn multiple tokens in a single transaction
    /// @param tokens Array of token addresses
    /// @param amounts Array of amounts to burn
    function batchBurn(
        address[] calldata tokens,
        uint256[] calldata amounts
    ) external nonReentrant {
        uint256 len = tokens.length;
        require(len == amounts.length, "Length mismatch");

        for (uint256 i; i < len; ) {
            address token = tokens[i];
            uint256 amount = amounts[i];

            if (token == address(0)) revert ZeroAddress();
            if (amount == 0) revert ZeroAmount();

            IERC20(token).safeTransferFrom(msg.sender, DEAD_ADDRESS, amount);

            totalBurned[token] += amount;
            userBurned[msg.sender][token] += amount;

            emit TokensBurned(token, msg.sender, amount);

            unchecked { ++i; }
        }
    }
}
