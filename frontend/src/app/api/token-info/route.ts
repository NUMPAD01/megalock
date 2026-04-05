import { NextResponse } from "next/server";
import { createPublicClient, http, parseAbiItem, zeroAddress } from "viem";

export const dynamic = "force-dynamic";

const ENSHRINED = "https://launch.enshrined.exchange";

const rpc = createPublicClient({
  chain: { id: 4217, name: "Tempo", nativeCurrency: { name: "USD", symbol: "USD", decimals: 18 }, rpcUrls: { default: { http: ["https://rpc.tempo.xyz"] } } },
  transport: http(),
});

const TRANSFER_EVENT = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

const BLOCK_CHUNK = 99_999n;
const SCAN_RANGE_DEFAULT = 500_000n;
const SCAN_RANGE_FULL = 15_000_000n;
const holdersCache = new Map<string, { data: Array<{ address: string; balance: bigint }>; ts: number }>();
const HOLDERS_CACHE_TTL = 120_000;

async function getOnChainHolders(tokenAddress: string, fullScan = false): Promise<Array<{ address: string; balance: bigint }>> {
  const cacheKey = tokenAddress.toLowerCase();
  const cached = holdersCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < HOLDERS_CACHE_TTL) return cached.data;

  try {
    const currentBlock = await rpc.getBlockNumber();
    const range = fullScan ? SCAN_RANGE_FULL : SCAN_RANGE_DEFAULT;
    const startBlock = currentBlock > range ? currentBlock - range : 0n;
    const balances = new Map<string, bigint>();

    // Build chunk ranges
    const chunks: Array<{ from: bigint; to: bigint }> = [];
    for (let from = startBlock; from <= currentBlock; from += BLOCK_CHUNK + 1n) {
      const to = from + BLOCK_CHUNK > currentBlock ? currentBlock : from + BLOCK_CHUNK;
      chunks.push({ from, to });
    }

    // Parallel fetch (batch of 5)
    for (let i = 0; i < chunks.length; i += 5) {
      const batch = chunks.slice(i, i + 5);
      const results = await Promise.allSettled(
        batch.map(({ from, to }) =>
          rpc.getLogs({
            address: tokenAddress as `0x${string}`,
            event: TRANSFER_EVENT,
            fromBlock: from,
            toBlock: to,
          })
        )
      );
      for (const r of results) {
        if (r.status !== "fulfilled") continue;
        for (const log of r.value) {
          const sender = (log.args.from as string).toLowerCase();
          const receiver = (log.args.to as string).toLowerCase();
          const value = log.args.value as bigint;
          if (sender !== zeroAddress) balances.set(sender, (balances.get(sender) ?? 0n) - value);
          if (receiver !== zeroAddress) balances.set(receiver, (balances.get(receiver) ?? 0n) + value);
        }
      }
    }

    const result = Array.from(balances.entries())
      .filter(([, bal]) => bal > 0n)
      .map(([addr, bal]) => ({ address: addr, balance: bal }))
      .sort((a, b) => (b.balance > a.balance ? 1 : -1));

    holdersCache.set(cacheKey, { data: result, ts: Date.now() });
    return result;
  } catch {
    return cached?.data ?? [];
  }
}

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

    // Fetch real on-chain holders from Transfer events
    // Full scan if token not on Enshrined (no trades found)
    const needsFullScan = topTraders.length === 0;
    const onChainHolders = await getOnChainHolders(address, needsFullScan);
    const realHolders = onChainHolders.length > 0 ? onChainHolders.length : holders;

    // If no creator from Enshrined, detect from on-chain (first mint recipient is usually deployer)
    let devAddress = creator || null;
    if (!devAddress && onChainHolders.length > 0) {
      // The largest holder or first in the list is often the deployer for non-Enshrined tokens
      // But we can't be sure without the first Transfer from 0x0
      // For now, skip dev detection for non-Enshrined tokens
    }

    return NextResponse.json({
      token: tokenData,
      holders: realHolders,
      migrated,
      topTraders,
      onChainHolders: onChainHolders.slice(0, 50).map(h => ({
        address: h.address,
        balance: h.balance.toString(),
      })),
      dev: devAddress ? {
        address: devAddress,
        buys: devBuys, sells: devSells,
        buyUsd: devBuyUsd, sellUsd: devSellUsd,
      } : null,
    });
  } catch {
    return NextResponse.json(null, { status: 502 });
  }
}
