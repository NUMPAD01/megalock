"use client";

import { useState, useEffect } from "react";
import { useReadContract, usePublicClient } from "wagmi";
import { parseAbiItem } from "viem";
import { MEGALOCK_ADDRESS, MEGALOCK_ABI, MEGABURN_ADDRESS, ERC20_ABI } from "@/lib/contracts";
import { formatTokenAmount, formatDateTime, getLockTypeLabel, shortenAddress, timeAgo } from "@/lib/utils";
import { VestingChart } from "@/components/VestingChart";
import { FadeIn } from "@/components/FadeIn";
import Link from "next/link";

type ExplorerTab = "locks" | "burns";
type LockFilter = "locked" | "unlocked";

interface BurnEvent {
  token: string;
  burner: string;
  amount: bigint;
  symbol?: string;
  decimals?: number;
}

export default function ExplorePage() {
  const publicClient = usePublicClient();
  const [activeTab, setActiveTab] = useState<ExplorerTab>("locks");
  const [lockFilter, setLockFilter] = useState<LockFilter>("locked");
  const [burns, setBurns] = useState<BurnEvent[]>([]);
  const [burnsLoading, setBurnsLoading] = useState(false);

  const { data: nextLockId } = useReadContract({
    address: MEGALOCK_ADDRESS, abi: MEGALOCK_ABI, functionName: "nextLockId",
  });

  const totalLocks = nextLockId ? Number(nextLockId) : 0;
  const lockIds = Array.from({ length: Math.min(totalLocks, 50) }, (_, i) => BigInt(totalLocks - 1 - i));

  // Fetch all burn events from MegaBurn contract
  useEffect(() => {
    if (!publicClient) { setBurns([]); return; }

    const fetchBurns = async () => {
      setBurnsLoading(true);
      try {
        const logs = await publicClient.getLogs({
          address: MEGABURN_ADDRESS,
          event: parseAbiItem("event TokensBurned(address indexed token, address indexed burner, uint256 amount)"),
          fromBlock: 0n,
          toBlock: "latest",
        });

        const entries: BurnEvent[] = [];
        const symbolCache = new Map<string, { symbol?: string; decimals?: number }>();

        for (const log of logs) {
          const token = log.args.token!;
          const burner = log.args.burner!;
          const amount = log.args.amount!;

          let cached = symbolCache.get(token);
          if (!cached) {
            let symbol: string | undefined;
            let decimals: number | undefined;
            try {
              symbol = await publicClient.readContract({
                address: token as `0x${string}`, abi: ERC20_ABI, functionName: "symbol",
              }) as string;
              decimals = await publicClient.readContract({
                address: token as `0x${string}`, abi: ERC20_ABI, functionName: "decimals",
              }) as number;
            } catch { /* skip */ }
            cached = { symbol, decimals };
            symbolCache.set(token, cached);
          }

          entries.push({ token, burner, amount, symbol: cached.symbol, decimals: cached.decimals });
        }

        entries.reverse();
        setBurns(entries);
      } catch {
        setBurns([]);
      } finally {
        setBurnsLoading(false);
      }
    };

    fetchBurns();
  }, [publicClient]);

  const tabs: { key: ExplorerTab; label: string; count: number }[] = [
    { key: "locks", label: "Locks", count: totalLocks },
    { key: "burns", label: "Burns", count: burns.length },
  ];

  return (
    <div className="space-y-6">
      <FadeIn>
        <div>
          <h1 className="text-3xl font-bold">Explorer</h1>
          <p className="text-muted mt-2">Browse all locks and burns on MegaScan</p>
        </div>
      </FadeIn>

      {/* Tabs */}
      <FadeIn delay={50}>
        <div className="flex gap-1 border-b border-card-border">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {tab.label}
              <span className="ml-1.5 text-xs bg-card-border/50 px-1.5 py-0.5 rounded">{tab.count}</span>
            </button>
          ))}
        </div>
      </FadeIn>

      {/* Tab content */}
      {activeTab === "locks" && (
        <FadeIn delay={100}>
          {/* Lock / Unlock sub-tabs */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setLockFilter("locked")}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                lockFilter === "locked"
                  ? "bg-primary text-black"
                  : "bg-card border border-card-border text-muted hover:text-foreground"
              }`}
            >
              Locked
            </button>
            <button
              onClick={() => setLockFilter("unlocked")}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                lockFilter === "unlocked"
                  ? "bg-primary text-black"
                  : "bg-card border border-card-border text-muted hover:text-foreground"
              }`}
            >
              Unlocked
            </button>
          </div>

          {totalLocks === 0 ? (
            <div className="bg-card border border-card-border rounded-xl p-8 text-center">
              <p className="text-muted">No locks created yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {lockIds.map((id) => (
                <ExploreLockRow key={id.toString()} lockId={id} filter={lockFilter} />
              ))}
            </div>
          )}
        </FadeIn>
      )}

      {activeTab === "burns" && (
        <FadeIn delay={100}>
          {burnsLoading ? (
            <div className="bg-card border border-card-border rounded-xl p-6 animate-pulse h-32" />
          ) : burns.length === 0 ? (
            <div className="bg-card border border-card-border rounded-xl p-8 text-center">
              <p className="text-muted">No burns found</p>
            </div>
          ) : (
            <div className="bg-card border border-card-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted text-xs border-b border-card-border">
                      <th className="text-left p-3">Token</th>
                      <th className="text-left p-3">Burner</th>
                      <th className="text-right p-3">Amount</th>
                      <th className="text-right p-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {burns.map((burn, i) => (
                      <tr key={`${burn.token}-${burn.burner}-${i}`} className="border-b border-card-border/50 hover:bg-white/[0.02]">
                        <td className="p-3">
                          <Link href={`/token/${burn.token}`} className="group">
                            <div className="flex items-center gap-2">
                              <span className="font-medium group-hover:text-primary transition-colors">
                                {burn.symbol || "???"}
                              </span>
                              <span className="text-muted text-xs font-mono">{shortenAddress(burn.token)}</span>
                            </div>
                          </Link>
                        </td>
                        <td className="p-3">
                          <Link href={`/profile/${burn.burner}`} className="text-primary hover:underline text-xs font-mono">
                            {shortenAddress(burn.burner)}
                          </Link>
                        </td>
                        <td className="p-3 text-right">
                          <span className="font-semibold text-danger">
                            {formatTokenAmount(burn.amount, burn.decimals ?? 18)}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <Link href={`/token/${burn.token}`} className="text-xs text-primary hover:underline">
                            View Token
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </FadeIn>
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

function ExploreLockRow({ lockId, filter }: { lockId: bigint; filter: LockFilter }) {
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
  const { data: milestones } = useReadContract({
    address: MEGALOCK_ADDRESS, abi: MEGALOCK_ABI, functionName: "getMilestones", args: [lockId],
    query: { enabled: !!lock && lock.lockType === 2 },
  });

  if (!lock) return <div className="bg-card border border-card-border rounded-xl p-4 animate-pulse h-16" />;

  const now = Math.floor(Date.now() / 1000);
  const startT = Number(lock.startTime);
  const endT = Number(lock.endTime);
  const isUnlocked = lock.cancelled || now >= endT;

  // Filter: hide if doesn't match
  if (filter === "locked" && isUnlocked) return null;
  if (filter === "unlocked" && !isUnlocked) return null;

  const vestedPercent = lock.totalAmount > 0n && vested ? Number((vested * 10000n) / lock.totalAmount) / 100 : 0;
  const supplyPercent = totalSupply && totalSupply > 0n ? Number((lock.totalAmount * 10000n) / totalSupply) / 100 : 0;
  const displayName = tokenName && tokenSymbol ? `${tokenName} (${tokenSymbol})` : tokenSymbol || shortenAddress(lock.token);
  const remaining = lock.totalAmount - lock.claimedAmount;

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
            <span className="bg-primary/10 text-primary text-xs font-medium px-2 py-1 rounded">{getLockTypeLabel(lock.lockType)}</span>
            {lock.cancelled && <span className="bg-danger/10 text-danger text-xs font-medium px-2 py-1 rounded">Cancelled</span>}
            <span className="text-muted text-[10px]">{timeAgo(startT)}</span>
          </div>
          <div className="text-right flex items-center gap-2">
            <span className="text-sm font-semibold">{formatTokenAmount(lock.totalAmount)} {tokenSymbol || "tokens"}</span>
            {supplyPercent > 0 && <span className="text-xs text-muted">({supplyPercent.toFixed(2)}% of supply)</span>}
            <span className={`text-xs transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}>▼</span>
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between text-xs text-muted flex-wrap gap-2">
          <div className="flex gap-4 flex-wrap items-center">
            <span className="flex items-center gap-1">
              Token: <Link href={`/token/${lock.token}`} onClick={(e) => e.stopPropagation()} className="font-medium text-foreground hover:text-primary transition-colors">{displayName}</Link>
              <a href={`https://dexscreener.com/megaeth/${lock.token}`} target="_blank" rel="noopener noreferrer" title="DexScreener" onClick={(e) => e.stopPropagation()} className="opacity-60 hover:opacity-100 transition-opacity">
                <img src="/dexscreener.png" alt="DS" className="w-3.5 h-3.5 rounded-sm inline-block" />
              </a>
              <CopyBtn text={lock.token} />
            </span>
            <span className="flex items-center gap-1">
              Creator: <Link href={`/profile/${lock.creator}`} onClick={(e) => e.stopPropagation()} className="text-primary hover:underline">{shortenAddress(lock.creator)}</Link>
              <CopyBtn text={lock.creator} />
            </span>
            <span className="flex items-center gap-1">
              Beneficiary: <Link href={`/profile/${lock.beneficiary}`} onClick={(e) => e.stopPropagation()} className="text-primary hover:underline">{shortenAddress(lock.beneficiary)}</Link>
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
              <Link href={`/token/${lock.token}`}
                className="text-xs text-primary hover:underline"
                onClick={(e) => e.stopPropagation()}>Token Analytics</Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
