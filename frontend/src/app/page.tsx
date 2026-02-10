"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useReadContract, usePublicClient } from "wagmi";
import { parseAbiItem } from "viem";
import { MEGALOCK_ADDRESS, MEGALOCK_ABI, MEGABURN_ADDRESS, ERC20_ABI } from "@/lib/contracts";
import { shortenAddress, formatTokenAmount, timeAgo, formatUsd } from "@/lib/utils";
import { useWatchlist } from "@/hooks/useWatchlist";
import { FadeIn } from "@/components/FadeIn";

interface ActivityEvent {
  type: "lock" | "burn";
  token: string;
  tokenSymbol: string;
  actor: string;
  amount: bigint;
  decimals: number;
  timestamp: number;
}

interface SearchResult {
  type: string;
  name: string;
  symbol: string;
  address_hash: string;
  icon_url: string | null;
  token_type: string;
  circulating_market_cap: string | null;
  exchange_rate: string | null;
}

export default function Dashboard() {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchMcap, setSearchMcap] = useState<Record<string, string>>({});
  const { watchlist, removeToken } = useWatchlist();
  const publicClient = usePublicClient();
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [watchlistData, setWatchlistData] = useState<Record<string, { mcap: string | null; volume: string | null; price: string | null }>>({});

  // Fetch market data for watchlist tokens (Blockscout + DexScreener fallback)
  useEffect(() => {
    if (watchlist.length === 0) return;
    const fetchData = async () => {
      const data: Record<string, { mcap: string | null; volume: string | null; price: string | null }> = {};
      await Promise.all(
        watchlist.map(async (token) => {
          try {
            // Try Blockscout first
            const res = await fetch(`https://megaeth.blockscout.com/api/v2/tokens/${token.address}`);
            if (res.ok) {
              const info = await res.json();
              if (info.circulating_market_cap || info.volume_24h || info.exchange_rate) {
                data[token.address.toLowerCase()] = {
                  mcap: info.circulating_market_cap || null,
                  volume: info.volume_24h || null,
                  price: info.exchange_rate || null,
                };
                return;
              }
            }
            // Fallback: DexScreener
            const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${token.address}`);
            if (dexRes.ok) {
              const dex = await dexRes.json();
              const pair = dex.pairs?.[0];
              if (pair) {
                data[token.address.toLowerCase()] = {
                  mcap: pair.marketCap ? String(pair.marketCap) : pair.fdv ? String(pair.fdv) : null,
                  volume: pair.volume?.h24 ? String(pair.volume.h24) : null,
                  price: pair.priceUsd || null,
                };
              }
            }
          } catch { /* skip */ }
        })
      );
      setWatchlistData(data);
    };
    fetchData();
  }, [watchlist]);

  const { data: nextLockId } = useReadContract({
    address: MEGALOCK_ADDRESS, abi: MEGALOCK_ABI, functionName: "nextLockId",
  });

  const totalLocks = nextLockId !== undefined ? Number(nextLockId) : null;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-search as user types (debounced 400ms)
  useEffect(() => {
    const query = searchInput.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);

    // Clear results if input too short or is an address
    if (query.length < 2 || (query.length === 42 && query.startsWith("0x"))) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://megaeth.blockscout.com/api/v2/search?q=${encodeURIComponent(query)}`
        );
        if (!res.ok) throw new Error();
        const data = await res.json();
        const tokens = (data.items || []).filter(
          (item: SearchResult) => item.type === "token" && item.token_type === "ERC-20"
        );
        setSearchResults(tokens);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchInput]);

  // Fetch mcap from DexScreener for search results
  useEffect(() => {
    if (searchResults.length === 0) { setSearchMcap({}); return; }
    const fetchMcaps = async () => {
      const map: Record<string, string> = {};
      await Promise.all(
        searchResults.map(async (result) => {
          if (result.circulating_market_cap) { map[result.address_hash] = result.circulating_market_cap; return; }
          try {
            const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${result.address_hash}`);
            if (!res.ok) return;
            const data = await res.json();
            const pair = data.pairs?.[0];
            if (pair?.marketCap) map[result.address_hash] = String(pair.marketCap);
            else if (pair?.fdv) map[result.address_hash] = String(pair.fdv);
          } catch { /* skip */ }
        })
      );
      setSearchMcap(map);
    };
    fetchMcaps();
  }, [searchResults]);

  const handleSubmit = () => {
    const query = searchInput.trim();
    if (!query) return;
    if (query.length === 42 && query.startsWith("0x")) {
      router.push(`/token/${query}`);
    } else if (searchResults.length > 0) {
      router.push(`/token/${searchResults[0].address_hash}`);
    }
  };

  useEffect(() => {
    if (!publicClient) return;

    const fetchActivity = async () => {
      setActivitiesLoading(true);
      try {
        const [lockLogs, burnLogs] = await Promise.all([
          publicClient.getLogs({
            address: MEGALOCK_ADDRESS,
            event: parseAbiItem(
              "event LockCreated(uint256 indexed lockId, address indexed token, address indexed beneficiary, address creator, uint256 amount, uint8 lockType)"
            ),
            fromBlock: 0n,
            toBlock: "latest",
          }),
          publicClient.getLogs({
            address: MEGABURN_ADDRESS,
            event: parseAbiItem(
              "event TokensBurned(address indexed token, address indexed burner, uint256 amount)"
            ),
            fromBlock: 0n,
            toBlock: "latest",
          }),
        ]);

        const symbolCache = new Map<string, { symbol: string; decimals: number }>();
        const resolveToken = async (addr: string) => {
          if (symbolCache.has(addr.toLowerCase())) return symbolCache.get(addr.toLowerCase())!;
          try {
            const [symbol, decimals] = await Promise.all([
              publicClient.readContract({ address: addr as `0x${string}`, abi: ERC20_ABI, functionName: "symbol" }),
              publicClient.readContract({ address: addr as `0x${string}`, abi: ERC20_ABI, functionName: "decimals" }),
            ]);
            const entry = { symbol: symbol as string, decimals: Number(decimals) };
            symbolCache.set(addr.toLowerCase(), entry);
            return entry;
          } catch {
            return { symbol: "???", decimals: 18 };
          }
        };

        const allLogs = [
          ...lockLogs.slice(-5).map((l) => ({ ...l, _type: "lock" as const })),
          ...burnLogs.slice(-5).map((l) => ({ ...l, _type: "burn" as const })),
        ];
        allLogs.sort((a, b) => Number((b.blockNumber ?? 0n) - (a.blockNumber ?? 0n)));
        const recentLogs = allLogs.slice(0, 3);

        const blockCache = new Map<bigint, number>();
        const events: ActivityEvent[] = [];

        for (const log of recentLogs) {
          const blockNum = log.blockNumber ?? 0n;
          let timestamp = blockCache.get(blockNum);
          if (timestamp === undefined) {
            try {
              const block = await publicClient.getBlock({ blockNumber: blockNum });
              timestamp = Number(block.timestamp);
              blockCache.set(blockNum, timestamp);
            } catch {
              timestamp = Math.floor(Date.now() / 1000);
            }
          }

          if (log._type === "lock") {
            const token = log.args.token as string;
            const info = await resolveToken(token);
            events.push({
              type: "lock", token, tokenSymbol: info.symbol,
              actor: (log.args.creator as string) || "",
              amount: log.args.amount as bigint,
              decimals: info.decimals, timestamp,
            });
          } else {
            const token = log.args.token as string;
            const info = await resolveToken(token);
            events.push({
              type: "burn", token, tokenSymbol: info.symbol,
              actor: (log.args.burner as string) || "",
              amount: log.args.amount as bigint,
              decimals: info.decimals, timestamp,
            });
          }
        }

        events.sort((a, b) => b.timestamp - a.timestamp);
        setActivities(events);
      } catch {
        setActivities([]);
      } finally {
        setActivitiesLoading(false);
      }
    };

    fetchActivity();
  }, [publicClient]);

  return (
    <div className="space-y-16 pb-12">
      {/* Hero */}
      <section className="pt-6 md:pt-12">
        <FadeIn>
          <h1 className="text-4xl md:text-5xl font-extrabold leading-tight gradient-text inline-block">
            MegaScan
          </h1>
          <p className="text-muted text-base md:text-lg mt-3 max-w-lg">
            Scan tokens. Lock liquidity. Burn supply.<br className="hidden md:block" />
            The MegaETH token toolkit.
          </p>
        </FadeIn>

        {/* Quick search */}
        <FadeIn delay={100}>
          <div className="mt-8 max-w-xl">
            <div className="flex gap-2">
              <input
                type="text" placeholder="Search by name, symbol, or address (0x...)"
                value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                className="flex-1 bg-card border border-card-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-primary transition-colors"
              />
              <button onClick={handleSubmit}
                className="bg-primary hover:bg-primary-hover text-black font-semibold py-2.5 px-5 rounded-lg transition-colors text-sm">
                Scan
              </button>
            </div>

            {/* Search results dropdown */}
            {searching && (
              <div className="mt-2 bg-card border border-card-border rounded-xl p-4 animate-pulse h-16" />
            )}
            {!searching && searchResults.length > 0 && (
              <div className="mt-2 bg-card border border-card-border rounded-xl overflow-hidden max-h-80 overflow-y-auto">
                {searchResults.map((result) => (
                  <Link
                    key={result.address_hash}
                    href={`/token/${result.address_hash}`}
                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.04] border-b border-card-border/50 last:border-b-0 transition-colors"
                  >
                    {result.icon_url ? (
                      <img src={result.icon_url} alt="" className="w-6 h-6 rounded-full" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-primary text-[10px] font-bold">{result.symbol?.slice(0, 2)}</span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{result.name}</span>
                      <span className="text-muted text-xs ml-1.5">({result.symbol})</span>
                    </div>
                    <div className="text-right shrink-0">
                      {(result.circulating_market_cap || searchMcap[result.address_hash]) ? (
                        <span className="text-xs font-medium">{formatUsd(result.circulating_market_cap || searchMcap[result.address_hash])}</span>
                      ) : (
                        <span className="text-muted text-[10px] font-mono">{shortenAddress(result.address_hash)}</span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </FadeIn>
      </section>

      {/* Stats bar */}
      <section>
        <FadeIn>
          <div className="flex flex-wrap gap-8 text-sm">
            <div>
              <span className="text-2xl font-bold text-primary">{totalLocks ?? "—"}</span>
              <span className="text-muted ml-2">locks on-chain</span>
            </div>
            <div>
              <span className="text-2xl font-bold text-foreground">3</span>
              <span className="text-muted ml-2">vesting modes</span>
            </div>
            <div>
              <span className="text-2xl font-bold text-foreground">MegaETH</span>
              <span className="text-muted ml-2">network</span>
            </div>
          </div>
        </FadeIn>
      </section>

      {/* Watchlist */}
      {watchlist.length > 0 && (
        <section>
          <FadeIn>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-4">Watchlist</p>
          </FadeIn>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {watchlist.map((token, i) => (
              <FadeIn key={token.address} delay={i * 50}>
                <div className="bg-card border border-card-border rounded-xl p-4 card-glow card-texture group relative">
                  <button
                    onClick={() => removeToken(token.address)}
                    className="absolute top-3 right-3 text-muted hover:text-danger transition-colors opacity-0 group-hover:opacity-100"
                    title="Remove from watchlist"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                  <Link href={`/token/${token.address}`} className="block">
                    <h4 className="font-semibold group-hover:text-primary transition-colors">
                      {token.name} <span className="text-muted font-normal">({token.symbol})</span>
                    </h4>
                    {(() => {
                      const d = watchlistData[token.address.toLowerCase()];
                      return d ? (
                        <div className="flex gap-3 mt-1.5 text-[11px]">
                          {d.mcap && <span className="text-muted">MCap <span className="text-foreground font-medium">{formatUsd(d.mcap)}</span></span>}
                          {d.volume && <span className="text-muted">Vol <span className="text-foreground font-medium">{formatUsd(d.volume)}</span></span>}
                          {d.price && <span className="text-muted">Price <span className="text-foreground font-medium">{formatUsd(d.price)}</span></span>}
                        </div>
                      ) : (
                        <p className="text-muted text-xs font-mono mt-1">{shortenAddress(token.address)}</p>
                      );
                    })()}
                  </Link>
                </div>
              </FadeIn>
            ))}
          </div>
        </section>
      )}

      {/* Tools grid */}
      <section>
        <FadeIn>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-4">Tools</p>
        </FadeIn>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FadeIn delay={0}>
            <Link href="/create" className="bg-card border border-card-border rounded-xl p-5 card-glow card-texture transition-all group block">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                    <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold group-hover:text-primary transition-colors">Lock Tokens</h3>
                  <p className="text-muted text-sm mt-0.5">Time lock, linear vesting, or stepped milestones</p>
                </div>
              </div>
            </Link>
          </FadeIn>

          <FadeIn delay={50}>
            <Link href="/token" className="bg-card border border-card-border rounded-xl p-5 card-glow card-texture transition-all group block">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                    <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold group-hover:text-primary transition-colors">Scan Token</h3>
                  <p className="text-muted text-sm mt-0.5">Holders, dev wallet, locks, burns, chart</p>
                </div>
              </div>
            </Link>
          </FadeIn>

          <FadeIn delay={100}>
            <Link href="/burn" className="bg-card border border-card-border rounded-xl p-5 card-glow card-texture transition-all group block">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-danger/10 flex items-center justify-center shrink-0">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-danger">
                    <path d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold group-hover:text-danger transition-colors">Burn Supply</h3>
                  <p className="text-muted text-sm mt-0.5">Permanently destroy tokens via MegaBurn</p>
                </div>
              </div>
            </Link>
          </FadeIn>

          <FadeIn delay={150}>
            <Link href="/explore" className="bg-card border border-card-border rounded-xl p-5 card-glow card-texture transition-all group block">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                    <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold group-hover:text-primary transition-colors">Explorer</h3>
                  <p className="text-muted text-sm mt-0.5">Browse all active locks and vesting schedules</p>
                </div>
              </div>
            </Link>
          </FadeIn>
        </div>
      </section>

      {/* Recent Activity */}
      <section>
        <FadeIn>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-4">Recent Activity</p>
        </FadeIn>

        {activitiesLoading ? (
          <FadeIn delay={50}>
            <div className="bg-card border border-card-border rounded-xl p-4 animate-pulse h-24" />
          </FadeIn>
        ) : activities.length === 0 ? (
          <FadeIn delay={50}>
            <div className="bg-card border border-card-border rounded-xl p-6 text-center">
              <p className="text-muted text-sm">No recent activity</p>
            </div>
          </FadeIn>
        ) : (
          <FadeIn delay={50}>
            <div className="bg-card border border-card-border rounded-xl overflow-hidden">
              <div className="divide-y divide-card-border">
                {activities.map((event, i) => (
                  <Link key={`${event.type}-${event.token}-${i}`} href={`/token/${event.token}`}
                    className="px-3 py-2 flex items-center gap-2.5 hover:bg-white/[0.03] transition-colors block">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                      event.type === "lock" ? "bg-primary/10" : "bg-danger/10"
                    }`}>
                      {event.type === "lock" ? (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-primary">
                          <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      ) : (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-danger">
                          <path d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs">
                        <span className="text-muted">{shortenAddress(event.actor)}</span>
                        <span className="text-muted mx-1">{event.type === "lock" ? "locked" : "burned"}</span>
                        <span className="font-semibold">{formatTokenAmount(event.amount, event.decimals)}</span>
                        <span className="text-primary ml-1">{event.tokenSymbol}</span>
                      </p>
                    </div>
                    <span className="text-muted text-[10px] shrink-0">{timeAgo(event.timestamp)}</span>
                  </Link>
                ))}
              </div>
            </div>
          </FadeIn>
        )}
      </section>

      {/* About */}
      <section>
        <FadeIn>
          <div className="border-t border-card-border pt-8">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">About</p>
            <p className="text-muted text-sm max-w-xl leading-relaxed">
              MegaScan is a token toolkit on MegaETH. Lock liquidity, create vesting schedules for your team,
              burn supply, and scan any token&apos;s holders and dev activity — all from one place.
            </p>
          </div>
        </FadeIn>
      </section>
    </div>
  );
}
