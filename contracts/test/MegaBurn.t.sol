// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {MegaBurn} from "../src/MegaBurn.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract MegaBurnTest is Test {
    MegaBurn public megaBurn;
    MockERC20 public token;
    address public user = makeAddr("user");

    function setUp() public {
        megaBurn = new MegaBurn();
        token = new MockERC20("Test Token", "TT");
        token.mint(user, 1_000_000 ether);
    }

    function test_burn() public {
        vm.startPrank(user);
        token.approve(address(megaBurn), 100 ether);
        megaBurn.burn(address(token), 100 ether);
        vm.stopPrank();

        assertEq(megaBurn.totalBurned(address(token)), 100 ether);
        assertEq(megaBurn.userBurned(user, address(token)), 100 ether);
        assertEq(token.balanceOf(megaBurn.DEAD_ADDRESS()), 100 ether);
        assertEq(token.balanceOf(user), 999_900 ether);
    }

    function test_burn_revert_ZeroAmount() public {
        vm.prank(user);
        vm.expectRevert(MegaBurn.ZeroAmount.selector);
        megaBurn.burn(address(token), 0);
    }

    function test_burn_revert_ZeroAddress() public {
        vm.prank(user);
        vm.expectRevert(MegaBurn.ZeroAddress.selector);
        megaBurn.burn(address(0), 100 ether);
    }

    function test_batchBurn() public {
        MockERC20 token2 = new MockERC20("Token 2", "T2");
        token2.mint(user, 500_000 ether);

        vm.startPrank(user);
        token.approve(address(megaBurn), 50 ether);
        token2.approve(address(megaBurn), 25 ether);

        address[] memory tokens = new address[](2);
        tokens[0] = address(token);
        tokens[1] = address(token2);

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 50 ether;
        amounts[1] = 25 ether;

        megaBurn.batchBurn(tokens, amounts);
        vm.stopPrank();

        assertEq(megaBurn.totalBurned(address(token)), 50 ether);
        assertEq(megaBurn.totalBurned(address(token2)), 25 ether);
    }

    function test_batchBurn_revert_lengthMismatch() public {
        address[] memory tokens = new address[](2);
        uint256[] memory amounts = new uint256[](1);

        vm.prank(user);
        vm.expectRevert("Length mismatch");
        megaBurn.batchBurn(tokens, amounts);
    }

    function test_multipleBurns_accumulate() public {
        vm.startPrank(user);
        token.approve(address(megaBurn), 200 ether);
        megaBurn.burn(address(token), 100 ether);
        megaBurn.burn(address(token), 100 ether);
        vm.stopPrank();

        assertEq(megaBurn.totalBurned(address(token)), 200 ether);
        assertEq(megaBurn.userBurned(user, address(token)), 200 ether);
    }
}
