"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useReadContract, usePublicClient, useAccount } from "wagmi";
import { TEMPOLOCK_ADDRESS, TEMPOLOCK_ABI, TEMPOBURN_ADDRESS, TEMPOBURN_ABI } from "@/lib/contracts";
import { shortenAddress, formatTokenAmount, formatDateTime, getLockTypeLabel, formatUsd } from "@/lib/utils";
import { rpcClient } from "@/lib/rpcClient";
import { useWatchlist } from "@/hooks/useWatchlist";
import { generateLockCertificate } from "@/lib/generateLockCertificate";
import { VestingChart } from "@/components/VestingChart";
import { FadeIn } from "@/components/FadeIn";

const ERC20_READ_ABI = [
  { type: "function", name: "name", inputs: [], outputs: [{ type: "string" }], stateMutability: "view" },
  { type: "function", name: "symbol", inputs: [], outputs: [{ type: "string" }], stateMutability: "view" },
  { type: "function", name: "decimals", inputs: [], outputs: [{ type: "uint8" }], stateMutability: "view" },
  { type: "function", name: "totalSupply", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
] as const;

interface TokenInfo {
  name: string;
  symbol: string;
  decimals: string;
  total_supply: string;
  holders_count: string;
  type: string;
  exchange_rate: string | null;
  icon_url: string | null;
  circulating_market_cap: string | null;
  volume_24h: string | null;
}

interface HolderInfo {
  address: { hash: string; name: string | null };
  value: string;
}

interface TokenLockInfo {
  id: number;
  lockType: number;
  totalAmount: bigint;
  claimedAmount: bigint;
  startTime: bigint;
  endTime: bigint;
  cliffTime: bigint;
  creator: string;
  beneficiary: string;
  milestones?: { timestamp: number; basisPoints: number }[];
}

export default function TokenDetailPage() {
  const params = useParams();
  const router = useRouter();
  const tokenAddress = params.address as string;

  const { address: myAddress } = useAccount();
  const { addToken, removeToken, isWatched } = useWatchlist();
  const [searchInput, setSearchInput] = useState(tokenAddress || "");
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [topTraders, setTopTraders] = useState<Array<{ address: string; buys: number; sells: number; buyUsd: number; sellUsd: number; netTokens: number; pnl: number }>>([]);
  const [onChainHolders, setOnChainHolders] = useState<Array<{ address: string; balance: string }>>([]);
  const [holders, setHolders] = useState<HolderInfo[]>([]);
  const [deployerAddress, setDeployerAddress] = useState<string | null>(null);
  const [deployerBalance, setDeployerBalance] = useState<string | null>(null);
  const [deployerTxCount, setDeployerTxCount] = useState<number | null>(null);
  const [devSoldStatus, setDevSoldStatus] = useState<"sold" | "holding" | "never_held" | null>(null);
  const [devTotalReceived, setDevTotalReceived] = useState<bigint | null>(null);
  const [devTotalSold, setDevTotalSold] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lockedAmount, setLockedAmount] = useState(0n);
  const [lockCount, setLockCount] = useState(0);
  const [tokenLocks, setTokenLocks] = useState<TokenLockInfo[]>([]);
  const [expandedLockId, setExpandedLockId] = useState<number | null>(null);
  const [isContractVerified, setIsContractVerified] = useState<boolean | null>(null);
  const [copiedLockId, setCopiedLockId] = useState<number | null>(null);
  const [dexData, setDexData] = useState<{priceUsd: string | null; mcap: number | null; volume24h: number | null} | null>(null);
  const [isMigrated, setIsMigrated] = useState(false);
  const [communityPage, setCommunityPage] = useState(0);
  const [hasDevAccess, setHasDevAccess] = useState(false);
  const [tokenCreatedAt, setTokenCreatedAt] = useState<string | null>(null);
  const [devFundedBy, setDevFundedBy] = useState<string | null>(null);
  const COMMUNITY_PER_PAGE = 20;

  const publicClient = usePublicClient();
  const watched = tokenInfo ? isWatched(tokenAddress) : false;

  const toggleWatchlist = () => {
    if (!tokenInfo) return;
    if (watched) removeToken(tokenAddress);
    else addToken({ address: tokenAddress, name: tokenInfo.name, symbol: tokenInfo.symbol });
  };

  const { data: totalBurned } = useReadContract({
    address: TEMPOBURN_ADDRESS, abi: TEMPOBURN_ABI, functionName: "totalBurned",
    args: tokenAddress ? [tokenAddress as `0x${string}`] : undefined,
    query: { enabled: !!tokenAddress && tokenAddress.length === 42 },
  });

  const { data: nextLockId } = useReadContract({
    address: TEMPOLOCK_ADDRESS, abi: TEMPOLOCK_ABI, functionName: "nextLockId",
    query: { enabled: !!tokenAddress },
  });

  useEffect(() => {
    if (!publicClient || !tokenAddress || !nextLockId || nextLockId === 0n) {
      setLockedAmount(0n);
      setLockCount(0);
      setTokenLocks([]);
      return;
    }

    const scanLocks = async () => {
      let total = 0n;
      let count = 0;
      const matches: TokenLockInfo[] = [];
      const n = Number(nextLockId);
      for (let i = 0; i < Math.min(n, 100); i++) {
        try {
          const lock = await publicClient.readContract({
            address: TEMPOLOCK_ADDRESS, abi: TEMPOLOCK_ABI, functionName: "getLock", args: [BigInt(i)],
          });
          if (lock.token.toLowerCase() === tokenAddress.toLowerCase() && !lock.cancelled) {
            const remaining = lock.totalAmount - lock.claimedAmount;
            if (remaining > 0n) {
              total += remaining;
              count++;
              let ms: { timestamp: number; basisPoints: number }[] | undefined;
              if (lock.lockType === 2) {
                try {
                  const raw = await publicClient.readContract({
                    address: TEMPOLOCK_ADDRESS, abi: TEMPOLOCK_ABI, functionName: "getMilestones", args: [BigInt(i)],
                  });
                  ms = raw.map(m => ({ timestamp: Number(m.timestamp), basisPoints: Number(m.basisPoints) }));
                } catch { /* skip */ }
              }
              matches.push({
                id: i, lockType: lock.lockType,
                totalAmount: lock.totalAmount, claimedAmount: lock.claimedAmount,
                startTime: lock.startTime, endTime: lock.endTime, cliffTime: lock.cliffTime,
                creator: lock.creator, beneficiary: lock.beneficiary,
                milestones: ms,
              });
            }
          }
        } catch { /* skip */ }
      }
      setLockedAmount(total);
      setLockCount(count);
      setTokenLocks(matches);
    };

    scanLocks();
  }, [publicClient, tokenAddress, nextLockId]);

  const fetchTokenData = useCallback(async (address: string) => {
    setLoading(true);
    setError(null);
    setTokenInfo(null);
    setHolders([]);
    setDeployerAddress(null);
    setDeployerBalance(null);
    setDeployerTxCount(null);
    setDevSoldStatus(null);
    setDevTotalReceived(null);
    setDevTotalSold(null);
    setTokenLocks([]);
    setIsContractVerified(null);

    try {
      const addr = address as `0x${string}`;

      // Fetch on-chain data
      const [name, symbol, decimals, totalSupply] = await Promise.all([
        rpcClient.readContract({ address: addr, abi: ERC20_READ_ABI, functionName: "name" }),
        rpcClient.readContract({ address: addr, abi: ERC20_READ_ABI, functionName: "symbol" }),
        rpcClient.readContract({ address: addr, abi: ERC20_READ_ABI, functionName: "decimals" }),
        rpcClient.readContract({ address: addr, abi: ERC20_READ_ABI, functionName: "totalSupply" }),
      ]);

      // Fetch Enshrined data (token info + trades + holders + dev) via server proxy
      let mcap: string | null = null;
      let price: string | null = null;
      let vol: string | null = null;
      let holdersCount = "—";
      let imageUri: string | null = null;

      try {
        const infoRes = await fetch(`/api/token-info?address=${address}`);
        if (infoRes.ok) {
          const info = await infoRes.json();
          if (info) {
            // Holders from on-chain Transfer events
            if (info.holders > 0) holdersCount = String(info.holders);
            if (info.migrated) setIsMigrated(true);
            if (info.topTraders) setTopTraders(info.topTraders);
            if (info.onChainHolders) setOnChainHolders(info.onChainHolders);
            if (info.createdAt) setTokenCreatedAt(info.createdAt);
            if (info.fundedBy) setDevFundedBy(info.fundedBy);

            // Token data (price/mcap/vol)
            const t = info.token;
            if (t) {
              imageUri = t.image_uri || null;
              const vUsd = Number(t.virtual_usd || 0);
              const vTokens = Number(t.virtual_tokens || 0);
              if (vTokens > 0) {
                const tokenPrice = vUsd / vTokens;
                price = tokenPrice.toString();
                const dec = Number(decimals);
                const supply = Number(totalSupply) / (10 ** dec);
                mcap = (tokenPrice * supply).toString();
              }
              if (Number(t.volume || 0) > 0) {
                vol = (Number(t.volume) / 1e6).toString();
              }
            }

            // Dev info
            if (info.dev) {
              setDeployerAddress(info.dev.address);
              setDeployerTxCount(info.dev.buys + info.dev.sells);
              setDevTotalReceived(BigInt(Math.round(info.dev.buyUsd * 1e6)));
              setDevTotalSold(BigInt(Math.round(info.dev.sellUsd * 1e6)));

              // Read dev balance on-chain
              try {
                const devBal = await rpcClient.readContract({
                  address: addr,
                  abi: [{ type: "function", name: "balanceOf", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" }] as const,
                  functionName: "balanceOf",
                  args: [info.dev.address as `0x${string}`],
                });
                setDeployerBalance(String(devBal));
                if (info.dev.sells > 0) setDevSoldStatus("sold");
                else if (devBal > 0n) setDevSoldStatus("holding");
                else setDevSoldStatus("never_held");
              } catch {
                setDevSoldStatus(info.dev.sells > 0 ? "sold" : "holding");
              }
            } else {
              setDevSoldStatus(null);
            }
          }
        }
      } catch {
        setDevSoldStatus(null);
      }

      const tokenData: TokenInfo = {
        name: name as string, symbol: symbol as string,
        decimals: String(decimals), total_supply: String(totalSupply),
        holders_count: holdersCount, type: "ERC-20",
        exchange_rate: price,
        icon_url: imageUri,
        circulating_market_cap: mcap,
        volume_24h: vol,
      };

      setTokenInfo(tokenData);
    } catch {
      setError("Token not found on Tempo. Make sure the address is a valid ERC20/TIP-20 token.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tokenAddress && tokenAddress.length === 42 && tokenAddress.startsWith("0x")) {
      fetchTokenData(tokenAddress);
    } else {
      setLoading(false);
      setError("Invalid token address");
    }
  }, [tokenAddress, fetchTokenData]);

  const handleSearch = () => {
    const query = searchInput.trim();
    if (query.length === 42 && query.startsWith("0x")) {
      router.push(`/token/${query}`);
    }
  };

  const decimals = tokenInfo ? parseInt(tokenInfo.decimals) : 18;
  const totalSupply = tokenInfo ? BigInt(tokenInfo.total_supply) : 0n;

  // Sync search input when navigating between tokens
  useEffect(() => {
    setSearchInput(tokenAddress || "");
    setDexData(null);
    setIsMigrated(false);
    setOnChainHolders([]);
    setCommunityPage(0);
    setTokenCreatedAt(null);
    setDevFundedBy(null);
  }, [tokenAddress]);

  // Check TSCAN balance for dev status access (5M TSCAN required)
  const TSCAN_ADDRESS = "0x20c00000000000000000000088f2ce96f78Fa037";
  const TSCAN_REQUIRED = 5_000_000;
  useEffect(() => {
    if (!myAddress) { setHasDevAccess(false); return; }
    const checkAccess = async () => {
      try {
        const res = await fetch(`/api/wallet-balances?address=${myAddress}`);
        if (res.ok) {
          const data = await res.json();
          if (data?.balances) {
            const tscan = data.balances.find((t: { token: string }) =>
              t.token.toLowerCase() === TSCAN_ADDRESS.toLowerCase()
            );
            if (tscan) {
              const bal = Number(BigInt(tscan.balance || "0")) / 1e6;
              setHasDevAccess(bal >= TSCAN_REQUIRED);
              return;
            }
          }
        }
      } catch { /* skip */ }
      setHasDevAccess(false);
    };
    checkAccess();
  }, [myAddress]);

  // No explorer API available on Tempo - search is address-only

  const handleShareCertificate = async (lock: TokenLockInfo) => {
    if (!tokenInfo) return;
    const remaining = lock.totalAmount - lock.claimedAmount;
    const blob = await generateLockCertificate({
      tokenName: tokenInfo.name, tokenSymbol: tokenInfo.symbol, tokenAddress,
      lockedAmount: remaining, totalSupply, decimals, lockType: lock.lockType,
      startTime: Number(lock.startTime), endTime: Number(lock.endTime),
      creator: lock.creator, beneficiary: lock.beneficiary, lockId: lock.id,
    });
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setCopiedLockId(lock.id);
    } catch {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `temposcan-lock-${lock.id}-${tokenInfo.symbol}.png`;
      a.click();
      URL.revokeObjectURL(url);
      setCopiedLockId(lock.id);
    }
    setTimeout(() => setCopiedLockId(null), 2000);
  };

  const handleCopyForTwitter = (lock: TokenLockInfo) => {
    if (!tokenInfo) return;
    const remaining = lock.totalAmount - lock.claimedAmount;
    const pct = totalSupply > 0n ? (Number((remaining * 10000n) / totalSupply) / 100).toFixed(2) : "?";
    const endT = Number(lock.endTime);
    const text = `${tokenInfo.name} ($${tokenInfo.symbol}) has ${formatTokenAmount(remaining, decimals)} tokens locked (${pct}% of supply) via @temposcanapp\n\nLock type: ${getLockTypeLabel(lock.lockType)}\nUnlocks: ${formatDateTime(endT)}\n\nVerify: temposcan.app/token/${tokenAddress}`;
    navigator.clipboard.writeText(text);
    setCopiedLockId(lock.id);
    setTimeout(() => setCopiedLockId(null), 2000);
  };

  return (
    <div className="space-y-6">
      <FadeIn>
        <div>
          <h1 className="text-3xl font-bold">Token Search</h1>
          <p className="text-muted mt-2">Paste any ERC20/TIP-20 token contract address on Tempo</p>
        </div>
      </FadeIn>

      <FadeIn delay={50} className="relative z-50">
        <div className="relative">
          <div className="flex gap-2">
            <input
              type="text" placeholder="Paste token address (0x...)"
              value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="flex-1 bg-card border border-card-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-primary"
            />
            <button onClick={handleSearch} disabled={loading}
              className="bg-primary hover:bg-primary-hover disabled:opacity-50 text-black font-medium py-3 px-6 rounded-lg transition-colors">
              {loading ? "Searching..." : "Search"}
            </button>
          </div>
        </div>
      </FadeIn>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 text-danger text-sm">{error}</div>
      )}

      {loading && !tokenInfo && (
        <div className="space-y-4">
          <div className="bg-card border border-card-border rounded-xl p-6 animate-pulse h-40" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-card border border-card-border rounded-xl p-6 animate-pulse h-60" />
            <div className="bg-card border border-card-border rounded-xl p-6 animate-pulse h-60" />
          </div>
        </div>
      )}

      {tokenInfo && (
        <>
          {/* Token Info Card */}
          <FadeIn delay={100}>
            <div className="bg-card border border-card-border rounded-xl p-6">
              <div className="flex items-start gap-3 mb-4">
                {tokenInfo.icon_url && <img src={tokenInfo.icon_url} alt={tokenInfo.symbol} className="w-10 h-10 rounded-full" />}
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <a href={`https://explore.mainnet.tempo.xyz/address/${tokenAddress}`} target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">
                      <h2 className="text-xl font-bold">{tokenInfo.name} <span className="text-muted font-normal">({tokenInfo.symbol})</span></h2>
                    </a>
                    <a href={`https://www.defined.fi/tempo/${tokenAddress}`} target="_blank" rel="noopener noreferrer"
                      title="Trade on Defined" className="opacity-70 hover:opacity-100 transition-opacity text-primary text-xs font-medium">
                      Defined
                    </a>
                    <button onClick={toggleWatchlist} title={watched ? "Remove from watchlist" : "Add to watchlist"}
                      className="text-muted hover:text-yellow-400 transition-colors ml-1">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill={watched ? "currentColor" : "none"}
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                        className={watched ? "text-yellow-400" : ""}>
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                    </button>
                  </div>
                  <a href={`https://explore.mainnet.tempo.xyz/address/${tokenAddress}`} target="_blank" rel="noopener noreferrer" className="text-muted text-xs font-mono hover:text-primary transition-colors">{tokenAddress}</a>
                </div>
                <a href={`https://t.me/based_eth_bot?start=r_temposcan_b_${tokenAddress}`} target="_blank" rel="noopener noreferrer"
                  className="shrink-0 bg-primary hover:bg-primary-hover text-black text-sm font-medium py-2 px-4 rounded-lg transition-colors flex items-center gap-1.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
                  </svg>
                  Trade
                </a>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div><p className="text-muted text-xs">Total Supply</p><p className="font-semibold">{formatTokenAmount(totalSupply, decimals)}</p></div>
                <div><p className="text-muted text-xs">Holders</p><p className="font-semibold">{tokenInfo.holders_count || "0"}</p></div>
                <div>
                  <p className="text-muted text-xs">Market Cap{isMigrated ? " (pre-migration)" : ""}</p>
                  <p className="font-semibold">{formatUsd(tokenInfo.circulating_market_cap || dexData?.mcap)}</p>
                  {isMigrated && <a href={`https://www.defined.fi/tempo/${tokenAddress}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline">Live price on Defined</a>}
                </div>
                <div><p className="text-muted text-xs">Volume 24h</p><p className="font-semibold">{formatUsd(tokenInfo.volume_24h || dexData?.volume24h)}</p></div>
                <div>
                  <p className="text-muted text-xs">Price{isMigrated ? " (pre-migration)" : ""}</p>
                  <p className="font-semibold">{formatUsd(tokenInfo.exchange_rate || dexData?.priceUsd)}</p>
                </div>
                <div><p className="text-muted text-xs">Decimals</p><p className="font-semibold">{tokenInfo.decimals}</p></div>
              </div>
            </div>
          </FadeIn>

          {/* Dev / Lock & Burn */}
          <FadeIn delay={200}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-card border border-card-border rounded-xl p-6">
                <h3 className="font-semibold mb-3">Dev / Deployer</h3>
                {!hasDevAccess ? (
                  <div className="text-center py-4">
                    <p className="text-muted text-sm mb-2">Hold 5,000,000 $TSCAN to unlock Dev Status</p>
                    <a href={`/token/${TSCAN_ADDRESS}`} className="text-primary text-xs hover:underline">Get $TSCAN</a>
                  </div>
                ) : deployerAddress ? (
                  <div className="space-y-3">
                    <div>
                      <p className="text-muted text-xs">Deployer Address</p>
                      <a href={`https://explore.mainnet.tempo.xyz/address/${deployerAddress}`} target="_blank" rel="noopener noreferrer"
                        className="text-primary text-sm font-mono hover:underline">{shortenAddress(deployerAddress)}</a>
                    </div>
                    {tokenCreatedAt && (
                      <div>
                        <p className="text-muted text-xs">Token Created</p>
                        <p className="text-sm font-medium">{new Date(tokenCreatedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                      </div>
                    )}
                    {devFundedBy && (
                      <div>
                        <p className="text-muted text-xs">Dev Funded By</p>
                        <a href={`https://explore.mainnet.tempo.xyz/address/${devFundedBy}`} target="_blank" rel="noopener noreferrer"
                          className="text-primary text-xs font-mono hover:underline">{shortenAddress(devFundedBy)}</a>
                      </div>
                    )}
                    <div>
                      <p className="text-muted text-xs">Dev Token Balance</p>
                      {deployerBalance !== null ? (
                        <div>
                          <p className="font-semibold">{formatTokenAmount(BigInt(deployerBalance), decimals)} {tokenInfo.symbol}</p>
                          {totalSupply > 0n && (
                            <p className="text-xs text-muted">{(Number((BigInt(deployerBalance) * 10000n) / totalSupply) / 100).toFixed(2)}% of supply</p>
                          )}
                        </div>
                      ) : <p className="text-sm">0</p>}
                    </div>
                    {deployerTxCount !== null && deployerTxCount > 0 && (
                      <div>
                        <p className="text-muted text-xs">Dev Trades</p>
                        <div className="flex gap-3 text-sm">
                          <span className="text-success">{Number(devTotalReceived ?? 0n) > 0 ? `${(Number(devTotalReceived) / 1e6).toFixed(2)}$ bought` : "0 buys"}</span>
                          <span className="text-danger">{Number(devTotalSold ?? 0n) > 0 ? `${(Number(devTotalSold) / 1e6).toFixed(2)}$ sold` : "0 sells"}</span>
                        </div>
                        <p className="text-muted text-xs mt-0.5">{deployerTxCount} trade{deployerTxCount !== 1 ? "s" : ""} total</p>
                      </div>
                    )}
                    {(() => {
                      const devLocks = tokenLocks.filter(l => l.creator.toLowerCase() === deployerAddress?.toLowerCase());
                      const devLockedAmount = devLocks.reduce((sum, l) => sum + (l.totalAmount - l.claimedAmount), 0n);
                      return devLockedAmount > 0n ? (
                        <div>
                          <p className="text-muted text-xs">Dev Locked</p>
                          <p className="font-semibold text-sm text-success">
                            {formatTokenAmount(devLockedAmount, decimals)} {tokenInfo.symbol}
                            {totalSupply > 0n && <span className="text-muted font-normal"> ({(Number((devLockedAmount * 10000n) / totalSupply) / 100).toFixed(2)}%)</span>}
                          </p>
                          <p className="text-muted text-xs">{devLocks.length} lock{devLocks.length > 1 ? "s" : ""}</p>
                        </div>
                      ) : null;
                    })()}
                    <div>
                      <p className="text-muted text-xs">Dev Status</p>
                      {devSoldStatus === "holding" && <span className="text-success font-semibold text-sm">Holding</span>}
                      {devSoldStatus === "sold" && <span className="text-danger font-bold text-sm">DEV SOLD</span>}
                      {devSoldStatus === "never_held" && <span className="text-muted font-semibold text-sm">Never held</span>}
                      {devSoldStatus === null && <span className="text-muted text-sm">—</span>}
                    </div>
                  </div>
                ) : <p className="text-muted text-sm">Deployer info not available</p>}
              </div>

              <div className="bg-card border border-card-border rounded-xl p-6">
                <h3 className="font-semibold mb-3">Lock & Burn Stats</h3>
                <div className="space-y-3">
                  <div>
                    <p className="text-muted text-xs">Total Locked</p>
                    <p className={`font-semibold ${lockedAmount > 0n ? "text-success" : "text-muted"}`}>
                      {lockedAmount > 0n ? formatTokenAmount(lockedAmount, decimals) : "0"} {tokenInfo.symbol}
                    </p>
                    {lockedAmount > 0n && totalSupply > 0n && (
                      <p className="text-xs text-muted">{(Number((lockedAmount * 10000n) / totalSupply) / 100).toFixed(2)}% of supply</p>
                    )}
                    <p className="text-xs text-muted mt-1">{lockCount} active lock{lockCount !== 1 ? "s" : ""}</p>
                  </div>
                  <div>
                    <p className="text-muted text-xs">Total Burned</p>
                    <p className="font-semibold text-danger">
                      {totalBurned ? formatTokenAmount(totalBurned, decimals) : "0"} {tokenInfo.symbol}
                    </p>
                    {totalBurned && totalSupply > 0n && (
                      <p className="text-xs text-muted">{(Number((totalBurned * 10000n) / totalSupply) / 100).toFixed(2)}% of supply</p>
                    )}
                  </div>
                </div>

                {tokenLocks.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-card-border space-y-2">
                    <p className="text-muted text-xs font-medium">Active Locks</p>
                    {tokenLocks.map((lock) => {
                      const remaining = lock.totalAmount - lock.claimedAmount;
                      const vestedPct = lock.totalAmount > 0n ? Number((lock.claimedAmount * 10000n) / lock.totalAmount) / 100 : 0;
                      const isExpanded = expandedLockId === lock.id;
                      const now = Math.floor(Date.now() / 1000);
                      const startT = Number(lock.startTime);
                      const endT = Number(lock.endTime);
                      let timeLabel = "";
                      if (now >= endT) timeLabel = "Fully vested";
                      else if (now < startT) {
                        const d = Math.floor((startT - now) / 86400);
                        const h = Math.floor(((startT - now) % 86400) / 3600);
                        timeLabel = `Starts in ${d}d ${h}h`;
                      } else {
                        const d = Math.floor((endT - now) / 86400);
                        const h = Math.floor(((endT - now) % 86400) / 3600);
                        timeLabel = d > 0 ? `${d}d ${h}h left` : `${h}h left`;
                      }
                      return (
                        <div key={lock.id}
                          className={`bg-background rounded-lg transition-all cursor-pointer ${isExpanded ? "ring-1 ring-primary/40" : ""}`}
                          onClick={() => setExpandedLockId(isExpanded ? null : lock.id)}
                        >
                          <div className="p-3 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="bg-primary/10 text-primary text-[10px] font-medium px-1.5 py-0.5 rounded">{getLockTypeLabel(lock.lockType)}</span>
                                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${now >= endT ? "bg-success/10 text-success" : "bg-primary/10 text-primary"}`}>{timeLabel}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold">{formatTokenAmount(remaining, decimals)} locked</span>
                                <span className={`text-[10px] transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}>▼</span>
                              </div>
                            </div>
                            <div className="flex gap-3 text-[10px] text-muted">
                              <span>Creator: {shortenAddress(lock.creator)}</span>
                              <span>Beneficiary: {shortenAddress(lock.beneficiary)}</span>
                            </div>
                            <div className="w-full bg-card rounded-full h-1 overflow-hidden">
                              <div className="bg-primary h-1 rounded-full transition-all" style={{ width: `${vestedPct}%` }} />
                            </div>
                          </div>
                          {isExpanded && (
                            <div className="border-t border-card-border p-3 space-y-3" onClick={(e) => e.stopPropagation()}>
                              <VestingChart
                                lockType={lock.lockType} startTime={startT} endTime={endT}
                                cliffTime={Number(lock.cliffTime)}
                                milestones={lock.milestones}
                              />
                              <div className="grid grid-cols-2 gap-2">
                                <div className="bg-card rounded-lg p-2">
                                  <p className="text-muted text-[10px]">Total Locked</p>
                                  <p className="font-semibold text-xs">{formatTokenAmount(lock.totalAmount, decimals)}</p>
                                </div>
                                <div className="bg-card rounded-lg p-2">
                                  <p className="text-muted text-[10px]">Claimed</p>
                                  <p className="font-semibold text-xs">{formatTokenAmount(lock.claimedAmount, decimals)}</p>
                                </div>
                              </div>
                              <div className="text-[10px] text-muted">
                                {formatDateTime(startT)} → {formatDateTime(endT)}
                              </div>
                              <div className="flex items-center gap-3 pt-1">
                                <button onClick={() => handleShareCertificate(lock)}
                                  className="text-xs text-primary hover:text-primary-hover transition-colors flex items-center gap-1">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" />
                                  </svg>
                                  {copiedLockId === lock.id ? "Copied!" : "Share Certificate"}
                                </button>
                                <button onClick={() => handleCopyForTwitter(lock)}
                                  className="text-xs text-muted hover:text-primary transition-colors flex items-center gap-1">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                                  </svg>
                                  Copy for Twitter
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </FadeIn>

          {/* Top Holders */}
          {onChainHolders.length > 0 && (() => {
            const totalPages = Math.ceil(onChainHolders.length / COMMUNITY_PER_PAGE);
            const offset = communityPage * COMMUNITY_PER_PAGE;
            const paginated = onChainHolders.slice(offset, offset + COMMUNITY_PER_PAGE);

            return (
              <FadeIn delay={300}>
                <div className="bg-card border border-card-border rounded-xl p-6">
                  <h3 className="font-semibold mb-4">Top Holders <span className="text-xs text-muted font-normal ml-1">{onChainHolders.length}</span></h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-muted text-xs border-b border-card-border">
                          <th className="text-left pb-2 pr-4">#</th>
                          <th className="text-left pb-2 pr-4">Address</th>
                          <th className="text-right pb-2 pr-4">Balance</th>
                          <th className="text-right pb-2 pr-4">% Supply</th>
                          <th className="text-right pb-2">Tag</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginated.map((holder, i) => {
                          const balance = BigInt(holder.balance);
                          const pct = totalSupply > 0n ? Number((balance * 10000n) / totalSupply) / 100 : 0;
                          const isDev = deployerAddress && holder.address.toLowerCase() === deployerAddress.toLowerCase();
                          const isMe = myAddress && holder.address.toLowerCase() === myAddress.toLowerCase();
                          return (
                            <tr key={holder.address} className={`border-b border-card-border/50 ${isDev ? "bg-primary/5" : isMe ? "bg-accent/5" : ""}`}>
                              <td className="py-2 pr-4 text-muted">{offset + i + 1}</td>
                              <td className="py-2 pr-4">
                                <div className="flex items-center gap-1.5">
                                  <Link href={`/profile/${holder.address}`} className="font-mono text-xs hover:text-primary">{shortenAddress(holder.address)}</Link>
                                </div>
                              </td>
                              <td className="py-2 pr-4 text-right font-medium text-xs">{formatTokenAmount(balance, decimals)}</td>
                              <td className="py-2 pr-4 text-right text-xs text-muted">{pct.toFixed(2)}%</td>
                              <td className="py-2 text-right flex items-center justify-end gap-1">
                                {isDev && <span className="bg-danger/10 text-danger text-[10px] font-medium px-1.5 py-0.5 rounded">DEV</span>}
                                {isMe && <span className="bg-accent/10 text-accent text-[10px] font-medium px-1.5 py-0.5 rounded">YOU</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-card-border">
                      <span className="text-muted text-xs">
                        {offset + 1}-{Math.min(offset + COMMUNITY_PER_PAGE, onChainHolders.length)} of {onChainHolders.length}
                      </span>
                      <div className="flex gap-2">
                        <button disabled={communityPage === 0} onClick={() => setCommunityPage(p => p - 1)}
                          className="text-sm px-3 py-1 rounded border border-card-border disabled:opacity-30 hover:bg-white/[0.04]">
                          Prev
                        </button>
                        <button disabled={communityPage >= totalPages - 1} onClick={() => setCommunityPage(p => p + 1)}
                          className="text-sm px-3 py-1 rounded border border-card-border disabled:opacity-30 hover:bg-white/[0.04]">
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </FadeIn>
            );
          })()}

          {/* Chart & Trade */}
          <FadeIn delay={400}>
            <div className="bg-card border border-card-border rounded-xl p-6">
              <h3 className="font-semibold mb-4">Chart & Trade</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {isMigrated ? (
                  <a href={`https://www.defined.fi/tempo/${tokenAddress}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-4 p-5 rounded-xl border border-card-border hover:border-foreground/20 bg-background transition-all group">
                    <div className="w-10 h-10 rounded-lg bg-foreground/10 flex items-center justify-center shrink-0">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-foreground">
                        <path d="M3 3v18h18" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium group-hover:text-foreground transition-colors">Defined.fi</p>
                      <p className="text-xs text-muted">Live chart & DEX analytics</p>
                    </div>
                  </a>
                ) : (
                  <a href={`https://launch.enshrined.exchange/token/${tokenAddress}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-4 p-5 rounded-xl border border-card-border hover:border-foreground/20 bg-background transition-all group">
                    <img src="/enshrined.jpg" alt="Enshrined" className="w-10 h-10 rounded-lg shrink-0" />
                    <div>
                      <p className="font-medium group-hover:text-foreground transition-colors">Enshrined Launchpad</p>
                      <p className="text-xs text-muted">Chart, buy & sell</p>
                    </div>
                  </a>
                )}
                <a href={isMigrated ? `https://launch.enshrined.exchange/token/${tokenAddress}` : `https://www.defined.fi/tempo/${tokenAddress}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-4 p-5 rounded-xl border border-card-border hover:border-foreground/20 bg-background transition-all group">
                  <div className="w-10 h-10 rounded-lg bg-foreground/10 flex items-center justify-center shrink-0">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-foreground">
                      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium group-hover:text-foreground transition-colors">{isMigrated ? "Enshrined" : "Defined.fi"}</p>
                    <p className="text-xs text-muted">{isMigrated ? "Trade history" : "Token analytics"}</p>
                  </div>
                </a>
              </div>
            </div>
          </FadeIn>
        </>
      )}
    </div>
  );
}
