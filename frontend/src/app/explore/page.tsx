"use client";

import { useState } from "react";
import { useReadContract } from "wagmi";
import { MEGALOCK_ADDRESS, MEGALOCK_ABI, ERC20_ABI } from "@/lib/contracts";
import { formatTokenAmount, formatDateTime, getLockTypeLabel, shortenAddress } from "@/lib/utils";
import { VestingChart } from "@/components/VestingChart";

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
  const [expanded, setExpanded] = useState(false);

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
  const remaining = lock.totalAmount - lock.claimedAmount;
  const now = Math.floor(Date.now() / 1000);
  const startT = Number(lock.startTime);
  const endT = Number(lock.endTime);

  // Time until unlock
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
          <div className="flex items-center gap-3">
            <span className="text-sm font-mono text-muted">#{lockId.toString()}</span>
            <span className="bg-primary/10 text-primary text-xs font-medium px-2 py-1 rounded">{getLockTypeLabel(lock.lockType)}</span>
            {lock.cancelled && <span className="bg-danger/10 text-danger text-xs font-medium px-2 py-1 rounded">Cancelled</span>}
          </div>
          <div className="text-right flex items-center gap-2">
            <span className="text-sm font-semibold">{formatTokenAmount(lock.totalAmount)} {tokenSymbol || "tokens"}</span>
            {supplyPercent > 0 && <span className="text-xs text-muted">({supplyPercent.toFixed(2)}% of supply)</span>}
            <span className={`text-xs transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}>▼</span>
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
            <VestingChart lockType={lock.lockType} startTime={startT} endTime={endT} />
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
              <p className="text-muted text-[10px]">Remaining</p>
              <p className="font-semibold text-sm">{formatTokenAmount(remaining)} {tokenSymbol}</p>
            </div>
          </div>

          {/* Status + links */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className={`text-xs font-medium px-2 py-1 rounded ${
              now >= endT ? "bg-success/10 text-success" :
              lock.cancelled ? "bg-danger/10 text-danger" :
              "bg-primary/10 text-primary"
            }`}>{timeStatus}</span>
            <div className="flex gap-3">
              <a href={`https://megaeth.blockscout.com/address/${lock.token}`}
                target="_blank" rel="noopener noreferrer"
                className="text-xs text-primary hover:underline"
                onClick={(e) => e.stopPropagation()}>View on Blockscout</a>
              <a href={`/token?address=${lock.token}`}
                className="text-xs text-primary hover:underline"
                onClick={(e) => e.stopPropagation()}>Token Analytics</a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
