"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { formatUnits, parseAbiItem } from "viem";
import { MEGALOCK_ADDRESS, MEGALOCK_ABI, MEGABURN_ADDRESS, ERC20_ABI } from "@/lib/contracts";
import { formatTokenAmount, formatDateTime, getLockTypeLabel, shortenAddress } from "@/lib/utils";
import { VestingChart } from "@/components/VestingChart";
import { FadeIn } from "@/components/FadeIn";
import { useProfile } from "@/contexts/ProfileContext";
import Link from "next/link";

const BLOCKSCOUT_API = "https://megaeth.blockscout.com/api/v2";

type Tab = "overview" | "positions" | "locks" | "burns";

interface BurnEntry {
  token: string;
  amount: bigint;
  symbol?: string;
  decimals?: number;
}

interface PositionEntry {
  token: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: bigint;
  priceUsd: number | null;
  priceChange24h: number | null;
  valueUsd: number | null;
}

function formatUsd(value: number): string {
  if (value < 0.01) return "< $0.01";
  if (value < 1) return `$${value.toFixed(4)}`;
  if (value < 1000) return `$${value.toFixed(2)}`;
  if (value < 1_000_000) return `$${(value / 1000).toFixed(1)}K`;
  return `$${(value / 1_000_000).toFixed(2)}M`;
}

