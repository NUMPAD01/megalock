"use client";

import { useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { MEGALOCK_ADDRESS, MEGALOCK_ABI, ERC20_ABI } from "@/lib/contracts";
import { formatTokenAmount, formatDateTime, getLockTypeLabel, shortenAddress } from "@/lib/utils";
import { VestingChart } from "@/components/VestingChart";

export default function MyLocksPage() {
  const { address, isConnected } = useAccount();

  const { data: creatorLockIds } = useReadContract({
    address: MEGALOCK_ADDRESS,
    abi: MEGALOCK_ABI,
    functionName: "getLocksByCreator",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: beneficiaryLockIds } = useReadContract({
    address: MEGALOCK_ADDRESS,
    abi: MEGALOCK_ABI,
    functionName: "getLocksByBeneficiary",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const allIds = new Set([...(creatorLockIds ?? []), ...(beneficiaryLockIds ?? [])]);
  const lockIds = Array.from(allIds).sort((a, b) => Number(b) - Number(a));

  if (!isConnected) {
    return (
      <div className="bg-card border border-card-border rounded-xl p-8 text-center">
        <h1 className="text-2xl font-bold mb-2">My Locks</h1>
        <p className="text-muted">Connect your wallet to see your locks</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">My Locks</h1>
      {lockIds.length === 0 ? (
        <div className="bg-card border border-card-border rounded-xl p-8 text-center">
          <p className="text-muted">No locks found for your address</p>
        </div>
      ) : (
        <div className="space-y-3">
          {lockIds.map((id) => (
            <LockCard key={id.toString()} lockId={id} userAddress={address!} />
          ))}
        </div>
      )}
    </div>
  );
}

function LockCard({ lockId, userAddress }: { lockId: bigint; userAddress: string }) {
  const [expanded, setExpanded] = useState(false);

  const { data: lock } = useReadContract({
    address: MEGALOCK_ADDRESS, abi: MEGALOCK_ABI, functionName: "getLock", args: [lockId],
  });
  const { data: claimable } = useReadContract({
    address: MEGALOCK_ADDRESS, abi: MEGALOCK_ABI, functionName: "getClaimableAmount", args: [lockId],
  });
  const { data: vested } = useReadContract({
    address: MEGALOCK_ADDRESS, abi: MEGALOCK_ABI, functionName: "getVestedAmount", args: [lockId],
  });
  const { data: tokenSymbol } = useReadContract({
    address: (lock?.token ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
    abi: ERC20_ABI, functionName: "symbol",
    query: { enabled: !!lock },
  });
  const { data: milestones } = useReadContract({
    address: MEGALOCK_ADDRESS, abi: MEGALOCK_ABI, functionName: "getMilestones", args: [lockId],
    query: { enabled: !!lock && lock.lockType === 2 },
  });

  const { writeContract: claimTokens, data: claimTx, isPending: isClaiming } = useWriteContract();
  const { writeContract: cancelLock, data: cancelTx, isPending: isCancelling } = useWriteContract();
  const { isLoading: isClaimConfirming } = useWaitForTransactionReceipt({ hash: claimTx });
  const { isLoading: isCancelConfirming } = useWaitForTransactionReceipt({ hash: cancelTx });

  if (!lock) return <div className="bg-card border border-card-border rounded-xl p-4 animate-pulse h-16" />;

  const isBeneficiary = lock.beneficiary.toLowerCase() === userAddress.toLowerCase();
  const isCreator = lock.creator.toLowerCase() === userAddress.toLowerCase();
  const vestedPercent = lock.totalAmount > 0n && vested ? Number((vested * 10000n) / lock.totalAmount) / 100 : 0;
  const remaining = lock.totalAmount - lock.claimedAmount;
  const now = Math.floor(Date.now() / 1000);
  const startT = Number(lock.startTime);
  const endT = Number(lock.endTime);

  let timeStatus = "";
  if (lock.cancelled) {
    timeStatus = "Cancelled";
  } else if (now >= endT) {
    timeStatus = "Fully vested";
  } else if (now < startT) {
    const diff = startT - now;
    const days = Math.floor(diff / 86400);
    const hours = Math.floor((diff % 86400) / 3600);
    timeStatus = `Starts in ${days}d ${hours}h`;
  } else {
    const diff = endT - now;
    const days = Math.floor(diff / 86400);
    const hours = Math.floor((diff % 86400) / 3600);
    const mins = Math.floor((diff % 3600) / 60);
    timeStatus = days > 0 ? `${days}d ${hours}h remaining` : hours > 0 ? `${hours}h ${mins}m remaining` : `${mins}m remaining`;
  }

  return (
    <div
      className={`bg-card border rounded-xl transition-all ${lock.cancelled ? "border-danger/30 opacity-60" : expanded ? "border-primary/40" : "border-card-border"} cursor-pointer`}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Summary row */}
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="bg-primary/10 text-primary text-xs font-medium px-2 py-1 rounded">{getLockTypeLabel(lock.lockType)}</span>
            {lock.cancelled && <span className="bg-danger/10 text-danger text-xs font-medium px-2 py-1 rounded">Cancelled</span>}
            {isBeneficiary && <span className="bg-accent/10 text-accent text-xs font-medium px-2 py-1 rounded">Beneficiary</span>}
            {isCreator && <span className="bg-success/10 text-success text-xs font-medium px-2 py-1 rounded">Creator</span>}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{formatTokenAmount(lock.totalAmount)} {tokenSymbol || "tokens"}</span>
            <span className={`text-xs transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}>▼</span>
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between text-xs text-muted flex-wrap gap-2">
          <div className="flex gap-4 flex-wrap">
            <span>Token: <span className="font-medium text-foreground">{shortenAddress(lock.token)}</span></span>
            <span>Beneficiary: {shortenAddress(lock.beneficiary)}</span>
          </div>
          <span>{formatDateTime(startT)} → {formatDateTime(endT)}</span>
        </div>

        <div className="mt-2 w-full bg-background rounded-full h-1.5 overflow-hidden">
          <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${vestedPercent}%` }} />
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-card-border p-4 space-y-4" onClick={(e) => e.stopPropagation()}>
          {/* Vesting Chart */}
          <div>
            <p className="text-xs text-muted font-medium mb-2">Unlock Schedule</p>
            <VestingChart
              lockType={lock.lockType} startTime={startT} endTime={endT}
              cliffTime={Number(lock.cliffTime)}
              milestones={milestones?.map(m => ({ timestamp: Number(m.timestamp), basisPoints: Number(m.basisPoints) }))}
            />
          </div>

          {/* Detail grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-background rounded-lg p-3">
              <p className="text-muted text-[10px]">Total Locked</p>
              <p className="font-semibold text-sm">{formatTokenAmount(lock.totalAmount)} {tokenSymbol}</p>
            </div>
            <div className="bg-background rounded-lg p-3">
              <p className="text-muted text-[10px]">Vested</p>
              <p className="font-semibold text-sm text-primary">{vested ? formatTokenAmount(vested) : "0"} {tokenSymbol}</p>
              <p className="text-[10px] text-muted">{vestedPercent.toFixed(1)}%</p>
            </div>
            <div className="bg-background rounded-lg p-3">
              <p className="text-muted text-[10px]">Claimed</p>
              <p className="font-semibold text-sm">{formatTokenAmount(lock.claimedAmount)} {tokenSymbol}</p>
            </div>
            <div className="bg-background rounded-lg p-3">
              <p className="text-muted text-[10px]">Claimable Now</p>
              <p className="font-semibold text-sm text-success">{claimable ? formatTokenAmount(claimable) : "0"} {tokenSymbol}</p>
            </div>
          </div>

          {/* Status + actions */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className={`text-xs font-medium px-2 py-1 rounded ${
              now >= endT ? "bg-success/10 text-success" :
              lock.cancelled ? "bg-danger/10 text-danger" :
              "bg-primary/10 text-primary"
            }`}>{timeStatus}</span>

            <div className="flex gap-2">
              {isBeneficiary && !lock.cancelled && claimable && claimable > 0n && (
                <button
                  onClick={(e) => { e.stopPropagation(); claimTokens({ address: MEGALOCK_ADDRESS, abi: MEGALOCK_ABI, functionName: "claim", args: [lockId] }); }}
                  disabled={isClaiming || isClaimConfirming}
                  className="bg-success hover:bg-success/80 disabled:opacity-50 text-white text-xs font-medium py-1.5 px-4 rounded-lg transition-colors"
                >
                  {isClaiming || isClaimConfirming ? "Claiming..." : "Claim"}
                </button>
              )}
              {isCreator && lock.cancelable && !lock.cancelled && (
                <button
                  onClick={(e) => { e.stopPropagation(); cancelLock({ address: MEGALOCK_ADDRESS, abi: MEGALOCK_ABI, functionName: "cancel", args: [lockId] }); }}
                  disabled={isCancelling || isCancelConfirming}
                  className="bg-danger hover:bg-danger/80 disabled:opacity-50 text-white text-xs font-medium py-1.5 px-4 rounded-lg transition-colors"
                >
                  {isCancelling || isCancelConfirming ? "Cancelling..." : "Cancel Lock"}
                </button>
              )}
              <a href={`/token?address=${lock.token}`}
                className="text-xs text-primary hover:underline py-1.5"
                onClick={(e) => e.stopPropagation()}>Token Analytics</a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
