"use client";

import { useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { MEGALOCK_ADDRESS, MEGALOCK_ABI, ERC20_ABI } from "@/lib/contracts";
import { formatTokenAmount, formatDateTime, getLockTypeLabel, shortenAddress } from "@/lib/utils";
import { VestingChart } from "@/components/VestingChart";
import { FadeIn } from "@/components/FadeIn";
import { useProfile } from "@/contexts/ProfileContext";

export default function ProfilePage() {
  const { address, isConnected } = useAccount();
  const { username, xHandle, setUsername, setXHandle } = useProfile();
  const [editingUsername, setEditingUsername] = useState(false);
  const [editingX, setEditingX] = useState(false);
  const [tempUsername, setTempUsername] = useState("");
  const [tempX, setTempX] = useState("");

  const { data: creatorLockIds } = useReadContract({
    address: MEGALOCK_ADDRESS, abi: MEGALOCK_ABI, functionName: "getLocksByCreator",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: beneficiaryLockIds } = useReadContract({
    address: MEGALOCK_ADDRESS, abi: MEGALOCK_ABI, functionName: "getLocksByBeneficiary",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const allIds = new Set([...(creatorLockIds ?? []), ...(beneficiaryLockIds ?? [])]);
  const lockIds = Array.from(allIds).sort((a, b) => Number(b) - Number(a));

  if (!isConnected) {
    return (
      <div className="bg-card border border-card-border rounded-xl p-8 text-center">
        <h1 className="text-2xl font-bold mb-2">Profile</h1>
        <p className="text-muted">Connect your wallet to view your profile</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <FadeIn>
        <h1 className="text-3xl font-bold">Profile</h1>
      </FadeIn>

      {/* Profile Card */}
      <FadeIn delay={50}>
        <div className="bg-card border border-card-border rounded-xl p-6">
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <span className="text-primary text-xl font-bold">
                {username ? username[0].toUpperCase() : address?.slice(2, 4).toUpperCase()}
              </span>
            </div>

            <div className="flex-1 space-y-3">
              {/* Username */}
              <div>
                {editingUsername ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text" value={tempUsername} onChange={(e) => setTempUsername(e.target.value)}
                      maxLength={20} placeholder="Enter username"
                      className="bg-background border border-card-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary w-48"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { setUsername(tempUsername); setEditingUsername(false); }
                        if (e.key === "Escape") setEditingUsername(false);
                      }}
                    />
                    <button onClick={() => { setUsername(tempUsername); setEditingUsername(false); }}
                      className="text-xs text-success hover:underline">Save</button>
                    <button onClick={() => setEditingUsername(false)}
                      className="text-xs text-muted hover:underline">Cancel</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold">{username || "No username set"}</span>
                    <button onClick={() => { setTempUsername(username); setEditingUsername(true); }}
                      className="text-xs text-primary hover:underline">{username ? "Edit" : "Set username"}</button>
                  </div>
                )}
              </div>

              {/* Wallet address */}
              <div className="flex items-center gap-2">
                <a href={`https://megaeth.blockscout.com/address/${address}`} target="_blank" rel="noopener noreferrer"
                  className="text-muted text-xs font-mono hover:text-primary transition-colors">{address}</a>
              </div>

              {/* X Handle */}
              <div>
                {editingX ? (
                  <div className="flex items-center gap-2">
                    <span className="text-muted text-sm">@</span>
                    <input
                      type="text" value={tempX} onChange={(e) => setTempX(e.target.value.replace(/^@/, ""))}
                      maxLength={30} placeholder="username"
                      className="bg-background border border-card-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary w-48"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { setXHandle(tempX); setEditingX(false); }
                        if (e.key === "Escape") setEditingX(false);
                      }}
                    />
                    <button onClick={() => { setXHandle(tempX); setEditingX(false); }}
                      className="text-xs text-success hover:underline">Save</button>
                    <button onClick={() => setEditingX(false)}
                      className="text-xs text-muted hover:underline">Cancel</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-muted">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                    {xHandle ? (
                      <a href={`https://x.com/${xHandle}`} target="_blank" rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline">@{xHandle}</a>
                    ) : (
                      <span className="text-sm text-muted">Not linked</span>
                    )}
                    <button onClick={() => { setTempX(xHandle); setEditingX(true); }}
                      className="text-xs text-primary hover:underline">{xHandle ? "Edit" : "Link X"}</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </FadeIn>

      {/* My Locks */}
      <FadeIn delay={100}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">My Locks ({lockIds.length})</p>
          {lockIds.length === 0 ? (
            <div className="bg-card border border-card-border rounded-xl p-6 text-center">
              <p className="text-muted text-sm">No locks found for your address</p>
            </div>
          ) : (
            <div className="space-y-3">
              {lockIds.map((id) => (
                <LockCard key={id.toString()} lockId={id} userAddress={address!} />
              ))}
            </div>
          )}
        </div>
      </FadeIn>
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
            <span className={`text-xs transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}>&#9660;</span>
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between text-xs text-muted flex-wrap gap-2">
          <div className="flex gap-4 flex-wrap items-center">
            <span className="flex items-center gap-1">
              Token: <span className="font-medium text-foreground">{shortenAddress(lock.token)}</span>
              <a href={`https://dexscreener.com/megaeth/${lock.token}`} target="_blank" rel="noopener noreferrer" title="DexScreener" onClick={(e) => e.stopPropagation()} className="opacity-60 hover:opacity-100 transition-opacity">
                <img src="/dexscreener.png" alt="DS" className="w-3.5 h-3.5 rounded-sm inline-block" />
              </a>
            </span>
            <span className="flex items-center gap-1">
              Creator: <a href={`https://megaeth.blockscout.com/address/${lock.creator}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-primary hover:underline">{shortenAddress(lock.creator)}</a>
            </span>
            <span className="flex items-center gap-1">
              Beneficiary: <a href={`https://megaeth.blockscout.com/address/${lock.beneficiary}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-primary hover:underline">{shortenAddress(lock.beneficiary)}</a>
            </span>
          </div>
          <span>{formatDateTime(startT)} &rarr; {formatDateTime(endT)}</span>
        </div>

        <div className="mt-2 w-full bg-background rounded-full h-1.5 overflow-hidden">
          <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${vestedPercent}%` }} />
        </div>
      </div>

      {expanded && (
        <div className="border-t border-card-border p-4 space-y-4" onClick={(e) => e.stopPropagation()}>
          <div>
            <p className="text-xs text-muted font-medium mb-2">Unlock Schedule</p>
            <VestingChart
              lockType={lock.lockType} startTime={startT} endTime={endT}
              cliffTime={Number(lock.cliffTime)}
              milestones={milestones?.map(m => ({ timestamp: Number(m.timestamp), basisPoints: Number(m.basisPoints) }))}
            />
          </div>

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
              <a href={`/token/${lock.token}`}
                className="text-xs text-primary hover:underline py-1.5"
                onClick={(e) => e.stopPropagation()}>Token Analytics</a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
