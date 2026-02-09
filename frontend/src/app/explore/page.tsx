"use client";

import { useReadContract } from "wagmi";
import { MEGALOCK_ADDRESS, MEGALOCK_ABI } from "@/lib/contracts";
import { formatTokenAmount, formatDateTime, getLockTypeLabel, shortenAddress } from "@/lib/utils";

export default function ExplorePage() {
  const { data: nextLockId } = useReadContract({
    address: MEGALOCK_ADDRESS, abi: MEGALOCK_ABI, functionName: "nextLockId",
  });

  const totalLocks = nextLockId ? Number(nextLockId) : 0;
  const lockIds = Array.from({ length: Math.min(totalLocks, 50) }, (_, i) => BigInt(totalLocks - 1 - i));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Explorer</h1>
        <p className="text-muted mt-2">Browse all locks on MegaLock — {totalLocks} total</p>
      </div>

      {totalLocks === 0 ? (
        <div className="bg-card border border-card-border rounded-xl p-8 text-center">
          <p className="text-muted">No locks created yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {lockIds.map((id) => (
            <ExploreLockRow key={id.toString()} lockId={id} />
          ))}
        </div>
      )}
    </div>
  );
}

function ExploreLockRow({ lockId }: { lockId: bigint }) {
  const { data: lock } = useReadContract({
    address: MEGALOCK_ADDRESS, abi: MEGALOCK_ABI, functionName: "getLock", args: [lockId],
  });
  const { data: vested } = useReadContract({
    address: MEGALOCK_ADDRESS, abi: MEGALOCK_ABI, functionName: "getVestedAmount", args: [lockId],
  });

  if (!lock) return <div className="bg-card border border-card-border rounded-xl p-4 animate-pulse h-16" />;

  const vestedPercent = lock.totalAmount > 0n && vested ? Number((vested * 10000n) / lock.totalAmount) / 100 : 0;

  return (
    <div className={`bg-card border rounded-xl p-4 ${lock.cancelled ? "border-danger/30 opacity-60" : "border-card-border"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-mono text-muted">#{lockId.toString()}</span>
          <span className="bg-primary/10 text-primary text-xs font-medium px-2 py-1 rounded">{getLockTypeLabel(lock.lockType)}</span>
          {lock.cancelled && <span className="bg-danger/10 text-danger text-xs font-medium px-2 py-1 rounded">Cancelled</span>}
        </div>
        <span className="text-sm font-semibold">{formatTokenAmount(lock.totalAmount)} tokens</span>
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-muted flex-wrap gap-2">
        <div className="flex gap-4">
          <span>Creator: {shortenAddress(lock.creator)}</span>
          <span>Beneficiary: {shortenAddress(lock.beneficiary)}</span>
          <span>Token: {shortenAddress(lock.token)}</span>
        </div>
        <span>{formatDateTime(Number(lock.startTime))} → {formatDateTime(Number(lock.endTime))}</span>
      </div>

      <div className="mt-2 w-full bg-background rounded-full h-1.5 overflow-hidden">
        <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${vestedPercent}%` }} />
      </div>
    </div>
  );
}
