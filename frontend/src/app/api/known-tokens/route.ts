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

    // Add Enshrined launchpad tokens (paginate all pages)
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

    // Paginate Enshrined to catch graduated tokens
    for (let page = 1; page <= 10; page++) {
      try {
        const res = await fetch(`https://launch.enshrined.exchange/api/tokens?page=${page}&limit=50`);
        if (!res.ok) break;
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) break;
        let added = 0;
        for (const t of data) {
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
            added++;
          }
        }
        if (data.length < 50) break;
        if (added === 0) break;
      } catch { break; }
    }

    cache = { data: tokens, ts: Date.now() };
    return NextResponse.json(tokens);
  } catch {
    return NextResponse.json([], { status: 502 });
  }
}
