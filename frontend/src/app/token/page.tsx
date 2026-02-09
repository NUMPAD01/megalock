"use client";

import { useState, useEffect, useCallback } from "react";
import { useReadContract, usePublicClient } from "wagmi";
import { MEGALOCK_ADDRESS, MEGALOCK_ABI, MEGABURN_ADDRESS, MEGABURN_ABI } from "@/lib/contracts";
import { shortenAddress, formatTokenAmount } from "@/lib/utils";

const BLOCKSCOUT_API = "https://megaeth.blockscout.com/api/v2";
const BLOCKSCOUT_V1 = "https://megaeth.blockscout.com/api";

interface TokenInfo {
  name: string;
  symbol: string;
  decimals: string;
  total_supply: string;
  holders: string;
  type: string;
  exchange_rate: string | null;
  icon_url: string | null;
}

interface HolderInfo {
  address: { hash: string; name: string | null };
  value: string;
}


export default function TokenSearchPage() {
  const [searchInput, setSearchInput] = useState("");
  const [tokenAddress, setTokenAddress] = useState("");
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [holders, setHolders] = useState<HolderInfo[]>([]);
  const [deployerAddress, setDeployerAddress] = useState<string | null>(null);
  const [deployerBalance, setDeployerBalance] = useState<string | null>(null);
  const [deployerTokensCreated, setDeployerTokensCreated] = useState<number | null>(null);
  const [devSoldStatus, setDevSoldStatus] = useState<"sold" | "holding" | "never_held" | null>(null);
  const [devTotalReceived, setDevTotalReceived] = useState<bigint | null>(null);
  const [devTotalSold, setDevTotalSold] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockedAmount, setLockedAmount] = useState(0n);
  const [lockCount, setLockCount] = useState(0);

  const publicClient = usePublicClient();

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
      return;
    }

    const scanLocks = async () => {
      let total = 0n;
      let count = 0;
      const n = Number(nextLockId);
      for (let i = 0; i < Math.min(n, 100); i++) {
        try {
          const lock = await publicClient.readContract({
            address: MEGALOCK_ADDRESS, abi: MEGALOCK_ABI, functionName: "getLock", args: [BigInt(i)],
          });
          if (lock.token.toLowerCase() === tokenAddress.toLowerCase() && !lock.cancelled) {
            total += lock.totalAmount - lock.claimedAmount;
            count++;
          }
        } catch { /* skip */ }
      }
      setLockedAmount(total);
      setLockCount(count);
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
    setDeployerTokensCreated(null);
    setDevSoldStatus(null);
    setDevTotalReceived(null);
    setDevTotalSold(null);

    try {
      const [tokenRes, holdersRes, addressRes] = await Promise.all([
        fetch(`${BLOCKSCOUT_API}/tokens/${address}`),
        fetch(`${BLOCKSCOUT_API}/tokens/${address}/holders`),
        fetch(`${BLOCKSCOUT_API}/addresses/${address}`),
      ]);

      if (!tokenRes.ok) throw new Error("Token not found on MegaETH");

      const tokenData = await tokenRes.json();
      setTokenInfo(tokenData);

      if (holdersRes.ok) {
        const holdersData = await holdersRes.json();
        setHolders(holdersData.items || []);
      }

      // Find deployer: try creator_address_hash first, then fallback to first mint recipient
      let deployer: string | null = null;

      if (addressRes.ok) {
        const addressData = await addressRes.json();
        deployer = addressData.creator_address_hash;
      }

      // Fallback: find who initiated the first mint transaction (the actual token deployer)
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
              // Fetch the actual transaction to find who initiated it
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
          const [balRes, transfersRes, allTokenTxRes] = await Promise.all([
            fetch(`${BLOCKSCOUT_API}/addresses/${deployer}/token-balances`),
            fetch(`${BLOCKSCOUT_V1}?module=account&action=tokentx&address=${deployer}&contractaddress=${address}&sort=asc&page=1&offset=100`),
            fetch(`${BLOCKSCOUT_V1}?module=account&action=tokentx&address=${deployer}&sort=asc&page=1&offset=200`),
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

          // Calculate total received and total sold for this token
          if (transfersRes.ok) {
            const transfersData = await transfersRes.json();
            const transfers = transfersData.result || [];
            let totalIn = 0n;
            let totalOut = 0n;
            for (const t of transfers) {
              const val = BigInt(t.value || "0");
              if (t.to?.toLowerCase() === deployer.toLowerCase()) {
                totalIn += val;
              }
              if (t.from?.toLowerCase() === deployer.toLowerCase()) {
                totalOut += val;
              }
            }
            setDevTotalReceived(totalIn);
            setDevTotalSold(totalOut);

            if (BigInt(currentBalance) > 0n) {
              setDevSoldStatus("holding");
            } else if (totalIn > 0n) {
              setDevSoldStatus("sold");
            } else {
              setDevSoldStatus("never_held");
            }
          }

          // Count tokens created: unique token contracts where deployer received minted tokens (from 0x0)
          if (allTokenTxRes.ok) {
            const allTxData = await allTokenTxRes.json();
            const allTransfers = allTxData.result || [];
            const mintedTokens = new Set<string>();
            for (const t of allTransfers) {
              if (
                t.from === "0x0000000000000000000000000000000000000000" &&
                t.to?.toLowerCase() === deployer.toLowerCase()
              ) {
                mintedTokens.add(t.contractAddress?.toLowerCase());
              }
            }
            setDeployerTokensCreated(mintedTokens.size);
          }
        } catch { /* Non-critical */ }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch token data");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearch = () => {
    const addr = searchInput.trim();
    if (addr.length === 42 && addr.startsWith("0x")) {
      setTokenAddress(addr);
      fetchTokenData(addr);
    } else {
      setError("Invalid address. Enter a valid 0x... contract address.");
    }
  };

  const decimals = tokenInfo ? parseInt(tokenInfo.decimals) : 18;
  const totalSupply = tokenInfo ? BigInt(tokenInfo.total_supply) : 0n;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Token Search</h1>
        <p className="text-muted mt-2">Search any ERC20 token on MegaETH by contract address</p>
      </div>

      <div className="flex gap-2">
        <input
          type="text" placeholder="Enter token contract address (0x...)"
          value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="flex-1 bg-card border border-card-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-primary"
        />
        <button onClick={handleSearch} disabled={loading}
          className="bg-primary hover:bg-primary-hover disabled:opacity-50 text-white font-medium py-3 px-6 rounded-lg transition-colors">
          {loading ? "Searching..." : "Search"}
        </button>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 text-danger text-sm">{error}</div>
      )}

      {tokenInfo && (
        <>
          <div className="bg-card border border-card-border rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              {tokenInfo.icon_url && <img src={tokenInfo.icon_url} alt={tokenInfo.symbol} className="w-10 h-10 rounded-full" />}
              <div>
                <h2 className="text-xl font-bold">{tokenInfo.name} <span className="text-muted font-normal">({tokenInfo.symbol})</span></h2>
                <p className="text-muted text-xs font-mono">{tokenAddress}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div><p className="text-muted text-xs">Total Supply</p><p className="font-semibold">{formatTokenAmount(totalSupply, decimals)}</p></div>
              <div><p className="text-muted text-xs">Holders</p><p className="font-semibold">{tokenInfo.holders}</p></div>
              <div><p className="text-muted text-xs">Decimals</p><p className="font-semibold">{tokenInfo.decimals}</p></div>
              <div><p className="text-muted text-xs">Type</p><p className="font-semibold">{tokenInfo.type}</p></div>
            </div>
          </div>

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
                  {deployerTokensCreated !== null && (
                    <div>
                      <p className="text-muted text-xs">Tokens Created on MegaETH</p>
                      <p className="font-semibold">{deployerTokensCreated} contract{deployerTokensCreated !== 1 ? "s" : ""} deployed</p>
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
                    {devSoldStatus === "holding" && (
                      <span className="text-success font-semibold text-sm">✅ Dev still holds tokens</span>
                    )}
                    {devSoldStatus === "sold" && (
                      <span className="text-danger font-bold text-sm">DEV SOLD</span>
                    )}
                    {devSoldStatus === "never_held" && (
                      <span className="text-muted font-semibold text-sm">— Dev never held this token</span>
                    )}
                    {devSoldStatus === null && deployerBalance !== null && (
                      <span className="text-muted text-sm">Loading...</span>
                    )}
                  </div>
                </div>
              ) : <p className="text-muted text-sm">Deployer info not available</p>}
            </div>

            <div className="bg-card border border-card-border rounded-xl p-6">
              <h3 className="font-semibold mb-3">Lock & Burn Stats</h3>
              <div className="space-y-3">
                <div>
                  <p className="text-muted text-xs">Total Locked</p>
                  <p className="font-semibold text-primary">
                    {lockedAmount > 0n ? formatTokenAmount(lockedAmount, decimals) : "0"} {tokenInfo.symbol}
                  </p>
                  {lockedAmount > 0n && totalSupply > 0n && (
                    <p className="text-xs text-muted">{(Number((lockedAmount * 10000n) / totalSupply) / 100).toFixed(2)}% of supply</p>
                  )}
                  <p className="text-xs text-muted mt-1">{lockCount} active lock{lockCount !== 1 ? "s" : ""} for this token</p>
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
            </div>
          </div>

          {holders.length > 0 && (
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

                      return (
                        <tr key={holder.address.hash} className={`border-b border-card-border/50 ${isDev ? "bg-primary/5" : ""}`}>
                          <td className="py-2 pr-4 text-muted">{i + 1}</td>
                          <td className="py-2 pr-4">
                            <a href={`https://megaeth.blockscout.com/address/${holder.address.hash}`}
                              target="_blank" rel="noopener noreferrer" className="font-mono text-xs hover:text-primary">
                              {holder.address.name || shortenAddress(holder.address.hash)}
                            </a>
                          </td>
                          <td className="py-2 pr-4 text-right font-medium">{formatTokenAmount(balance, decimals)}</td>
                          <td className="py-2 pr-4 text-right">{pct.toFixed(2)}%</td>
                          <td className="py-2 text-right">
                            {isDev && <span className="bg-danger/10 text-danger text-xs font-medium px-2 py-0.5 rounded">DEV</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
