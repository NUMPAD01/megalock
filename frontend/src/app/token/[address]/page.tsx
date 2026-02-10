"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useReadContract, usePublicClient, useAccount } from "wagmi";
import { MEGALOCK_ADDRESS, MEGALOCK_ABI, MEGABURN_ADDRESS, MEGABURN_ABI } from "@/lib/contracts";
import { shortenAddress, formatTokenAmount, formatDateTime, getLockTypeLabel, formatUsd } from "@/lib/utils";
import { rpcClient } from "@/lib/rpcClient";
import { useWatchlist } from "@/hooks/useWatchlist";
import { generateLockCertificate } from "@/lib/generateLockCertificate";
import { VestingChart } from "@/components/VestingChart";
import { FadeIn } from "@/components/FadeIn";

const BLOCKSCOUT_API = "https://megaeth.blockscout.com/api/v2";
const BLOCKSCOUT_V1 = "https://megaeth.blockscout.com/api";

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
  const [searchDropdown, setSearchDropdown] = useState<Array<{name: string; symbol: string; address_hash: string; icon_url: string | null; circulating_market_cap: string | null}>>([]);
  const [searchingDropdown, setSearchingDropdown] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dexData, setDexData] = useState<{priceUsd: string | null; mcap: number | null; volume24h: number | null} | null>(null);
  const [dropdownMcap, setDropdownMcap] = useState<Record<string, { mcap: string | null; vol: string | null }>>({});

  const publicClient = usePublicClient();
  const watched = tokenInfo ? isWatched(tokenAddress) : false;

  const toggleWatchlist = () => {
    if (!tokenInfo) return;
    if (watched) removeToken(tokenAddress);
    else addToken({ address: tokenAddress, name: tokenInfo.name, symbol: tokenInfo.symbol });
  };

  const { data: totalBurned } = useReadContract({
    address: MEGABURN_ADDRESS, abi: MEGABURN_ABI, functionName: "totalBurned",
    args: tokenAddress ? [tokenAddress as `0x${string}`] : undefined,
    query: { enabled: !!tokenAddress && tokenAddress.length === 42 },
  });

  const { data: nextLockId } = useReadContract({
    address: MEGALOCK_ADDRESS, abi: MEGALOCK_ABI, functionName: "nextLockId",
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
            address: MEGALOCK_ADDRESS, abi: MEGALOCK_ABI, functionName: "getLock", args: [BigInt(i)],
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
                    address: MEGALOCK_ADDRESS, abi: MEGALOCK_ABI, functionName: "getMilestones", args: [BigInt(i)],
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
      const [tokenRes, holdersRes, addressRes] = await Promise.all([
        fetch(`${BLOCKSCOUT_API}/tokens/${address}`),
        fetch(`${BLOCKSCOUT_API}/tokens/${address}/holders`),
        fetch(`${BLOCKSCOUT_API}/addresses/${address}`),
      ]);

      let tokenData: TokenInfo;

      if (tokenRes.ok) {
        tokenData = await tokenRes.json();
      } else {
        const erc20 = [
          { type: "function", name: "name", inputs: [], outputs: [{ type: "string" }], stateMutability: "view" },
          { type: "function", name: "symbol", inputs: [], outputs: [{ type: "string" }], stateMutability: "view" },
          { type: "function", name: "decimals", inputs: [], outputs: [{ type: "uint8" }], stateMutability: "view" },
          { type: "function", name: "totalSupply", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
        ] as const;
        const addr = address as `0x${string}`;
        try {
          const [name, symbol, decimals, totalSupply] = await Promise.all([
            rpcClient.readContract({ address: addr, abi: erc20, functionName: "name" }),
            rpcClient.readContract({ address: addr, abi: erc20, functionName: "symbol" }),
            rpcClient.readContract({ address: addr, abi: erc20, functionName: "decimals" }),
            rpcClient.readContract({ address: addr, abi: erc20, functionName: "totalSupply" }),
          ]);
          tokenData = {
            name: name as string, symbol: symbol as string,
            decimals: String(decimals), total_supply: String(totalSupply),
            holders_count: "0", type: "ERC-20", exchange_rate: null, icon_url: null, circulating_market_cap: null, volume_24h: null,
          };
        } catch {
          if (addressRes.ok) {
            const addrData = await addressRes.json();
            if (addrData.is_contract) throw new Error("This address is a contract (e.g. LP pair) but not an ERC20 token");
          }
          throw new Error("Token not found on MegaETH");
        }
      }

      setTokenInfo(tokenData);

      if (holdersRes.ok) {
        const holdersData = await holdersRes.json();
        setHolders(holdersData.items || []);
      }

      let deployer: string | null = null;

      if (addressRes.ok) {
        const addressData = await addressRes.json();
        deployer = addressData.creator_address_hash;
        setIsContractVerified(!!addressData.is_verified);
      }

      if (!deployer) {
        try {
          const mintRes = await fetch(
            `${BLOCKSCOUT_V1}?module=account&action=tokentx&contractaddress=${address}&sort=asc&page=1&offset=5`
          );
          if (mintRes.ok) {
            const mintData = await mintRes.json();
            const transfers = mintData.result || [];
            const mint = transfers.find(
              (t: { from: string }) => t.from === "0x0000000000000000000000000000000000000000"
            );
            if (mint?.hash) {
              const txDetailRes = await fetch(`${BLOCKSCOUT_API}/transactions/${mint.hash}`);
              if (txDetailRes.ok) {
                const txDetail = await txDetailRes.json();
                deployer = txDetail.from?.hash || null;
              }
            }
          }
        } catch { /* Non-critical */ }
      }

      if (deployer) {
        setDeployerAddress(deployer);

        try {
          const [balRes, transfersRes, countersRes] = await Promise.all([
            fetch(`${BLOCKSCOUT_API}/addresses/${deployer}/token-balances`),
            fetch(`${BLOCKSCOUT_V1}?module=account&action=tokentx&address=${deployer}&contractaddress=${address}&sort=asc&page=1&offset=100`),
            fetch(`${BLOCKSCOUT_API}/addresses/${deployer}/counters`),
          ]);

          let currentBalance = "0";
          if (balRes.ok) {
            const balances = await balRes.json();
            const tokenBal = balances.find(
              (b: { token: { address_hash: string } }) =>
                b.token?.address_hash?.toLowerCase() === address.toLowerCase()
            );
            currentBalance = tokenBal?.value || "0";
            setDeployerBalance(currentBalance);
          }

          if (transfersRes.ok) {
            const transfersData = await transfersRes.json();
            const transfers = transfersData.result || [];
            let totalIn = 0n;
            let totalOut = 0n;
            for (const t of transfers) {
              const val = BigInt(t.value || "0");
              if (t.to?.toLowerCase() === deployer.toLowerCase()) totalIn += val;
              if (t.from?.toLowerCase() === deployer.toLowerCase()) totalOut += val;
            }
            setDevTotalReceived(totalIn);
            setDevTotalSold(totalOut);

            if (BigInt(currentBalance) > 0n) setDevSoldStatus("holding");
            else if (totalIn > 0n) setDevSoldStatus("sold");
            else setDevSoldStatus("never_held");
          }

          if (countersRes.ok) {
            const counters = await countersRes.json();
            setDeployerTxCount(Number(counters.transactions_count) || 0);
          }
        } catch { /* Non-critical */ }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch token data");
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
    } else if (searchDropdown.length > 0) {
      router.push(`/token/${searchDropdown[0].address_hash}`);
      setSearchDropdown([]);
    }
  };

  const decimals = tokenInfo ? parseInt(tokenInfo.decimals) : 18;
  const totalSupply = tokenInfo ? BigInt(tokenInfo.total_supply) : 0n;

  // Sync search input when navigating between tokens
  useEffect(() => {
    setSearchInput(tokenAddress || "");
    setSearchDropdown([]);
    setDexData(null);
  }, [tokenAddress]);

  // Fetch DexScreener data as fallback for price/mcap/volume
  useEffect(() => {
    if (!tokenAddress) return;
    const fetchDex = async () => {
      try {
        const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
        if (!res.ok) return;
        const data = await res.json();
        const pair = data.pairs?.[0];
        if (pair) {
          setDexData({
            priceUsd: pair.priceUsd || null,
            mcap: pair.marketCap || pair.fdv || null,
            volume24h: pair.volume?.h24 || null,
          });
        }
      } catch { /* skip */ }
    };
    fetchDex();
  }, [tokenAddress]);

  // Auto-search dropdown as user types (debounced)
  useEffect(() => {
    const query = searchInput.trim();
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (query.length < 2 || (query.length === 42 && query.startsWith("0x"))) {
      setSearchDropdown([]);
      setSearchingDropdown(false);
      return;
    }
    setSearchingDropdown(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`https://megaeth.blockscout.com/api/v2/search?q=${encodeURIComponent(query)}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        const tokens = (data.items || []).filter(
          (item: { type: string; token_type: string }) => item.type === "token" && item.token_type === "ERC-20"
        );
        setSearchDropdown(tokens);
      } catch { setSearchDropdown([]); }
      finally { setSearchingDropdown(false); }
    }, 400);
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [searchInput]);

  // Fetch mcap+vol from DexScreener for search dropdown results
  useEffect(() => {
    if (searchDropdown.length === 0) { setDropdownMcap({}); return; }
    const fetchMcaps = async () => {
      const map: Record<string, { mcap: string | null; vol: string | null }> = {};
      await Promise.all(
        searchDropdown.map(async (result) => {
          try {
            const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${result.address_hash}`);
            if (!res.ok) return;
            const data = await res.json();
            const pair = data.pairs?.[0];
            if (pair) {
              map[result.address_hash] = {
                mcap: result.circulating_market_cap || (pair.marketCap ? String(pair.marketCap) : pair.fdv ? String(pair.fdv) : null),
                vol: pair.volume?.h24 ? String(pair.volume.h24) : null,
              };
            }
          } catch { /* skip */ }
        })
      );
      setDropdownMcap(map);
    };
    fetchMcaps();
  }, [searchDropdown]);

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
      a.download = `megascan-lock-${lock.id}-${tokenInfo.symbol}.png`;
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
    const text = `${tokenInfo.name} ($${tokenInfo.symbol}) has ${formatTokenAmount(remaining, decimals)} tokens locked (${pct}% of supply) via @megascanapp\n\nLock type: ${getLockTypeLabel(lock.lockType)}\nUnlocks: ${formatDateTime(endT)}\n\nVerify: megascan.app/token/${tokenAddress}`;
    navigator.clipboard.writeText(text);
    setCopiedLockId(lock.id);
    setTimeout(() => setCopiedLockId(null), 2000);
  };

  return (
    <div className="space-y-6">
      <FadeIn>
        <div>
          <h1 className="text-3xl font-bold">Token Search</h1>
          <p className="text-muted mt-2">Search any ERC20 token on MegaETH by name, symbol, or contract address</p>
        </div>
      </FadeIn>

      <FadeIn delay={50} className="relative z-50">
        <div className="relative">
          <div className="flex gap-2">
            <input
              type="text" placeholder="Search by name, symbol, or address (0x...)"
              value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="flex-1 bg-card border border-card-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-primary"
            />
            <button onClick={handleSearch} disabled={loading}
              className="bg-primary hover:bg-primary-hover disabled:opacity-50 text-white font-medium py-3 px-6 rounded-lg transition-colors">
              {loading ? "Searching..." : "Search"}
            </button>
          </div>
          {searchingDropdown && (
            <div className="absolute z-10 left-0 right-0 mt-2 bg-card border border-card-border rounded-xl p-4 animate-pulse h-16" />
          )}
          {!searchingDropdown && searchDropdown.length > 0 && (
            <div className="absolute z-10 left-0 right-0 mt-2 bg-card border border-card-border rounded-xl overflow-hidden max-h-80 overflow-y-auto shadow-lg">
              {searchDropdown.map((result) => (
                <Link
                  key={result.address_hash}
                  href={`/token/${result.address_hash}`}
                  onClick={() => setSearchDropdown([])}
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
                    <div>
                      <span className="text-sm font-medium">{result.name}</span>
                      <span className="text-muted text-xs ml-1.5">({result.symbol})</span>
                    </div>
                    <div className="flex gap-3 text-[10px] text-muted mt-0.5">
                      <span>MC: <span className="text-foreground font-medium">{dropdownMcap[result.address_hash]?.mcap ? formatUsd(dropdownMcap[result.address_hash].mcap) : "—"}</span></span>
                      <span>VOL: <span className="text-foreground font-medium">{dropdownMcap[result.address_hash]?.vol ? formatUsd(dropdownMcap[result.address_hash].vol) : "—"}</span></span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-muted text-[10px] font-mono">{shortenAddress(result.address_hash)}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
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
              <div className="flex items-center gap-3 mb-4">
                {tokenInfo.icon_url && <img src={tokenInfo.icon_url} alt={tokenInfo.symbol} className="w-10 h-10 rounded-full" />}
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <a href={`https://megaeth.blockscout.com/address/${tokenAddress}`} target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">
                      <h2 className="text-xl font-bold">{tokenInfo.name} <span className="text-muted font-normal">({tokenInfo.symbol})</span></h2>
                    </a>
                    <a href={`https://dexscreener.com/megaeth/${tokenAddress}`} target="_blank" rel="noopener noreferrer"
                      title="View on DexScreener" className="opacity-70 hover:opacity-100 transition-opacity">
                      <img src="/dexscreener.png" alt="DexScreener" className="w-5 h-5 rounded-sm" />
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
                  <a href={`https://megaeth.blockscout.com/address/${tokenAddress}`} target="_blank" rel="noopener noreferrer" className="text-muted text-xs font-mono hover:text-primary transition-colors">{tokenAddress}</a>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div><p className="text-muted text-xs">Total Supply</p><p className="font-semibold">{formatTokenAmount(totalSupply, decimals)}</p></div>
                <div><p className="text-muted text-xs">Holders</p><p className="font-semibold">{tokenInfo.holders_count || "0"}</p></div>
                <div><p className="text-muted text-xs">Market Cap</p><p className="font-semibold">{formatUsd(tokenInfo.circulating_market_cap || dexData?.mcap)}</p></div>
                <div><p className="text-muted text-xs">Volume 24h</p><p className="font-semibold">{formatUsd(tokenInfo.volume_24h || dexData?.volume24h)}</p></div>
                <div><p className="text-muted text-xs">Price</p><p className="font-semibold">{formatUsd(tokenInfo.exchange_rate || dexData?.priceUsd)}</p></div>
                <div><p className="text-muted text-xs">Decimals</p><p className="font-semibold">{tokenInfo.decimals}</p></div>
              </div>
            </div>
          </FadeIn>

          {/* Dev / Lock & Burn */}
          <FadeIn delay={200}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-card border border-card-border rounded-xl p-6">
                <h3 className="font-semibold mb-3">Dev / Deployer</h3>
                {deployerAddress ? (
                  <div className="space-y-3">
                    <div>
                      <p className="text-muted text-xs">Deployer Address</p>
                      <a href={`https://megaeth.blockscout.com/address/${deployerAddress}`} target="_blank" rel="noopener noreferrer"
                        className="text-primary text-sm font-mono hover:underline">{shortenAddress(deployerAddress)}</a>
                    </div>
                    {deployerTxCount !== null && (
                      <div>
                        <p className="text-muted text-xs">Transactions on MegaETH</p>
                        <p className="font-semibold">{deployerTxCount} tx{deployerTxCount !== 1 ? "s" : ""}</p>
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
                    {devTotalReceived !== null && devTotalReceived > 0n && (
                      <div>
                        <p className="text-muted text-xs">Dev Token Flow</p>
                        <p className="text-sm">Received: <span className="font-semibold">{formatTokenAmount(devTotalReceived, decimals)} {tokenInfo.symbol}</span></p>
                        <p className="text-sm">Sold/Sent: <span className="font-semibold">{formatTokenAmount(devTotalSold ?? 0n, decimals)} {tokenInfo.symbol}</span></p>
                      </div>
                    )}
                    <div>
                      <p className="text-muted text-xs">Dev Status</p>
                      {devSoldStatus === "holding" && <span className="text-success font-semibold text-sm">Dev still holds tokens</span>}
                      {devSoldStatus === "sold" && <span className="text-danger font-bold text-sm">DEV SOLD</span>}
                      {devSoldStatus === "never_held" && <span className="text-muted font-semibold text-sm">Dev never held this token</span>}
                      {devSoldStatus === null && deployerBalance !== null && <span className="text-muted text-sm">Loading...</span>}
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
          {holders.length > 0 && (
            <FadeIn delay={300}>
              <div className="bg-card border border-card-border rounded-xl p-6">
                <h3 className="font-semibold mb-4">Top Holders ({holders.length})</h3>
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
                      {holders.map((holder, i) => {
                        const balance = BigInt(holder.value);
                        const pct = totalSupply > 0n ? Number((balance * 10000n) / totalSupply) / 100 : 0;
                        const isDev = deployerAddress && holder.address.hash.toLowerCase() === deployerAddress.toLowerCase();
                        const isMe = myAddress && holder.address.hash.toLowerCase() === myAddress.toLowerCase();
                        const displayLabel = holder.address.name || shortenAddress(holder.address.hash);

                        return (
                          <tr key={holder.address.hash} className={`border-b border-card-border/50 ${isDev ? "bg-primary/5" : isMe ? "bg-accent/5" : ""}`}>
                            <td className="py-2 pr-4 text-muted">{i + 1}</td>
                            <td className="py-2 pr-4">
                              <div className="flex items-center gap-1.5">
                                <Link href={`/profile/${holder.address.hash}`} className="font-mono text-xs hover:text-primary">
                                  {displayLabel}
                                </Link>
                                {holder.address.name && <span className="text-[10px] text-muted font-mono">({shortenAddress(holder.address.hash)})</span>}
                              </div>
                            </td>
                            <td className="py-2 pr-4 text-right font-medium">{formatTokenAmount(balance, decimals)}</td>
                            <td className="py-2 pr-4 text-right">{pct.toFixed(2)}%</td>
                            <td className="py-2 text-right flex items-center justify-end gap-1">
                              {isMe && <span className="bg-accent/10 text-accent text-xs font-medium px-2 py-0.5 rounded">YOU</span>}
                              {isDev && <span className="bg-danger/10 text-danger text-xs font-medium px-2 py-0.5 rounded">DEV</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </FadeIn>
          )}

          {/* DexScreener Chart */}
          <FadeIn delay={400}>
            <div className="bg-card border border-card-border rounded-xl p-6">
              <h3 className="font-semibold mb-3">Price Chart</h3>
              <div className="rounded-lg overflow-hidden border border-card-border" style={{ height: 400 }}>
                <iframe
                  src={`https://dexscreener.com/megaeth/${tokenAddress}?embed=1&theme=dark&info=0`}
                  title="DexScreener Chart"
                  className="w-full h-full border-0"
                  allow="clipboard-write"
                />
              </div>
              <p className="text-muted text-xs mt-2">
                Chart by DexScreener — <a href={`https://dexscreener.com/megaeth/${tokenAddress}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Open full chart</a>
              </p>
            </div>
          </FadeIn>
        </>
      )}
    </div>
  );
}
