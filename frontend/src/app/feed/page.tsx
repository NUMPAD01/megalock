"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { FadeIn } from "@/components/FadeIn";
import { shortenAddress, formatUsd } from "@/lib/utils";

interface EnshrinedToken {
  address: string;
  creator: string;
  name: string;
  symbol: string;
  description: string;
  image_uri: string;
  twitter: string;
  telegram: string;
  website: string;
  created_at: string;
  completed: boolean;
  migrated: boolean;
  virtual_usd: string;
  virtual_tokens: string;
  real_tokens: string;
  real_usd: string;
  volume: string;
}

type SortMode = "new" | "all" | "active" | "graduated";
const PER_PAGE = 18;
const HUMAN_SUPPLY = 1_000_000_000;
const BASE_MCAP = 4;
const TARGET_MCAP = 15_000;

export default function FeedPage() {
  const [tokens, setTokens] = useState<EnshrinedToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortMode>("new");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const fetchTokens = async () => {
      try {
        const res = await fetch("/api/tokens");
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) setTokens(data);
        }
      } catch { /* skip */ }
      finally { setLoading(false); }
    };
    fetchTokens();
    const interval = setInterval(fetchTokens, 30000);
    return () => clearInterval(interval);
  }, []);

  // Reset page when switching tabs
  useEffect(() => setPage(1), [sort]);

  const getPrice = (t: EnshrinedToken) => {
    const vUsd = Number(t.virtual_usd);
    const vTokens = Number(t.virtual_tokens);
    return vTokens > 0 ? vUsd / vTokens : 0;
  };

  const getMcap = (t: EnshrinedToken) => getPrice(t) * HUMAN_SUPPLY;
  const getVolume = (t: EnshrinedToken) => Number(t.volume) / 1e6;

  const getProgress = (t: EnshrinedToken) => {
    const mcap = getMcap(t);
    return Math.min(100, Math.max(0, Math.round((mcap - BASE_MCAP) / (TARGET_MCAP - BASE_MCAP) * 100)));
  };

  const timeAgo = (dateStr: string) => {
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
  };

  const sorted = useMemo(() => {
    const list = [...tokens];
    if (sort === "new") return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    if (sort === "all") return list.sort((a, b) => getVolume(b) - getVolume(a));
    if (sort === "active") return list.filter(t => !t.completed && !t.migrated).sort((a, b) => getVolume(b) - getVolume(a));
    return list.filter(t => t.completed || t.migrated).sort((a, b) => getMcap(b) - getMcap(a));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens, sort]);

  const totalPages = Math.ceil(sorted.length / PER_PAGE);
  const paginated = sorted.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const tabs: { key: SortMode; label: string; count: number }[] = [
    { key: "new", label: "New", count: tokens.length },
    { key: "all", label: "All", count: tokens.length },
    { key: "active", label: "Active", count: tokens.filter(t => !t.completed && !t.migrated).length },
    { key: "graduated", label: "Graduated", count: tokens.filter(t => t.completed || t.migrated).length },
  ];

  return (
    <div className="space-y-6">
      <FadeIn>
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-bold">New Tokens</h1>
            <p className="text-muted mt-1">Live feed from Enshrined Launchpad</p>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <span className="text-xs text-muted">Live</span>
          </div>
        </div>
      </FadeIn>

      {/* Tabs */}
      <FadeIn delay={50}>
        <div className="flex gap-1 border-b border-card-border">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setSort(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                sort === tab.key
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {tab.label}
              <span className="ml-1.5 text-xs opacity-50">{tab.count}</span>
            </button>
          ))}
        </div>
      </FadeIn>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-card border border-card-border rounded-xl p-4 animate-pulse h-40" />
          ))}
        </div>
      ) : paginated.length === 0 ? (
        <FadeIn>
          <div className="bg-card border border-card-border rounded-xl p-12 text-center">
            <p className="text-muted">No tokens found</p>
          </div>
        </FadeIn>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {paginated.map((token, i) => {
              const price = getPrice(token);
              const mcap = getMcap(token);
              const vol = getVolume(token);
              const progress = getProgress(token);
              const isGraduated = token.completed || token.migrated;

              return (
                <FadeIn key={token.address} delay={i * 20}>
                  <Link href={`/token/${token.address}`}
                    className="bg-card border border-card-border rounded-xl p-4 card-glow card-texture block group transition-all hover:border-foreground/20">
                    {/* Header */}
                    <div className="flex items-center gap-3 mb-3">
                      {token.image_uri ? (
                        <img src={token.image_uri} alt={token.symbol} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-card-border flex items-center justify-center shrink-0">
                          <span className="text-sm font-bold text-muted">{token.symbol.slice(0, 2)}</span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h3 className="font-semibold text-sm truncate group-hover:text-foreground transition-colors">{token.name}</h3>
                          {isGraduated && (
                            <span className="bg-success/10 text-success text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0">GRAD</span>
                          )}
                        </div>
                        <p className="text-muted text-xs">${token.symbol}</p>
                      </div>
                      <span className="text-muted text-[10px] shrink-0">{timeAgo(token.created_at)}</span>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <div>
                        <p className="text-[10px] text-muted">Price</p>
                        <p className="text-xs font-semibold">{formatUsd(price)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted">MCap</p>
                        <p className="text-xs font-semibold">{formatUsd(mcap)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted">Volume</p>
                        <p className="text-xs font-semibold">{formatUsd(vol)}</p>
                      </div>
                    </div>

                    {/* Progress */}
                    {!isGraduated ? (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-background rounded-full h-1.5 overflow-hidden">
                          <div className={`h-1.5 rounded-full transition-all ${progress >= 80 ? "bg-success" : "bg-foreground/30"}`}
                            style={{ width: `${Math.max(progress, 2)}%` }} />
                        </div>
                        <span className="text-[10px] text-muted shrink-0 w-8 text-right">{progress}%</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 bg-success/20 rounded-full h-1.5">
                          <div className="bg-success h-1.5 rounded-full w-full" />
                        </div>
                        <span className="text-[10px] text-success shrink-0">100%</span>
                      </div>
                    )}

                    {/* Footer */}
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-card-border/50">
                      <span className="text-[10px] text-muted">by {shortenAddress(token.creator)}</span>
                      <div className="flex gap-2">
                        {token.twitter && (
                          <span className="text-[10px] text-muted hover:text-foreground cursor-pointer" onClick={(e) => { e.preventDefault(); window.open(token.twitter, '_blank'); }}>Twitter</span>
                        )}
                        {token.website && (
                          <span className="text-[10px] text-muted hover:text-foreground cursor-pointer" onClick={(e) => { e.preventDefault(); window.open(token.website, '_blank'); }}>Web</span>
                        )}
                      </div>
                    </div>
                  </Link>
                </FadeIn>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <FadeIn>
              <div className="flex items-center justify-center gap-2 pt-4">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 text-sm bg-card border border-card-border rounded-lg disabled:opacity-30 hover:border-foreground/20 transition-colors"
                >
                  Prev
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-8 h-8 text-sm rounded-lg transition-colors ${
                      page === p
                        ? "bg-foreground text-background font-semibold"
                        : "bg-card border border-card-border text-muted hover:text-foreground"
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 text-sm bg-card border border-card-border rounded-lg disabled:opacity-30 hover:border-foreground/20 transition-colors"
                >
                  Next
                </button>
              </div>
            </FadeIn>
          )}
        </>
      )}
    </div>
  );
}
