import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ENSHRINED_BASE = "https://launch.enshrined.exchange";

let cache: { data: unknown[]; ts: number } | null = null;
const CACHE_TTL = 10_000;

async function getAllTokens(): Promise<unknown[]> {
  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return cache.data;
  }

  try {
    // Fetch both: recent (no params) + paginated (for graduated tokens)
    const [recentRes, paginatedRes] = await Promise.allSettled([
      fetch(`${ENSHRINED_BASE}/api/tokens`).then(r => r.json()),
      fetch(`${ENSHRINED_BASE}/api/tokens?page=1&limit=50`).then(r => r.json()),
    ]);

    const seen = new Set<string>();
    const merged: unknown[] = [];

    // Add recent tokens first (newest)
    if (recentRes.status === "fulfilled" && Array.isArray(recentRes.value)) {
      for (const t of recentRes.value) {
        const addr = (t as { address: string }).address?.toLowerCase();
        if (addr && !seen.has(addr)) {
          seen.add(addr);
          merged.push(t);
        }
      }
    }

    // Add paginated tokens (includes more graduated)
    if (paginatedRes.status === "fulfilled" && Array.isArray(paginatedRes.value)) {
      for (const t of paginatedRes.value) {
        const addr = (t as { address: string }).address?.toLowerCase();
        if (addr && !seen.has(addr)) {
          seen.add(addr);
          merged.push(t);
        }
      }
    }

    if (merged.length > 0) {
      cache = { data: merged, ts: Date.now() };
    }
    return merged.length > 0 ? merged : (cache?.data ?? []);
  } catch {
    return cache?.data ?? [];
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const address = url.searchParams.get("address");

    const tokens = await getAllTokens();

    if (!address) {
      return NextResponse.json(tokens, {
        headers: { "Cache-Control": "no-store, max-age=0" },
      });
    }

    const found = tokens.find((t: unknown) => {
      const tok = t as { address: string };
      return tok.address?.toLowerCase() === address.toLowerCase();
    });
    if (found) return NextResponse.json(found);

    // Fallback: trades API
    try {
      const tradesRes = await fetch(`${ENSHRINED_BASE}/api/trades/${address}?limit=1`);
      if (tradesRes.ok) {
        const trades = await tradesRes.json();
        if (Array.isArray(trades) && trades.length > 0) {
          const latest = trades[0];
          return NextResponse.json({
            address, creator: latest.trader || null,
            name: null, symbol: null, description: null, image_uri: null,
            virtual_usd: latest.virtual_usd, virtual_tokens: latest.virtual_tokens,
            volume: latest.usd_amount, from_trades: true,
          });
        }
      }
    } catch { /* skip */ }

    return NextResponse.json(null);
  } catch {
    return NextResponse.json(null, { status: 502 });
  }
}
