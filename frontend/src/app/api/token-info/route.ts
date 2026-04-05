import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ENSHRINED = "https://launch.enshrined.exchange";

interface TraderStats {
  address: string;
  buys: number;
  sells: number;
  buyUsd: number;
  sellUsd: number;
  buyTokens: number;
  sellTokens: number;
  netTokens: number;
  pnl: number;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const address = url.searchParams.get("address");
  if (!address) return NextResponse.json(null, { status: 400 });

  try {
    const [listRes, tradesRes] = await Promise.allSettled([
      fetch(`${ENSHRINED}/api/tokens`).then(r => r.json()),
      fetch(`${ENSHRINED}/api/trades/${address}?limit=500`).then(r => r.json()),
    ]);

    let tokenData: Record<string, unknown> | null = null;
    if (listRes.status === "fulfilled" && Array.isArray(listRes.value)) {
      tokenData = listRes.value.find((t: { address: string }) =>
        t.address?.toLowerCase() === address.toLowerCase()
      ) || null;
    }

    let holders = 0;
    let devBuys = 0;
    let devSells = 0;
    let devBuyUsd = 0;
    let devSellUsd = 0;
    const creator = tokenData?.creator as string | undefined;
    const topTraders: TraderStats[] = [];

    if (tradesRes.status === "fulfilled" && Array.isArray(tradesRes.value)) {
      const trades = tradesRes.value;

      // Build per-trader stats
      const statsMap = new Map<string, TraderStats>();
      for (const t of trades) {
        const addr = (t.trader as string)?.toLowerCase();
        if (!addr) continue;
        if (!statsMap.has(addr)) {
          statsMap.set(addr, { address: addr, buys: 0, sells: 0, buyUsd: 0, sellUsd: 0, buyTokens: 0, sellTokens: 0, netTokens: 0, pnl: 0 });
        }
        const s = statsMap.get(addr)!;
        const usd = Number(t.usd_amount || 0) / 1e6;
        const tokens = Number(t.token_amount || 0) / 1e6;
        if (t.is_buy) { s.buys++; s.buyUsd += usd; s.buyTokens += tokens; }
        else { s.sells++; s.sellUsd += usd; s.sellTokens += tokens; }
      }

      // Calculate net tokens and PnL for each trader
      // Current price from latest virtualUsd/virtualTokens
      let currentPrice = 0;
      if (trades.length > 0) {
        const vUsd = Number(trades[0].virtual_usd || 0);
        const vTokens = Number(trades[0].virtual_tokens || 0);
        if (vTokens > 0) currentPrice = vUsd / vTokens;
      }

      for (const s of statsMap.values()) {
        s.netTokens = s.buyTokens - s.sellTokens;
        // PnL = value of holdings + sell proceeds - buy cost
        s.pnl = (s.netTokens * currentPrice) + s.sellUsd - s.buyUsd;
      }

      holders = statsMap.size;

      // Top traders by volume
      const sorted = [...statsMap.values()].sort((a, b) => (b.buyUsd + b.sellUsd) - (a.buyUsd + a.sellUsd));
      topTraders.push(...sorted.slice(0, 20));

      // Token data fallback for graduated tokens
      if (trades.length > 0 && !tokenData) {
        const latest = trades[0];
        tokenData = {
          address, creator: null,
          virtual_usd: latest.virtual_usd, virtual_tokens: latest.virtual_tokens,
          volume: String(trades.reduce((sum: number, t: { usd_amount: string }) => sum + Number(t.usd_amount || 0), 0)),
          from_trades: true,
        };
      }

      // Dev stats
      if (creator) {
        const devStats = statsMap.get(creator.toLowerCase());
        if (devStats) {
          devBuys = devStats.buys; devSells = devStats.sells;
          devBuyUsd = devStats.buyUsd; devSellUsd = devStats.sellUsd;
        }
      }
    }

    const migrated = tokenData
      ? !!(tokenData as Record<string, unknown>).migrated || !!(tokenData as Record<string, unknown>).completed || !!(tokenData as Record<string, unknown>).from_trades
      : false;

    return NextResponse.json({
      token: tokenData,
      holders,
      migrated,
      topTraders,
      dev: creator ? {
        address: creator,
        buys: devBuys, sells: devSells,
        buyUsd: devBuyUsd, sellUsd: devSellUsd,
      } : null,
    });
  } catch {
    return NextResponse.json(null, { status: 502 });
  }
}
