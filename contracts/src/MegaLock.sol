// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title MegaLock - Token locking & vesting contract for MegaETH
/// @notice Supports 3 modes: Timelock, Linear Vesting + Cliff, Stepped Vesting
contract MegaLock is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Types ────────────────────────────────────────────────────────

    enum LockType {
        Timelock,         // Lock until a date, then 100% unlock
        LinearVesting,    // Cliff + linear release
        SteppedVesting    // Unlock at predefined milestones
    }

    struct Lock {
        address token;
        address creator;
        address beneficiary;
        uint256 totalAmount;
        uint256 claimedAmount;
        LockType lockType;
        uint64 startTime;
        uint64 cliffTime;   // Only for LinearVesting (0 otherwise)
        uint64 endTime;     // Unlock time for Timelock, end for Linear
        bool cancelable;
        bool cancelled;
    }

    struct Milestone {
        uint64 timestamp;
        uint256 basisPoints; // e.g. 2500 = 25%
    }

    // ─── State ────────────────────────────────────────────────────────

    uint256 public nextLockId;

    mapping(uint256 lockId => Lock) public locks;
    mapping(uint256 lockId => Milestone[]) public milestones;

    mapping(address creator => uint256[]) private _creatorLocks;
    mapping(address beneficiary => uint256[]) private _beneficiaryLocks;

    // ─── Constants ────────────────────────────────────────────────────

    uint256 public constant BASIS_POINTS_TOTAL = 10_000;

    // ─── Events ───────────────────────────────────────────────────────

    event LockCreated(
        uint256 indexed lockId,
        address indexed token,
        address indexed beneficiary,
        address creator,
        uint256 amount,
        LockType lockType
    );

    event TokensClaimed(
        uint256 indexed lockId,
        address indexed beneficiary,
        uint256 amount
    );

    event LockCancelled(
        uint256 indexed lockId,
        address indexed creator,
        uint256 returnedAmount
    );

    // ─── Errors ───────────────────────────────────────────────────────

    error ZeroAmount();
    error ZeroAddress();
    error InvalidTimestamps();
    error NotBeneficiary();
    error NotCreator();
    error NothingToClaim();
    error NotCancelable();
    error AlreadyCancelled();
    error InvalidMilestones();

    // ─── Timelock ─────────────────────────────────────────────────────

    /// @notice Create a simple timelock (100% unlock at unlockTime)
    function createTimeLock(
        address token,
        address beneficiary,
        uint256 amount,
        uint64 unlockTime,
        bool cancelable
    ) external nonReentrant returns (uint256 lockId) {
        if (token == address(0) || beneficiary == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (unlockTime <= block.timestamp) revert InvalidTimestamps();

        lockId = nextLockId++;

        locks[lockId] = Lock({
            token: token,
            creator: msg.sender,
            beneficiary: beneficiary,
            totalAmount: amount,
            claimedAmount: 0,
            lockType: LockType.Timelock,
            startTime: uint64(block.timestamp),
            cliffTime: 0,
            endTime: unlockTime,
            cancelable: cancelable,
            cancelled: false
        });

        _creatorLocks[msg.sender].push(lockId);
        _beneficiaryLocks[beneficiary].push(lockId);

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        emit LockCreated(lockId, token, beneficiary, msg.sender, amount, LockType.Timelock);
    }

    // ─── Linear Vesting ───────────────────────────────────────────────

    /// @notice Create a linear vesting schedule with optional cliff
    function createLinearVesting(
        address token,
        address beneficiary,
        uint256 amount,
        uint64 startTime,
        uint64 cliffTime,
        uint64 endTime,
        bool cancelable
    ) external nonReentrant returns (uint256 lockId) {
        if (token == address(0) || beneficiary == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (startTime >= endTime) revert InvalidTimestamps();
        if (cliffTime != 0 && (cliffTime < startTime || cliffTime > endTime)) {
            revert InvalidTimestamps();
        }

        lockId = nextLockId++;

        locks[lockId] = Lock({
            token: token,
            creator: msg.sender,
            beneficiary: beneficiary,
            totalAmount: amount,
            claimedAmount: 0,
            lockType: LockType.LinearVesting,
            startTime: startTime,
            cliffTime: cliffTime,
            endTime: endTime,
            cancelable: cancelable,
            cancelled: false
        });

        _creatorLocks[msg.sender].push(lockId);
        _beneficiaryLocks[beneficiary].push(lockId);

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        emit LockCreated(lockId, token, beneficiary, msg.sender, amount, LockType.LinearVesting);
    }

    // ─── Stepped Vesting ──────────────────────────────────────────────

    /// @notice Create a stepped vesting schedule with milestones
    /// @param _milestones Array of (timestamp, basisPoints) — must sum to 10000
    function createSteppedVesting(
        address token,
        address beneficiary,
        uint256 amount,
        Milestone[] calldata _milestones,
        bool cancelable
    ) external nonReentrant returns (uint256 lockId) {
        if (token == address(0) || beneficiary == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (_milestones.length == 0) revert InvalidMilestones();

        uint256 totalBps;
        uint64 prevTimestamp;
        for (uint256 i; i < _milestones.length; ) {
            if (_milestones[i].timestamp <= block.timestamp) revert InvalidTimestamps();
            if (_milestones[i].timestamp <= prevTimestamp) revert InvalidTimestamps();
            if (_milestones[i].basisPoints == 0) revert InvalidMilestones();
            totalBps += _milestones[i].basisPoints;
            prevTimestamp = _milestones[i].timestamp;
            unchecked { ++i; }
        }
        if (totalBps != BASIS_POINTS_TOTAL) revert InvalidMilestones();

        lockId = nextLockId++;

        Lock storage lock = locks[lockId];
        lock.token = token;
        lock.creator = msg.sender;
        lock.beneficiary = beneficiary;
        lock.totalAmount = amount;
        lock.lockType = LockType.SteppedVesting;
        lock.startTime = uint64(block.timestamp);
        lock.endTime = _milestones[_milestones.length - 1].timestamp;
        lock.cancelable = cancelable;

        for (uint256 i; i < _milestones.length; ) {
            milestones[lockId].push(_milestones[i]);
            unchecked { ++i; }
        }

        _creatorLocks[msg.sender].push(lockId);
        _beneficiaryLocks[beneficiary].push(lockId);

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        emit LockCreated(lockId, token, beneficiary, msg.sender, amount, LockType.SteppedVesting);
    }

    // ─── Claim ────────────────────────────────────────────────────────

    /// @notice Claim available vested tokens
    function claim(uint256 lockId) external nonReentrant {
        Lock storage lock = locks[lockId];
        if (msg.sender != lock.beneficiary) revert NotBeneficiary();
        if (lock.cancelled) revert AlreadyCancelled();

        uint256 vested = _vestedAmount(lockId);
        uint256 claimable = vested - lock.claimedAmount;
        if (claimable == 0) revert NothingToClaim();

        lock.claimedAmount += claimable;

        IERC20(lock.token).safeTransfer(lock.beneficiary, claimable);

        emit TokensClaimed(lockId, lock.beneficiary, claimable);
    }

    // ─── Cancel ───────────────────────────────────────────────────────

    /// @notice Cancel a lock and return unvested tokens to creator
    function cancel(uint256 lockId) external nonReentrant {
        Lock storage lock = locks[lockId];
        if (msg.sender != lock.creator) revert NotCreator();
        if (!lock.cancelable) revert NotCancelable();
        if (lock.cancelled) revert AlreadyCancelled();

        lock.cancelled = true;

        uint256 vested = _vestedAmount(lockId);
        uint256 unvested = lock.totalAmount - vested;

        // Transfer any unclaimed vested tokens to beneficiary
        uint256 unclaimedVested = vested - lock.claimedAmount;
        if (unclaimedVested > 0) {
            lock.claimedAmount = vested;
            IERC20(lock.token).safeTransfer(lock.beneficiary, unclaimedVested);
        }

        // Return unvested tokens to creator
        if (unvested > 0) {
            IERC20(lock.token).safeTransfer(lock.creator, unvested);
        }

        emit LockCancelled(lockId, lock.creator, unvested);
    }

    // ─── Views ────────────────────────────────────────────────────────

    /// @notice Get the total vested amount for a lock at the current time
    function getVestedAmount(uint256 lockId) external view returns (uint256) {
        return _vestedAmount(lockId);
    }

    /// @notice Get the claimable amount (vested - already claimed)
    function getClaimableAmount(uint256 lockId) external view returns (uint256) {
        Lock storage lock = locks[lockId];
        if (lock.cancelled) return 0;
        uint256 vested = _vestedAmount(lockId);
        return vested - lock.claimedAmount;
    }

    /// @notice Get lock info
    function getLock(uint256 lockId) external view returns (Lock memory) {
        return locks[lockId];
    }

    /// @notice Get milestones for a stepped vesting lock
    function getMilestones(uint256 lockId) external view returns (Milestone[] memory) {
        return milestones[lockId];
    }

    /// @notice Get all lock IDs created by an address
    function getLocksByCreator(address creator) external view returns (uint256[] memory) {
        return _creatorLocks[creator];
    }

    /// @notice Get all lock IDs for a beneficiary
    function getLocksByBeneficiary(address beneficiary) external view returns (uint256[] memory) {
        return _beneficiaryLocks[beneficiary];
    }

    // ─── Internal ─────────────────────────────────────────────────────

    function _vestedAmount(uint256 lockId) internal view returns (uint256) {
        Lock storage lock = locks[lockId];

        if (lock.lockType == LockType.Timelock) {
            return _vestedTimelock(lock);
        } else if (lock.lockType == LockType.LinearVesting) {
            return _vestedLinear(lock);
        } else {
            return _vestedStepped(lockId, lock);
        }
    }

    function _vestedTimelock(Lock storage lock) internal view returns (uint256) {
        if (block.timestamp < lock.endTime) {
            return 0;
        }
        return lock.totalAmount;
    }

    function _vestedLinear(Lock storage lock) internal view returns (uint256) {
        if (lock.cliffTime != 0 && block.timestamp < lock.cliffTime) {
            return 0;
        }
        if (block.timestamp < lock.startTime) {
            return 0;
        }
        if (block.timestamp >= lock.endTime) {
            return lock.totalAmount;
        }
        return (lock.totalAmount * (block.timestamp - lock.startTime)) / (lock.endTime - lock.startTime);
    }

    function _vestedStepped(uint256 lockId, Lock storage lock) internal view returns (uint256) {
        Milestone[] storage ms = milestones[lockId];
        uint256 totalBps;

        for (uint256 i; i < ms.length; ) {
            if (block.timestamp >= ms[i].timestamp) {
                totalBps += ms[i].basisPoints;
            } else {
                break; // milestones are sorted chronologically
            }
            unchecked { ++i; }
        }

        return (lock.totalAmount * totalBps) / BASIS_POINTS_TOTAL;
    }
}
