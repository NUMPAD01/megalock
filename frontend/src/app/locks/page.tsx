"use client";

import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { MEGALOCK_ADDRESS, MEGALOCK_ABI } from "@/lib/contracts";
import { formatTokenAmount, formatDateTime, getLockTypeLabel, getVestingProgress } from "@/lib/utils";

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
  const lockIds = Array.from(allIds);

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
        <div className="space-y-4">
          {lockIds.map((id) => (
            <LockCard key={id.toString()} lockId={id} userAddress={address!} />
          ))}
        </div>
      )}
    </div>
  );
}

function LockCard({ lockId, userAddress }: { lockId: bigint; userAddress: string }) {
  const { data: lock } = useReadContract({
    address: MEGALOCK_ADDRESS, abi: MEGALOCK_ABI, functionName: "getLock", args: [lockId],
  });
  const { data: claimable } = useReadContract({
    address: MEGALOCK_ADDRESS, abi: MEGALOCK_ABI, functionName: "getClaimableAmount", args: [lockId],
  });
  const { data: vested } = useReadContract({
    address: MEGALOCK_ADDRESS, abi: MEGALOCK_ABI, functionName: "getVestedAmount", args: [lockId],
  });

  const { writeContract: claimTokens, data: claimTx, isPending: isClaiming } = useWriteContract();
  const { writeContract: cancelLock, data: cancelTx, isPending: isCancelling } = useWriteContract();
  const { isLoading: isClaimConfirming } = useWaitForTransactionReceipt({ hash: claimTx });
  const { isLoading: isCancelConfirming } = useWaitForTransactionReceipt({ hash: cancelTx });

  if (!lock) return <div className="bg-card border border-card-border rounded-xl p-6 animate-pulse h-32" />;

  const isBeneficiary = lock.beneficiary.toLowerCase() === userAddress.toLowerCase();
  const isCreator = lock.creator.toLowerCase() === userAddress.toLowerCase();
  const progress = getVestingProgress(lock.claimedAmount, lock.totalAmount);
  const vestedProgress = vested ? getVestingProgress(vested, lock.totalAmount) : 0;

  return (
    <div className={`bg-card border rounded-xl p-6 space-y-4 ${lock.cancelled ? "border-danger/30 opacity-70" : "border-card-border"}`}>
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-mono text-muted">#{lockId.toString()}</span>
        <span className="bg-primary/10 text-primary text-xs font-medium px-2 py-1 rounded">{getLockTypeLabel(lock.lockType)}</span>
        {lock.cancelled && <span className="bg-danger/10 text-danger text-xs font-medium px-2 py-1 rounded">Cancelled</span>}
        {isBeneficiary && <span className="bg-accent/10 text-accent text-xs font-medium px-2 py-1 rounded">Beneficiary</span>}
        {isCreator && <span className="bg-success/10 text-success text-xs font-medium px-2 py-1 rounded">Creator</span>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <p className="text-muted">Token</p>
          <p className="font-mono text-xs">{lock.token.slice(0, 6)}...{lock.token.slice(-4)}</p>
        </div>
        <div>
          <p className="text-muted">Total Amount</p>
          <p className="font-semibold">{formatTokenAmount(lock.totalAmount)}</p>
        </div>
        <div>
          <p className="text-muted">Claimed</p>
          <p>{formatTokenAmount(lock.claimedAmount)}</p>
        </div>
        <div>
          <p className="text-muted">Claimable Now</p>
          <p className="text-success font-semibold">{claimable ? formatTokenAmount(claimable) : "0"}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
        <div>
          <p className="text-muted">Start</p>
          <p>{formatDateTime(Number(lock.startTime))}</p>
        </div>
        {lock.cliffTime > 0 && (
          <div>
            <p className="text-muted">Cliff</p>
            <p>{formatDateTime(Number(lock.cliffTime))}</p>
          </div>
        )}
        <div>
          <p className="text-muted">End</p>
          <p>{formatDateTime(Number(lock.endTime))}</p>
        </div>
      </div>

      <div>
        <div className="flex justify-between text-xs text-muted mb-1">
          <span>Vested: {vestedProgress.toFixed(1)}%</span>
          <span>Claimed: {progress.toFixed(1)}%</span>
        </div>
        <div className="w-full bg-background rounded-full h-2 overflow-hidden">
          <div className="bg-primary/30 h-2 rounded-full relative" style={{ width: `${vestedProgress}%` }}>
            <div className="bg-primary h-2 rounded-full absolute left-0 top-0" style={{ width: vestedProgress > 0 ? `${(progress / vestedProgress) * 100}%` : "0%" }} />
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        {isBeneficiary && !lock.cancelled && claimable && claimable > 0n && (
          <button
            onClick={() => claimTokens({ address: MEGALOCK_ADDRESS, abi: MEGALOCK_ABI, functionName: "claim", args: [lockId] })}
            disabled={isClaiming || isClaimConfirming}
            className="bg-success hover:bg-success/80 disabled:opacity-50 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
          >
            {isClaiming || isClaimConfirming ? "Claiming..." : "Claim"}
          </button>
        )}
        {isCreator && lock.cancelable && !lock.cancelled && (
          <button
            onClick={() => cancelLock({ address: MEGALOCK_ADDRESS, abi: MEGALOCK_ABI, functionName: "cancel", args: [lockId] })}
            disabled={isCancelling || isCancelConfirming}
            className="bg-danger hover:bg-danger/80 disabled:opacity-50 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
          >
            {isCancelling || isCancelConfirming ? "Cancelling..." : "Cancel Lock"}
          </button>
        )}
      </div>
    </div>
  );
}