function formatPrice(price: number): string {
  if (price < 0.000001) return `$${price.toExponential(2)}`;
  if (price < 0.01) return `$${price.toFixed(6)}`;
  if (price < 1) return `$${price.toFixed(4)}`;
  if (price < 1000) return `$${price.toFixed(2)}`;
  return `$${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export default function ProfileAddressPage() {
  const params = useParams();
  const profileAddress = params.address as string;
  const { address: connectedAddress, isConnected } = useAccount();
  const { username, xHandle, setUsername, setXHandle } = useProfile();
  const publicClient = usePublicClient();

  const isOwnProfile = isConnected && connectedAddress?.toLowerCase() === profileAddress?.toLowerCase();

  const [editingUsername, setEditingUsername] = useState(false);
  const [editingX, setEditingX] = useState(false);
  const [tempUsername, setTempUsername] = useState("");
  const [tempX, setTempX] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [burns, setBurns] = useState<BurnEntry[]>([]);
  const [burnsLoading, setBurnsLoading] = useState(false);
  const [positions, setPositions] = useState<PositionEntry[]>([]);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const addr = profileAddress as `0x${string}`;

  const { data: creatorLockIds } = useReadContract({
    address: MEGALOCK_ADDRESS, abi: MEGALOCK_ABI, functionName: "getLocksByCreator",
    args: [addr],
    query: { enabled: !!profileAddress },
  });

  const { data: beneficiaryLockIds } = useReadContract({
    address: MEGALOCK_ADDRESS, abi: MEGALOCK_ABI, functionName: "getLocksByBeneficiary",
    args: [addr],
    query: { enabled: !!profileAddress },
  });

  const allIds = new Set([...(creatorLockIds ?? []), ...(beneficiaryLockIds ?? [])]);
  const lockIds = Array.from(allIds).sort((a, b) => Number(b) - Number(a));

  // Fetch burn events
  useEffect(() => {
    if (!publicClient || !profileAddress) { setBurns([]); return; }

    const fetchBurns = async () => {
      setBurnsLoading(true);
      try {
        const logs = await publicClient.getLogs({
          address: MEGABURN_ADDRESS,
          event: parseAbiItem("event TokensBurned(address indexed token, address indexed burner, uint256 amount)"),
          args: { burner: addr },
          fromBlock: 0n,
          toBlock: "latest",
        });

        const map = new Map<string, bigint>();
        for (const log of logs) {
          const token = log.args.token!;
          const amount = log.args.amount!;
          map.set(token, (map.get(token) ?? 0n) + amount);
        }

        const entries: BurnEntry[] = [];
        for (const [token, amount] of map) {
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
          entries.push({ token, amount, symbol, decimals });
        }
        setBurns(entries);
      } catch {
        setBurns([]);
      } finally {
        setBurnsLoading(false);
      }
    };

    fetchBurns();
  }, [publicClient, profileAddress]);

  // Fetch positions (token balances + prices)
  useEffect(() => {
    if (!profileAddress) { setPositions([]); return; }

    const fetchPositions = async () => {
      setPositionsLoading(true);
      try {
        const res = await fetch(`${BLOCKSCOUT_API}/addresses/${profileAddress}/token-balances`);
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();

        const tokens = data.filter((b: any) =>
          b.token?.type === "ERC-20" && BigInt(b.value || "0") > 0n
        );

        const entries: PositionEntry[] = tokens.map((b: any) => ({
          token: b.token.address_hash || b.token.address,
          symbol: b.token.symbol || "???",
          name: b.token.name || "Unknown",
          decimals: parseInt(b.token.decimals) || 18,
          balance: BigInt(b.value),
          priceUsd: null,
          priceChange24h: null,
          valueUsd: null,
        }));

        // Fetch prices from DexScreener (limit to 20 tokens)
        await Promise.allSettled(
          entries.slice(0, 20).map(async (entry) => {
            try {
              const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${entry.token}`);
              if (!r.ok) return;
              const d = await r.json();
              const pair = d.pairs?.[0];
              if (pair) {
                entry.priceUsd = parseFloat(pair.priceUsd) || null;
                entry.priceChange24h = pair.priceChange?.h24 ?? null;
                if (entry.priceUsd) {
                  entry.valueUsd = parseFloat(formatUnits(entry.balance, entry.decimals)) * entry.priceUsd;
                }
              }
            } catch { /* skip */ }
          })
        );

        entries.sort((a, b) => (b.valueUsd ?? -1) - (a.valueUsd ?? -1));
        setPositions(entries);
      } catch {
        setPositions([]);
      } finally {
        setPositionsLoading(false);
      }
    };

    fetchPositions();
  }, [profileAddress]);

  const copyAddress = () => {
    navigator.clipboard.writeText(profileAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const totalPortfolioValue = positions.reduce((sum, p) => sum + (p.valueUsd ?? 0), 0);

  if (!profileAddress || !profileAddress.startsWith("0x")) {
    return (
      <div className="bg-card border border-card-border rounded-xl p-8 text-center">
        <h1 className="text-2xl font-bold mb-2">Invalid Address</h1>
        <p className="text-muted">The provided address is not valid</p>
      </div>
    );
  }

  const displayName = isOwnProfile ? username : null;

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "overview", label: "Overview" },
    { key: "positions", label: "Positions", count: positions.length },
    { key: "locks", label: "Locks", count: lockIds.length },
    { key: "burns", label: "Burns", count: burns.length },
  ];

  return (
    <div className="space-y-6">
      <FadeIn>
        <h1 className="text-3xl font-bold">{isOwnProfile ? "Profile" : "Wallet Profile"}</h1>
      </FadeIn>

      {/* Profile Card */}
      <FadeIn delay={50}>
        <div className="bg-card border border-card-border rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <span className="text-primary text-xl font-bold">
                {displayName ? displayName[0].toUpperCase() : profileAddress.slice(2, 4).toUpperCase()}
              </span>
            </div>

            <div className="flex-1 space-y-3">
              {/* Username */}
              {isOwnProfile ? (
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
              ) : null}

              {/* Wallet address + explorer + copy */}
              <div className="flex items-center gap-2">
                <span className="text-muted text-xs font-mono">{profileAddress}</span>
                <a
                  href={`https://megaeth.blockscout.com/address/${profileAddress}`}
                  target="_blank" rel="noopener noreferrer"
                  className="text-muted hover:text-primary transition-colors" title="View on Explorer"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </a>
                <button onClick={copyAddress} className="text-muted hover:text-primary transition-colors" title={copied ? "Copied!" : "Copy address"}>
                  {copied ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                    </svg>
                  )}
                </button>
              </div>

              {/* X Handle */}
              {isOwnProfile ? (
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
              ) : null}
            </div>
          </div>
        </div>
      </FadeIn>

      {/* Tabs */}
      <FadeIn delay={100}>
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
              {tab.count !== undefined && (
                <span className="ml-1.5 text-xs bg-card-border/50 px-1.5 py-0.5 rounded">{tab.count}</span>
              )}
            </button>
          ))}
        </div>
      </FadeIn>

      {/* Tab content */}
      {activeTab === "overview" && (
        <FadeIn delay={150}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-card border border-card-border rounded-xl p-5">
              <p className="text-muted text-xs mb-1">Portfolio Value</p>
              <p className="text-2xl font-bold text-primary">
                {positionsLoading ? "..." : totalPortfolioValue > 0 ? formatUsd(totalPortfolioValue) : "$0"}
              </p>
              <p className="text-xs text-muted mt-1">{positions.length} token{positions.length !== 1 ? "s" : ""} held</p>
            </div>
            <div className="bg-card border border-card-border rounded-xl p-5">
              <p className="text-muted text-xs mb-1">Active Locks</p>
              <p className="text-2xl font-bold">{lockIds.length}</p>
              <p className="text-xs text-muted mt-1">
                {(creatorLockIds?.length ?? 0)} created, {(beneficiaryLockIds?.length ?? 0)} as beneficiary
              </p>
            </div>
            <div className="bg-card border border-card-border rounded-xl p-5">
              <p className="text-muted text-xs mb-1">Tokens Burned</p>
              <p className="text-2xl font-bold text-danger">{burns.length}</p>
              <p className="text-xs text-muted mt-1">{burns.length} unique token{burns.length !== 1 ? "s" : ""}</p>
            </div>
            {isOwnProfile && (
              <div className="bg-card border border-card-border rounded-xl p-5">
                <p className="text-muted text-xs mb-1">Profile</p>
                <p className="text-2xl font-bold">{username || "---"}</p>
                <p className="text-xs text-muted mt-1">{xHandle ? `@${xHandle}` : "No X linked"}</p>
              </div>
            )}
          </div>
        </FadeIn>
      )}

      {activeTab === "positions" && (
        <div>
          {positionsLoading ? (
            <div className="bg-card border border-card-border rounded-xl p-6 animate-pulse h-32" />
          ) : positions.length === 0 ? (
            <div className="bg-card border border-card-border rounded-xl p-6 text-center">
              <p className="text-muted text-sm">No token positions found</p>
            </div>
          ) : (
            <div className="bg-card border border-card-border rounded-xl overflow-hidden">
              {totalPortfolioValue > 0 && (
                <div className="p-4 border-b border-card-border">
                  <p className="text-muted text-xs">Total Value</p>
                  <p className="text-xl font-bold text-primary">{formatUsd(totalPortfolioValue)}</p>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted text-xs border-b border-card-border">
                      <th className="text-left p-3">Token</th>
                      <th className="text-right p-3">Balance</th>
                      <th className="text-right p-3">Price</th>
                      <th className="text-right p-3">Value</th>
                      <th className="text-right p-3">24h</th>
                      <th className="text-right p-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((pos) => (
                      <tr key={pos.token} className="border-b border-card-border/50 hover:bg-white/[0.02]">
                        <td className="p-3">
                          <div>
                            <span className="font-medium">{pos.symbol}</span>
                            <span className="text-muted text-xs ml-1.5 hidden sm:inline">{pos.name}</span>
                          </div>
                          <span className="text-muted text-[10px] font-mono">{shortenAddress(pos.token)}</span>
                        </td>
                        <td className="p-3 text-right font-medium">
                          {formatTokenAmount(pos.balance, pos.decimals)}
                        </td>
                        <td className="p-3 text-right text-muted">
                          {pos.priceUsd ? formatPrice(pos.priceUsd) : "\u2014"}
                        </td>
                        <td className="p-3 text-right font-medium">
                          {pos.valueUsd ? formatUsd(pos.valueUsd) : "\u2014"}
                        </td>
                        <td className={`p-3 text-right font-medium ${
                          pos.priceChange24h === null ? "text-muted" :
                          pos.priceChange24h >= 0 ? "text-success" : "text-danger"
                        }`}>
                          {pos.priceChange24h !== null
                            ? `${pos.priceChange24h >= 0 ? "+" : ""}${pos.priceChange24h.toFixed(1)}%`
                            : "\u2014"}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Link href={`/token/${pos.token}`} className="text-xs text-primary hover:underline">View</Link>
                            <a href={`https://dexscreener.com/megaeth/${pos.token}`} target="_blank" rel="noopener noreferrer"
                              className="opacity-60 hover:opacity-100 transition-opacity">
                              <img src="/dexscreener.png" alt="DS" className="w-3.5 h-3.5 rounded-sm" />
                            </a>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "locks" && (
        <div>
          {lockIds.length === 0 ? (
            <div className="bg-card border border-card-border rounded-xl p-6 text-center">
              <p className="text-muted text-sm">No locks found for this address</p>
            </div>
          ) : (
            <div className="space-y-3">
              {lockIds.map((id) => (
                <LockCard key={id.toString()} lockId={id} profileAddress={profileAddress} isOwnProfile={!!isOwnProfile} />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "burns" && (
        <div>
          {burnsLoading ? (
            <div className="bg-card border border-card-border rounded-xl p-6 animate-pulse h-32" />
          ) : burns.length === 0 ? (
            <div className="bg-card border border-card-border rounded-xl p-6 text-center">
              <p className="text-muted text-sm">No burns found for this address</p>
            </div>
          ) : (
            <div className="bg-card border border-card-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted text-xs border-b border-card-border">
                    <th className="text-left p-3">Token</th>
                    <th className="text-right p-3">Amount Burned</th>
                    <th className="text-right p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {burns.map((burn) => (
                    <tr key={burn.token} className="border-b border-card-border/50">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{burn.symbol || shortenAddress(burn.token)}</span>
                          <span className="text-muted text-xs font-mono">{shortenAddress(burn.token)}</span>
                          <a href={`https://dexscreener.com/megaeth/${burn.token}`} target="_blank" rel="noopener noreferrer"
                            className="opacity-60 hover:opacity-100 transition-opacity">
                            <img src="/dexscreener.png" alt="DS" className="w-3.5 h-3.5 rounded-sm inline-block" />
                          </a>
                        </div>
                      </td>
                      <td className="p-3 text-right">
                        <span className="font-semibold text-danger">{formatTokenAmount(burn.amount, burn.decimals ?? 18)}</span>
                      </td>
                      <td className="p-3 text-right">
                        <Link href={`/token/${burn.token}`} className="text-xs text-primary hover:underline">View Token</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LockCard({ lockId, profileAddress, isOwnProfile }: { lockId: bigint; profileAddress: string; isOwnProfile: boolean }) {
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

  const isBeneficiary = lock.beneficiary.toLowerCase() === profileAddress.toLowerCase();
  const isCreator = lock.creator.toLowerCase() === profileAddress.toLowerCase();
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
              Creator: <Link href={`/profile/${lock.creator}`} onClick={(e) => e.stopPropagation()} className="text-primary hover:underline">{shortenAddress(lock.creator)}</Link>
            </span>
            <span className="flex items-center gap-1">
              Beneficiary: <Link href={`/profile/${lock.beneficiary}`} onClick={(e) => e.stopPropagation()} className="text-primary hover:underline">{shortenAddress(lock.beneficiary)}</Link>
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
              {isOwnProfile && isBeneficiary && !lock.cancelled && claimable && claimable > 0n && (
                <button
                  onClick={(e) => { e.stopPropagation(); claimTokens({ address: MEGALOCK_ADDRESS, abi: MEGALOCK_ABI, functionName: "claim", args: [lockId] }); }}
                  disabled={isClaiming || isClaimConfirming}
                  className="bg-success hover:bg-success/80 disabled:opacity-50 text-white text-xs font-medium py-1.5 px-4 rounded-lg transition-colors"
                >
                  {isClaiming || isClaimConfirming ? "Claiming..." : "Claim"}
                </button>
              )}
              {isOwnProfile && isCreator && lock.cancelable && !lock.cancelled && (
                <button
                  onClick={(e) => { e.stopPropagation(); cancelLock({ address: MEGALOCK_ADDRESS, abi: MEGALOCK_ABI, functionName: "cancel", args: [lockId] }); }}
                  disabled={isCancelling || isCancelConfirming}
                  className="bg-danger hover:bg-danger/80 disabled:opacity-50 text-white text-xs font-medium py-1.5 px-4 rounded-lg transition-colors"
                >
                  {isCancelling || isCancelConfirming ? "Cancelling..." : "Cancel Lock"}
                </button>
              )}
              <Link href={`/token/${lock.token}`}
                className="text-xs text-primary hover:underline py-1.5"
                onClick={(e) => e.stopPropagation()}>Token Analytics</Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
