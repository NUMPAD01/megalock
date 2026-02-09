"use client";

import { useState } from "react";
import { useReadContract } from "wagmi";
import { MEGALOCK_ADDRESS, MEGALOCK_ABI, ERC20_ABI } from "@/lib/contracts";
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

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className={`text-xs ml-1.5 underline decoration-dotted transition-colors ${copied ? "text-success" : "text-primary hover:text-primary-hover"}`}
      title="Copy address"
    >
      {copied ? "Copied!" : "[Copy]"}
    </button>
  );
}

function ExploreLockRow({ lockId }: { lockId: bigint }) {
  const { data: lock } = useReadContract({
    address: MEGALOCK_ADDRESS, abi: MEGALOCK_ABI, functionName: "getLock", args: [lockId],
  });
  const { data: vested } = useReadContract({
    address: MEGALOCK_ADDRESS, abi: MEGALOCK_ABI, functionName: "getVestedAmount", args: [lockId],
  });
  const { data: tokenSymbol } = useReadContract({
    address: (lock?.token ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
    abi: ERC20_ABI, functionName: "symbol",
    query: { enabled: !!lock },
  });
  const { data: tokenName } = useReadContract({
    address: (lock?.token ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
    abi: ERC20_ABI, functionName: "name",
    query: { enabled: !!lock },
  });
  const { data: totalSupply } = useReadContract({
    address: (lock?.token ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
    abi: ERC20_ABI, functionName: "totalSupply",
    query: { enabled: !!lock },
  });

  if (!lock) return <div className="bg-card border border-card-border rounded-xl p-4 animate-pulse h-16" />;

  const vestedPercent = lock.totalAmount > 0n && vested ? Number((vested * 10000n) / lock.totalAmount) / 100 : 0;
  const supplyPercent = totalSupply && totalSupply > 0n ? Number((lock.totalAmount * 10000n) / totalSupply) / 100 : 0;
  const displayName = tokenName && tokenSymbol ? `${tokenName} (${tokenSymbol})` : tokenSymbol || shortenAddress(lock.token);

  return (
    <div className={`bg-card border rounded-xl p-4 ${lock.cancelled ? "border-danger/30 opacity-60" : "border-card-border"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-mono text-muted">#{lockId.toString()}</span>
          <span className="bg-primary/10 text-primary text-xs font-medium px-2 py-1 rounded">{getLockTypeLabel(lock.lockType)}</span>
          {lock.cancelled && <span className="bg-danger/10 text-danger text-xs font-medium px-2 py-1 rounded">Cancelled</span>}
        </div>
        <div className="text-right">
          <span className="text-sm font-semibold">{formatTokenAmount(lock.totalAmount)} {tokenSymbol || "tokens"}</span>
          {supplyPercent > 0 && <span className="text-xs text-muted ml-2">({supplyPercent.toFixed(2)}% of supply)</span>}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-muted flex-wrap gap-2">
        <div className="flex gap-4 flex-wrap">
          <span>
            Token: <span className="font-medium text-foreground">{displayName}</span>
            <CopyBtn text={lock.token} />
          </span>
          <span>
            Creator: {shortenAddress(lock.creator)}
            <CopyBtn text={lock.creator} />
          </span>
          <span>
            Beneficiary: {shortenAddress(lock.beneficiary)}
            <CopyBtn text={lock.beneficiary} />
          </span>
        </div>
        <span>{formatDateTime(Number(lock.startTime))} → {formatDateTime(Number(lock.endTime))}</span>
      </div>

      <div className="mt-2 w-full bg-background rounded-full h-1.5 overflow-hidden">
        <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${vestedPercent}%` }} />
      </div>
    </div>
  );
}
