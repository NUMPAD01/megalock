"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FadeIn } from "@/components/FadeIn";

export default function TokenSearchPage() {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSearch = () => {
    const addr = searchInput.trim();
    if (addr.length === 42 && addr.startsWith("0x")) {
      setError(null);
      router.push(`/token/${addr}`);
    } else {
      setError("Invalid address. Enter a valid 0x... contract address.");
    }
  };

  return (
    <div className="space-y-6">
      <FadeIn>
        <div>
          <h1 className="text-3xl font-bold">Token Search</h1>
          <p className="text-muted mt-2">Search any ERC20 token on MegaETH by contract address</p>
        </div>
      </FadeIn>

      <FadeIn delay={100}>
        <div className="flex gap-2">
          <input
            type="text" placeholder="Enter token contract address (0x...)"
            value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="flex-1 bg-card border border-card-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-primary"
          />
          <button onClick={handleSearch}
            className="bg-primary hover:bg-primary-hover text-white font-medium py-3 px-6 rounded-lg transition-colors">
            Search
          </button>
        </div>
      </FadeIn>

      {error && (
        <FadeIn>
          <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 text-danger text-sm">{error}</div>
        </FadeIn>
      )}

      <FadeIn delay={200}>
        <div className="bg-card border border-card-border rounded-xl p-8 md:p-12 text-center">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted mx-auto mb-4">
            <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <h2 className="text-xl font-semibold mb-2">Enter a token address</h2>
          <p className="text-muted text-sm max-w-md mx-auto">
            Get full analytics: holders, dev wallet activity, locked tokens, burns, price chart and more.
          </p>
        </div>
      </FadeIn>
    </div>
  );
}
