// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {MegaLock} from "../src/MegaLock.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract MegaLockTest is Test {
    MegaLock public megaLock;
    MockERC20 public token;

    address public creator = makeAddr("creator");
    address public beneficiary = makeAddr("beneficiary");

    uint256 public constant LOCK_AMOUNT = 10_000 ether;

    function setUp() public {
        megaLock = new MegaLock();
        token = new MockERC20("Test Token", "TT");
        token.mint(creator, 1_000_000 ether);

        vm.prank(creator);
        token.approve(address(megaLock), type(uint256).max);
    }

    // ═══════════════════════════════════════════════════════════════════
    //                         TIMELOCK TESTS
    // ═══════════════════════════════════════════════════════════════════

    function test_timelock_create() public {
        uint64 unlockTime = uint64(block.timestamp + 365 days);

        vm.prank(creator);
        uint256 lockId = megaLock.createTimeLock(
            address(token), beneficiary, LOCK_AMOUNT, unlockTime, true
        );

        MegaLock.Lock memory lock = megaLock.getLock(lockId);
        assertEq(lock.token, address(token));
        assertEq(lock.creator, creator);
        assertEq(lock.beneficiary, beneficiary);
        assertEq(lock.totalAmount, LOCK_AMOUNT);
        assertEq(lock.claimedAmount, 0);
        assertEq(uint8(lock.lockType), uint8(MegaLock.LockType.Timelock));
        assertEq(lock.endTime, unlockTime);
        assertTrue(lock.cancelable);
        assertFalse(lock.cancelled);
    }

    function test_timelock_claim_before_unlock_reverts() public {
        uint64 unlockTime = uint64(block.timestamp + 365 days);

        vm.prank(creator);
        uint256 lockId = megaLock.createTimeLock(
            address(token), beneficiary, LOCK_AMOUNT, unlockTime, false
        );

        vm.prank(beneficiary);
        vm.expectRevert(MegaLock.NothingToClaim.selector);
        megaLock.claim(lockId);
    }

    function test_timelock_claim_after_unlock() public {
        uint64 unlockTime = uint64(block.timestamp + 365 days);

        vm.prank(creator);
        uint256 lockId = megaLock.createTimeLock(
            address(token), beneficiary, LOCK_AMOUNT, unlockTime, false
        );

        // Fast forward past unlock
        vm.warp(unlockTime + 1);

        vm.prank(beneficiary);
        megaLock.claim(lockId);

        assertEq(token.balanceOf(beneficiary), LOCK_AMOUNT);
        assertEq(megaLock.getClaimableAmount(lockId), 0);
    }

    function test_timelock_cancel() public {
        uint64 unlockTime = uint64(block.timestamp + 365 days);

        vm.prank(creator);
        uint256 lockId = megaLock.createTimeLock(
            address(token), beneficiary, LOCK_AMOUNT, unlockTime, true
        );

        uint256 creatorBefore = token.balanceOf(creator);

        vm.prank(creator);
        megaLock.cancel(lockId);

        // All tokens returned since nothing vested yet
        assertEq(token.balanceOf(creator), creatorBefore + LOCK_AMOUNT);
        assertTrue(megaLock.getLock(lockId).cancelled);
    }

    function test_timelock_cancel_notCancelable_reverts() public {
        uint64 unlockTime = uint64(block.timestamp + 365 days);

        vm.prank(creator);
        uint256 lockId = megaLock.createTimeLock(
            address(token), beneficiary, LOCK_AMOUNT, unlockTime, false
        );

        vm.prank(creator);
        vm.expectRevert(MegaLock.NotCancelable.selector);
        megaLock.cancel(lockId);
    }

    function test_timelock_revert_pastUnlockTime() public {
        vm.prank(creator);
        vm.expectRevert(MegaLock.InvalidTimestamps.selector);
        megaLock.createTimeLock(
            address(token), beneficiary, LOCK_AMOUNT, uint64(block.timestamp), false
        );
    }

    // ═══════════════════════════════════════════════════════════════════
    //                      LINEAR VESTING TESTS
    // ═══════════════════════════════════════════════════════════════════

    function test_linear_create() public {
        uint64 start = uint64(block.timestamp);
        uint64 cliff = uint64(block.timestamp + 180 days);
        uint64 end = uint64(block.timestamp + 730 days);

        vm.prank(creator);
        uint256 lockId = megaLock.createLinearVesting(
            address(token), beneficiary, LOCK_AMOUNT, start, cliff, end, true
        );

        MegaLock.Lock memory lock = megaLock.getLock(lockId);
        assertEq(uint8(lock.lockType), uint8(MegaLock.LockType.LinearVesting));
        assertEq(lock.startTime, start);
        assertEq(lock.cliffTime, cliff);
        assertEq(lock.endTime, end);
    }

    function test_linear_before_cliff_nothing_vested() public {
        uint64 start = uint64(block.timestamp);
        uint64 cliff = uint64(block.timestamp + 180 days);
        uint64 end = uint64(block.timestamp + 730 days);

        vm.prank(creator);
        uint256 lockId = megaLock.createLinearVesting(
            address(token), beneficiary, LOCK_AMOUNT, start, cliff, end, false
        );

        // Warp to just before cliff
        vm.warp(cliff - 1);
        assertEq(megaLock.getVestedAmount(lockId), 0);
        assertEq(megaLock.getClaimableAmount(lockId), 0);
    }

    function test_linear_at_cliff_partial_vested() public {
        uint64 start = uint64(block.timestamp);
        uint64 cliff = uint64(block.timestamp + 180 days);
        uint64 end = uint64(block.timestamp + 730 days);

        vm.prank(creator);
        uint256 lockId = megaLock.createLinearVesting(
            address(token), beneficiary, LOCK_AMOUNT, start, cliff, end, false
        );

        vm.warp(cliff);
        uint256 vested = megaLock.getVestedAmount(lockId);
        // 180 / 730 of total
        uint256 expected = (LOCK_AMOUNT * 180 days) / 730 days;
        assertEq(vested, expected);
    }

    function test_linear_progressive_claim() public {
        uint64 start = uint64(block.timestamp);
        uint64 end = uint64(block.timestamp + 1000 days);

        vm.prank(creator);
        uint256 lockId = megaLock.createLinearVesting(
            address(token), beneficiary, LOCK_AMOUNT, start, 0, end, false
        );

        // Claim at 50%
        vm.warp(start + 500 days);
        uint256 vested50 = megaLock.getClaimableAmount(lockId);
        assertApproxEqAbs(vested50, LOCK_AMOUNT / 2, 1 ether);

        vm.prank(beneficiary);
        megaLock.claim(lockId);
        assertApproxEqAbs(token.balanceOf(beneficiary), LOCK_AMOUNT / 2, 1 ether);

        // Claim remaining at 100%
        vm.warp(end);
        vm.prank(beneficiary);
        megaLock.claim(lockId);
        assertEq(token.balanceOf(beneficiary), LOCK_AMOUNT);
    }

    function test_linear_after_end_full_vested() public {
        uint64 start = uint64(block.timestamp);
        uint64 end = uint64(block.timestamp + 365 days);

        vm.prank(creator);
        uint256 lockId = megaLock.createLinearVesting(
            address(token), beneficiary, LOCK_AMOUNT, start, 0, end, false
        );

        vm.warp(end + 100 days);
        assertEq(megaLock.getVestedAmount(lockId), LOCK_AMOUNT);
    }

    function test_linear_noCliff() public {
        uint64 start = uint64(block.timestamp);
        uint64 end = uint64(block.timestamp + 365 days);

        vm.prank(creator);
        uint256 lockId = megaLock.createLinearVesting(
            address(token), beneficiary, LOCK_AMOUNT, start, 0, end, false
        );

        // Should vest from day 1 (no cliff)
        vm.warp(start + 1 days);
        uint256 vested = megaLock.getVestedAmount(lockId);
        assertTrue(vested > 0);
    }

    function test_linear_cancel_midway() public {
        uint64 start = uint64(block.timestamp);
        uint64 end = uint64(block.timestamp + 1000 days);

        vm.prank(creator);
        uint256 lockId = megaLock.createLinearVesting(
            address(token), beneficiary, LOCK_AMOUNT, start, 0, end, true
        );

        // Cancel at 30%
        vm.warp(start + 300 days);

        uint256 creatorBefore = token.balanceOf(creator);
        uint256 benefBefore = token.balanceOf(beneficiary);

        vm.prank(creator);
        megaLock.cancel(lockId);

        uint256 vested = (LOCK_AMOUNT * 300 days) / 1000 days;
        uint256 unvested = LOCK_AMOUNT - vested;

        // Beneficiary gets vested portion
        assertEq(token.balanceOf(beneficiary), benefBefore + vested);
        // Creator gets unvested portion
        assertEq(token.balanceOf(creator), creatorBefore + unvested);
    }

    function test_linear_revert_invalidTimestamps() public {
        vm.startPrank(creator);

        // start >= end
        vm.expectRevert(MegaLock.InvalidTimestamps.selector);
        megaLock.createLinearVesting(
            address(token), beneficiary, LOCK_AMOUNT,
            uint64(block.timestamp + 100), 0, uint64(block.timestamp + 100), false
        );

        // cliff before start
        vm.expectRevert(MegaLock.InvalidTimestamps.selector);
        megaLock.createLinearVesting(
            address(token), beneficiary, LOCK_AMOUNT,
            uint64(block.timestamp + 100), uint64(block.timestamp + 50),
            uint64(block.timestamp + 200), false
        );

        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════════
    //                     STEPPED VESTING TESTS
    // ═══════════════════════════════════════════════════════════════════

    function test_stepped_create() public {
        MegaLock.Milestone[] memory ms = new MegaLock.Milestone[](4);
        ms[0] = MegaLock.Milestone(uint64(block.timestamp + 90 days), 2500);
        ms[1] = MegaLock.Milestone(uint64(block.timestamp + 180 days), 2500);
        ms[2] = MegaLock.Milestone(uint64(block.timestamp + 270 days), 2500);
        ms[3] = MegaLock.Milestone(uint64(block.timestamp + 360 days), 2500);

        vm.prank(creator);
        uint256 lockId = megaLock.createSteppedVesting(
            address(token), beneficiary, LOCK_AMOUNT, ms, true
        );

        MegaLock.Lock memory lock = megaLock.getLock(lockId);
        assertEq(uint8(lock.lockType), uint8(MegaLock.LockType.SteppedVesting));

        MegaLock.Milestone[] memory stored = megaLock.getMilestones(lockId);
        assertEq(stored.length, 4);
        assertEq(stored[0].basisPoints, 2500);
    }

    function test_stepped_progressive_unlock() public {
        MegaLock.Milestone[] memory ms = new MegaLock.Milestone[](4);
        ms[0] = MegaLock.Milestone(uint64(block.timestamp + 90 days), 2500);
        ms[1] = MegaLock.Milestone(uint64(block.timestamp + 180 days), 2500);
        ms[2] = MegaLock.Milestone(uint64(block.timestamp + 270 days), 2500);
        ms[3] = MegaLock.Milestone(uint64(block.timestamp + 360 days), 2500);

        vm.prank(creator);
        uint256 lockId = megaLock.createSteppedVesting(
            address(token), beneficiary, LOCK_AMOUNT, ms, false
        );

        // Before first milestone
        assertEq(megaLock.getVestedAmount(lockId), 0);

        // After first milestone: 25%
        vm.warp(block.timestamp + 90 days);
        assertEq(megaLock.getVestedAmount(lockId), LOCK_AMOUNT * 2500 / 10_000);

        // After second: 50%
        vm.warp(block.timestamp + 90 days);
        assertEq(megaLock.getVestedAmount(lockId), LOCK_AMOUNT * 5000 / 10_000);

        // After all: 100%
        vm.warp(block.timestamp + 180 days);
        assertEq(megaLock.getVestedAmount(lockId), LOCK_AMOUNT);
    }

    function test_stepped_claim_per_milestone() public {
        MegaLock.Milestone[] memory ms = new MegaLock.Milestone[](2);
        ms[0] = MegaLock.Milestone(uint64(block.timestamp + 100 days), 6000); // 60%
        ms[1] = MegaLock.Milestone(uint64(block.timestamp + 200 days), 4000); // 40%

        vm.prank(creator);
        uint256 lockId = megaLock.createSteppedVesting(
            address(token), beneficiary, LOCK_AMOUNT, ms, false
        );

        // Claim after first milestone
        vm.warp(block.timestamp + 100 days);
        vm.prank(beneficiary);
        megaLock.claim(lockId);
        assertEq(token.balanceOf(beneficiary), LOCK_AMOUNT * 6000 / 10_000);

        // Claim after second milestone
        vm.warp(block.timestamp + 100 days);
        vm.prank(beneficiary);
        megaLock.claim(lockId);
        assertEq(token.balanceOf(beneficiary), LOCK_AMOUNT);
    }

    function test_stepped_revert_basisPointsNot10000() public {
        MegaLock.Milestone[] memory ms = new MegaLock.Milestone[](2);
        ms[0] = MegaLock.Milestone(uint64(block.timestamp + 100 days), 5000);
        ms[1] = MegaLock.Milestone(uint64(block.timestamp + 200 days), 3000);
        // Total = 8000, not 10000

        vm.prank(creator);
        vm.expectRevert(MegaLock.InvalidMilestones.selector);
        megaLock.createSteppedVesting(
            address(token), beneficiary, LOCK_AMOUNT, ms, false
        );
    }

    function test_stepped_revert_unsortedTimestamps() public {
        MegaLock.Milestone[] memory ms = new MegaLock.Milestone[](2);
        ms[0] = MegaLock.Milestone(uint64(block.timestamp + 200 days), 5000);
        ms[1] = MegaLock.Milestone(uint64(block.timestamp + 100 days), 5000);

        vm.prank(creator);
        vm.expectRevert(MegaLock.InvalidTimestamps.selector);
        megaLock.createSteppedVesting(
            address(token), beneficiary, LOCK_AMOUNT, ms, false
        );
    }

    function test_stepped_revert_emptyMilestones() public {
        MegaLock.Milestone[] memory ms = new MegaLock.Milestone[](0);

        vm.prank(creator);
        vm.expectRevert(MegaLock.InvalidMilestones.selector);
        megaLock.createSteppedVesting(
            address(token), beneficiary, LOCK_AMOUNT, ms, false
        );
    }

    // ═══════════════════════════════════════════════════════════════════
    //                        GENERAL TESTS
    // ═══════════════════════════════════════════════════════════════════

    function test_claim_notBeneficiary_reverts() public {
        uint64 unlockTime = uint64(block.timestamp + 100 days);

        vm.prank(creator);
        uint256 lockId = megaLock.createTimeLock(
            address(token), beneficiary, LOCK_AMOUNT, unlockTime, false
        );

        vm.warp(unlockTime + 1);
        vm.prank(creator); // not the beneficiary
        vm.expectRevert(MegaLock.NotBeneficiary.selector);
        megaLock.claim(lockId);
    }

    function test_cancel_notCreator_reverts() public {
        uint64 unlockTime = uint64(block.timestamp + 100 days);

        vm.prank(creator);
        uint256 lockId = megaLock.createTimeLock(
            address(token), beneficiary, LOCK_AMOUNT, unlockTime, true
        );

        vm.prank(beneficiary);
        vm.expectRevert(MegaLock.NotCreator.selector);
        megaLock.cancel(lockId);
    }

    function test_doubleClaim_reverts() public {
        uint64 unlockTime = uint64(block.timestamp + 100 days);

        vm.prank(creator);
        uint256 lockId = megaLock.createTimeLock(
            address(token), beneficiary, LOCK_AMOUNT, unlockTime, false
        );

        vm.warp(unlockTime + 1);
        vm.startPrank(beneficiary);
        megaLock.claim(lockId);
        vm.expectRevert(MegaLock.NothingToClaim.selector);
        megaLock.claim(lockId);
        vm.stopPrank();
    }

    function test_doubleCancel_reverts() public {
        uint64 unlockTime = uint64(block.timestamp + 100 days);

        vm.prank(creator);
        uint256 lockId = megaLock.createTimeLock(
            address(token), beneficiary, LOCK_AMOUNT, unlockTime, true
        );

        vm.startPrank(creator);
        megaLock.cancel(lockId);
        vm.expectRevert(MegaLock.AlreadyCancelled.selector);
        megaLock.cancel(lockId);
        vm.stopPrank();
    }

    function test_claimAfterCancel_reverts() public {
        uint64 unlockTime = uint64(block.timestamp + 100 days);

        vm.prank(creator);
        uint256 lockId = megaLock.createTimeLock(
            address(token), beneficiary, LOCK_AMOUNT, unlockTime, true
        );

        vm.prank(creator);
        megaLock.cancel(lockId);

        vm.warp(unlockTime + 1);
        vm.prank(beneficiary);
        vm.expectRevert(MegaLock.AlreadyCancelled.selector);
        megaLock.claim(lockId);
    }

    function test_getLocksByCreator() public {
        vm.startPrank(creator);
        megaLock.createTimeLock(
            address(token), beneficiary, 100 ether, uint64(block.timestamp + 100 days), false
        );
        megaLock.createTimeLock(
            address(token), beneficiary, 200 ether, uint64(block.timestamp + 200 days), false
        );
        vm.stopPrank();

        uint256[] memory ids = megaLock.getLocksByCreator(creator);
        assertEq(ids.length, 2);
        assertEq(ids[0], 0);
        assertEq(ids[1], 1);
    }

    function test_getLocksByBeneficiary() public {
        vm.startPrank(creator);
        megaLock.createTimeLock(
            address(token), beneficiary, 100 ether, uint64(block.timestamp + 100 days), false
        );
        vm.stopPrank();

        uint256[] memory ids = megaLock.getLocksByBeneficiary(beneficiary);
        assertEq(ids.length, 1);
        assertEq(ids[0], 0);
    }

    function test_zeroAmount_reverts() public {
        vm.prank(creator);
        vm.expectRevert(MegaLock.ZeroAmount.selector);
        megaLock.createTimeLock(
            address(token), beneficiary, 0, uint64(block.timestamp + 100 days), false
        );
    }

    function test_zeroAddress_reverts() public {
        vm.prank(creator);
        vm.expectRevert(MegaLock.ZeroAddress.selector);
        megaLock.createTimeLock(
            address(0), beneficiary, LOCK_AMOUNT, uint64(block.timestamp + 100 days), false
        );
    }
}
