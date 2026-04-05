"use client";



import { useState, useEffect } from "react";

import { useParams } from "next/navigation";

import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from "wagmi";

import { formatUnits, parseAbiItem } from "viem";

import { TEMPOLOCK_ADDRESS, TEMPOLOCK_ABI, TEMPOBURN_ADDRESS, ERC20_ABI } from "@/lib/contracts";

import { formatTokenAmount, formatDateTime, getLockTypeLabel, shortenAddress } from "@/lib/utils";

import { VestingChart } from "@/components/VestingChart";

import { FadeIn } from "@/components/FadeIn";

import Link from "next/link";



import { rpcClient } from "@/lib/rpcClient";



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

  mcap: number | null;

}



function formatUsd(value: number): string {

  if (value < 0.01) return "< $0.01";

  if (value < 1) return `$${value.toFixed(4)}`;

  if (value < 1000) return `$${value.toFixed(2)}`;

  if (value < 1_000_000) return `$${(value / 1000).toFixed(1)}K`;

  if (value < 1_000_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;

  return `$${(value / 1_000_000_000).toFixed(2)}B`;

}



export default function ProfileAddressPage() {

  const params = useParams();

  const profileAddress = params.address as string;

  const { address: connectedAddress, isConnected } = useAccount();

  const publicClient = usePublicClient();



  const isOwnProfile = isConnected && connectedAddress?.toLowerCase() === profileAddress?.toLowerCase();



  const [activeTab, setActiveTab] = useState<Tab>("overview");

  const [burns, setBurns] = useState<BurnEntry[]>([]);

  const [burnsLoading, setBurnsLoading] = useState(false);

  const [positions, setPositions] = useState<PositionEntry[]>([]);

  const [positionsLoading, setPositionsLoading] = useState(false);

  const [copied, setCopied] = useState(false);



  const addr = profileAddress as `0x${string}`;



  const { data: creatorLockIds } = useReadContract({

    address: TEMPOLOCK_ADDRESS, abi: TEMPOLOCK_ABI, functionName: "getLocksByCreator",

    args: [addr],

    query: { enabled: !!profileAddress },

  });



  const { data: beneficiaryLockIds } = useReadContract({

    address: TEMPOLOCK_ADDRESS, abi: TEMPOLOCK_ABI, functionName: "getLocksByBeneficiary",

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

          address: TEMPOBURN_ADDRESS,

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



  // Fetch positions (token balances + prices + mcap)

  useEffect(() => {

    if (!profileAddress) { setPositions([]); return; }



    const fetchPositions = async () => {

      setPositionsLoading(true);

      try {

        const addr = profileAddress as `0x${string}`;

        const entries: PositionEntry[] = [];



        // 1. Native balance

        try {

          const nativeBalance = await rpcClient.getBalance({ address: addr });

          if (nativeBalance > 0n) {

            entries.push({

              token: "native", symbol: "USD", name: "Tempo", decimals: 18,

              balance: nativeBalance, priceUsd: null, priceChange24h: null, valueUsd: null, mcap: null,

            });

          }

        } catch { /* skip */ }



        // 2. Discover tokens: known list + Transfer events

        const tokenAddresses = new Set<string>();



        // Known tokens from API

        try {

          const res = await fetch("/api/known-tokens");

          if (res.ok) {

            const list = await res.json();

            for (const t of list) tokenAddresses.add(t.address.toLowerCase());

          }

        } catch { /* skip */ }



        // Discover via Transfer events (scan full history for this specific wallet)

        try {

          const logs = await rpcClient.getLogs({

            event: parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)"),

            args: { to: addr },

            fromBlock: 0n,

            toBlock: "latest",

          });

          for (const log of logs) tokenAddresses.add(log.address.toLowerCase());

        } catch {

          // If full scan fails (too many results), try recent blocks only

          try {

            const currentBlock = await rpcClient.getBlockNumber();

            const fromBlock = currentBlock > 1000000n ? currentBlock - 1000000n : 0n;

            const logs = await rpcClient.getLogs({

              event: parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)"),

              args: { to: addr },

              fromBlock,

              toBlock: "latest",

            });

            for (const log of logs) tokenAddresses.add(log.address.toLowerCase());

          } catch { /* skip */ }

        }



        // 3. Check balances

        const allAddrs = Array.from(tokenAddresses);

        const balResults = await Promise.allSettled(

          allAddrs.map((a) =>

            rpcClient.readContract({ address: a as `0x${string}`, abi: ERC20_ABI, functionName: "balanceOf", args: [addr] })

          )

        );



        // 4. Resolve token info for those with balance > 0

        const toResolve: { address: string; balance: bigint }[] = [];

        for (let i = 0; i < allAddrs.length; i++) {

          const r = balResults[i];

          if (r.status === "fulfilled") {

            const bal = r.value as bigint;

            if (bal > 0n) toResolve.push({ address: allAddrs[i], balance: bal });

          }

        }



        const infoResults = await Promise.allSettled(

          toResolve.map(async ({ address, balance }) => {

            const [name, symbol, decimals] = await Promise.all([

              rpcClient.readContract({ address: address as `0x${string}`, abi: ERC20_ABI, functionName: "name" }),

              rpcClient.readContract({ address: address as `0x${string}`, abi: ERC20_ABI, functionName: "symbol" }),

              rpcClient.readContract({ address: address as `0x${string}`, abi: ERC20_ABI, functionName: "decimals" }),

            ]);

            return {

              token: address, name: name as string, symbol: symbol as string,

              decimals: Number(decimals), balance,

              priceUsd: null, priceChange24h: null, valueUsd: null, mcap: null,

            } as PositionEntry;

          })

        );



        for (const r of infoResults) {

          if (r.status === "fulfilled") entries.push(r.value);

        }



        // Enrich with Enshrined price data

        try {

          const enshrinedRes = await fetch("/api/tokens");

          if (enshrinedRes.ok) {

            const allEnshrinedTokens = await enshrinedRes.json();

            if (Array.isArray(allEnshrinedTokens)) {

              for (const entry of entries) {

                if (entry.token === "native") continue;

                const eToken = allEnshrinedTokens.find((t: { address: string }) =>

                  t.address?.toLowerCase() === entry.token.toLowerCase()

                );

                if (eToken) {

                  const vUsd = Number(eToken.virtual_usd || 0);

                  const vTokens = Number(eToken.virtual_tokens || 0);

                  if (vTokens > 0) {

                    const price = vUsd / vTokens;

                    entry.priceUsd = price;

                    const humanBal = Number(entry.balance) / (10 ** entry.decimals);

                    entry.valueUsd = price * humanBal;

                    entry.mcap = price * 1_000_000_000;

                  }

                }

              }

            }

          }

        } catch { /* skip */ }



        // Fetch PnL from trades for this wallet

        try {

          for (const entry of entries) {

            if (entry.token === "native") continue;

            try {

              const infoRes = await fetch(`/api/token-info?address=${entry.token}`);

              if (infoRes.ok) {

                const info = await infoRes.json();

                if (info?.topTraders) {

                  const me = info.topTraders.find((t: { address: string }) =>

                    t.address.toLowerCase() === profileAddress.toLowerCase()

                  );

                  if (me) {

                    entry.priceChange24h = me.pnl; // reuse field for PnL

                  }

                }

              }

            } catch { /* skip */ }

          }

        } catch { /* skip */ }



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



  const tabs: { key: Tab; label: string; count?: number }[] = [

    { key: "overview", label: "Overview" },

    { key: "positions", label: "Positions", count: positions.length },

    { key: "locks", label: "Locks", count: lockIds.length },

    { key: "burns", label: "Burns", count: burns.length },

  ];



  return (

    <div className="space-y-6">

      <FadeIn>

        <h1 className="text-3xl font-bold">{isOwnProfile ? "My Wallet" : "Wallet Profile"}</h1>

      </FadeIn>



      {/* Wallet Card */}

      <FadeIn delay={50}>

        <div className="bg-card border border-card-border rounded-xl p-6">

          <div className="flex items-center gap-4">

            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">

              <span className="text-primary text-lg font-bold">

                {profileAddress.slice(2, 4).toUpperCase()}

              </span>

            </div>

            <div className="space-y-1">

              <div className="flex items-center gap-2">

                <span className="text-sm font-mono">{profileAddress}</span>

                <a

                  href={`https://explore.mainnet.tempo.xyz/address/${profileAddress}`}

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

              {isOwnProfile && <span className="text-xs text-primary font-medium">Your wallet</span>}

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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

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

              {(totalPortfolioValue > 0 || positions.some(p => p.priceChange24h !== null)) && (

                <div className="p-4 border-b border-card-border flex gap-6">

                  {totalPortfolioValue > 0 && (

                    <div>

                      <p className="text-muted text-xs">Total Value</p>

                      <p className="text-xl font-bold">{formatUsd(totalPortfolioValue)}</p>

                    </div>

                  )}

                  {(() => {

                    const totalPnl = positions.reduce((sum, p) => sum + (p.priceChange24h ?? 0), 0);

                    return totalPnl !== 0 ? (

                      <div>

                        <p className="text-muted text-xs">Total PnL</p>

                        <p className={`text-xl font-bold ${totalPnl >= 0 ? "text-success" : "text-danger"}`}>

                          {totalPnl >= 0 ? "+" : ""}{formatUsd(Math.abs(totalPnl))}

                        </p>

                      </div>

                    ) : null;

                  })()}

                </div>

              )}

              <div className="overflow-x-auto">

                <table className="w-full text-sm">

                  <thead>

                    <tr className="text-muted text-xs border-b border-card-border">

                      <th className="text-left p-3">Token</th>

                      <th className="text-right p-3">Balance</th>

                      <th className="text-right p-3">MCap</th>

                      <th className="text-right p-3">Value</th>

                      <th className="text-right p-3">PnL</th>

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

                          {pos.mcap ? formatUsd(pos.mcap) : "\u2014"}

                        </td>

                        <td className="p-3 text-right font-medium">

                          {pos.valueUsd ? formatUsd(pos.valueUsd) : "\u2014"}

                        </td>

                        <td className={`p-3 text-right font-medium ${

                          pos.priceChange24h === null ? "text-muted" :

                          pos.priceChange24h >= 0 ? "text-success" : "text-danger"

                        }`}>

                          {pos.priceChange24h !== null

                            ? `${pos.priceChange24h >= 0 ? "+" : ""}${formatUsd(Math.abs(pos.priceChange24h))}`

                            : "\u2014"}

                        </td>

                        <td className="p-3 text-right">

                          <div className="flex items-center justify-end gap-2">

                            <Link href={`/token/${pos.token}`} className="text-xs text-primary hover:underline">View</Link>

                            <a href={`https://www.defined.fi/tempo/${pos.token}`} target="_blank" rel="noopener noreferrer"

                              className="opacity-60 hover:opacity-100 transition-opacity">

                              <span className="text-[10px] font-medium text-primary">Defined</span>

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

                          <a href={`https://www.defined.fi/tempo/${burn.token}`} target="_blank" rel="noopener noreferrer"

                            className="opacity-60 hover:opacity-100 transition-opacity">

                            <span className="text-[10px] font-medium text-primary">Defined</span>

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

    address: TEMPOLOCK_ADDRESS, abi: TEMPOLOCK_ABI, functionName: "getLock", args: [lockId],

  });

  const { data: claimable } = useReadContract({

    address: TEMPOLOCK_ADDRESS, abi: TEMPOLOCK_ABI, functionName: "getClaimableAmount", args: [lockId],

  });

  const { data: vested } = useReadContract({

    address: TEMPOLOCK_ADDRESS, abi: TEMPOLOCK_ABI, functionName: "getVestedAmount", args: [lockId],

  });

  const { data: tokenSymbol } = useReadContract({

    address: (lock?.token ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,

    abi: ERC20_ABI, functionName: "symbol",

    query: { enabled: !!lock },

  });

  const { data: milestones } = useReadContract({

    address: TEMPOLOCK_ADDRESS, abi: TEMPOLOCK_ABI, functionName: "getMilestones", args: [lockId],

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

              <a href={`https://www.defined.fi/tempo/${lock.token}`} target="_blank" rel="noopener noreferrer" title="DexScreener" onClick={(e) => e.stopPropagation()} className="opacity-60 hover:opacity-100 transition-opacity">

                <span className="text-[10px] font-medium text-primary">Defined</span>

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

                  onClick={(e) => { e.stopPropagation(); claimTokens({ address: TEMPOLOCK_ADDRESS, abi: TEMPOLOCK_ABI, functionName: "claim", args: [lockId] }); }}

                  disabled={isClaiming || isClaimConfirming}

                  className="bg-success hover:bg-success/80 disabled:opacity-50 text-white text-xs font-medium py-1.5 px-4 rounded-lg transition-colors"

                >

                  {isClaiming || isClaimConfirming ? "Claiming..." : "Claim"}

                </button>

              )}

              {isOwnProfile && isCreator && lock.cancelable && !lock.cancelled && (

                <button

                  onClick={(e) => { e.stopPropagation(); cancelLock({ address: TEMPOLOCK_ADDRESS, abi: TEMPOLOCK_ABI, functionName: "cancel", args: [lockId] }); }}

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

