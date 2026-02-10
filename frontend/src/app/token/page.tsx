"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { FadeIn } from "@/components/FadeIn";
import { shortenAddress } from "@/lib/utils";

interface SearchResult {
  type: string;
  name: string;
  symbol: string;
  address_hash: string;
  icon_url: string | null;
  token_type: string;
}

function TokenSearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const handleSearch = useCallback(async (override?: string) => {
    const query = (override ?? searchInput).trim();
    setError(null);
    setSearchResults([]);

    // Direct address navigation
    if (query.length === 42 && query.startsWith("0x")) {
      router.push(`/token/${query}`);
      return;
    }

    // Name/symbol search
    if (query.length < 2) {
      setError("Enter at least 2 characters to search by name or symbol.");
      return;
    }

    setSearching(true);
    try {
      const res = await fetch(
        `https://megaeth.blockscout.com/api/v2/search?q=${encodeURIComponent(query)}`
      );
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      const tokens = (data.items || []).filter(
        (item: SearchResult) => item.type === "token" && item.token_type === "ERC-20"
      );
      if (tokens.length === 0) {
        setError("No tokens found matching your search.");
      }
      setSearchResults(tokens);
    } catch {
      setError("Search failed. Try again.");
    } finally {
      setSearching(false);
    }
  }, [searchInput, router]);

  useEffect(() => {
    const q = searchParams.get("q");
    if (q) {
      setSearchInput(q);
      handleSearch(q);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return (
    <div className="space-y-6">
      <FadeIn>
        <div>
          <h1 className="text-3xl font-bold">Token Search</h1>
          <p className="text-muted mt-2">Search any ERC20 token on MegaETH by name, symbol, or contract address</p>
        </div>
      </FadeIn>

      <FadeIn delay={100}>
        <div className="flex gap-2">
          <input
            type="text" placeholder="Search by token name, symbol, or address (0x...)"
            value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="flex-1 bg-card border border-card-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-primary"
          />
          <button onClick={() => handleSearch()} disabled={searching}
            className="bg-primary hover:bg-primary-hover disabled:opacity-50 text-white font-medium py-3 px-6 rounded-lg transition-colors">
            {searching ? "Searching..." : "Search"}
          </button>
        </div>
      </FadeIn>

      {error && (
        <FadeIn>
          <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 text-danger text-sm">{error}</div>
        </FadeIn>
      )}

      {searching && (
        <FadeIn>
          <div className="bg-card border border-card-border rounded-xl p-6 animate-pulse h-24" />
        </FadeIn>
      )}

      {searchResults.length > 0 && (
        <FadeIn delay={50}>
          <div className="bg-card border border-card-border rounded-xl overflow-hidden">
            <p className="text-muted text-xs font-medium px-4 py-3 border-b border-card-border">
              {searchResults.length} result{searchResults.length !== 1 ? "s" : ""}
            </p>
            {searchResults.map((result) => (
              <Link
                key={result.address_hash}
                href={`/token/${result.address_hash}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] border-b border-card-border/50 transition-colors"
              >
                {result.icon_url ? (
                  <img src={result.icon_url} alt="" className="w-8 h-8 rounded-full" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-primary text-xs font-bold">{result.symbol?.slice(0, 2)}</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <span className="font-medium">{result.name}</span>
                  <span className="text-muted text-sm ml-2">({result.symbol})</span>
                </div>
                <span className="text-muted text-xs font-mono">{shortenAddress(result.address_hash)}</span>
              </Link>
            ))}
          </div>
        </FadeIn>
      )}

      {!searching && searchResults.length === 0 && !error && (
        <FadeIn delay={200}>
          <div className="bg-card border border-card-border rounded-xl p-8 md:p-12 text-center">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted mx-auto mb-4">
              <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <h2 className="text-xl font-semibold mb-2">Search for a token</h2>
            <p className="text-muted text-sm max-w-md mx-auto">
              Get full analytics: holders, dev wallet activity, locked tokens, burns, price chart and more.
            </p>
          </div>
        </FadeIn>
      )}
    </div>
  );
}

export default function TokenSearchPage() {
  return (
    <Suspense fallback={
      <div className="space-y-6">
        <div><h1 className="text-3xl font-bold">Token Search</h1></div>
        <div className="bg-card border border-card-border rounded-xl p-6 animate-pulse h-24" />
      </div>
    }>
      <TokenSearchContent />
    </Suspense>
  );
}
