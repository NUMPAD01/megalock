import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface TokenEntry {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
}

let cache: { data: TokenEntry[]; ts: number } | null = null;
const CACHE_TTL = 60_000;

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return NextResponse.json(cache.data);
  }

  try {
    const [tempoListRes, enshrinedRes] = await Promise.allSettled([
      fetch("https://tokenlist.tempo.xyz/list/4217").then(r => r.json()),
      fetch("https://launch.enshrined.exchange/api/tokens").then(r => r.json()),
    ]);

    const seen = new Set<string>();
    const tokens: TokenEntry[] = [];

    // Add Tempo official tokens
    if (tempoListRes.status === "fulfilled" && tempoListRes.value?.tokens) {
      for (const t of tempoListRes.value.tokens) {
        if (t.address && t.chainId === 4217) {
          const addr = t.address.toLowerCase();
          if (!seen.has(addr)) {
            seen.add(addr);
            tokens.push({
              address: t.address,
              name: t.name,
              symbol: t.symbol,
              decimals: t.decimals,
              logoURI: t.logoURI || undefined,
            });
          }
        }
      }
    }

    // Add Enshrined launchpad tokens
    if (enshrinedRes.status === "fulfilled" && Array.isArray(enshrinedRes.value)) {
      for (const t of enshrinedRes.value) {
        const addr = t.address?.toLowerCase();
        if (addr && !seen.has(addr)) {
          seen.add(addr);
          tokens.push({
            address: t.address,
            name: t.name || "Unknown",
            symbol: t.symbol || "???",
            decimals: 6,
            logoURI: t.image_uri || undefined,
          });
        }
      }
    }

    // Also discover graduated/migrated tokens from recent trades
    try {
      // Fetch trades for popular graduated tokens to discover them
      const knownGraduated = [
        "0x20c00000000000000000000006dbfda465c4f57f", // T
      ];
      for (const addr of knownGraduated) {
        if (!seen.has(addr.toLowerCase())) {
          try {
            const tradeRes = await fetch(`https://launch.enshrined.exchange/api/trades/${addr}?limit=1`);
            if (tradeRes.ok) {
              const trades = await tradeRes.json();
              if (Array.isArray(trades) && trades.length > 0) {
                seen.add(addr.toLowerCase());
                // We'll read name/symbol from RPC on the client side
                tokens.push({
                  address: addr,
                  name: "T",
                  symbol: "$T",
                  decimals: 6,
                });
              }
            }
          } catch { /* skip */ }
        }
      }
    } catch { /* skip */ }

    cache = { data: tokens, ts: Date.now() };
    return NextResponse.json(tokens);
  } catch {
    return NextResponse.json([], { status: 502 });
  }
}
