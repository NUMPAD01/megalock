"use client";

import { useState, useEffect, useCallback } from "react";
import { useReadContract } from "wagmi";
import { formatUnits } from "viem";
import { MEGALOCK_ADDRESS, MEGALOCK_ABI, MEGABURN_ADDRESS, MEGABURN_ABI } from "@/lib/contracts";
import { shortenAddress, formatTokenAmount, getLockTypeLabel, formatDateTime } from "@/lib/utils";

const BLOCKSCOUT_API = "https://megaeth.blockscout.com/api/v2";

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

interface AddressInfo {
  creator_address_hash: string | null;
  token: { name: string; symbol: string } | null;
}

export default function TokenSearchPage() {
  const [searchInput, setSearchInput] = useState("");
  const [tokenAddress, setTokenAddress] = useState("");
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [holders, setHolders] = useState<HolderInfo[]>([]);
  const [deployerAddress, setDeployerAddress] = useState<string | null>(null);
  const [deployerBalance, setDeployerBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // On-chain: MegaBurn total burned for this token
  const { data: totalBurned } = useReadContract({
    address: MEGABURN_ADDRESS,
    abi: MEGABURN_ABI,
    functionName: "totalBurned",
    args: tokenAddress ? [tokenAddress as `0x${string}`] : undefined,
    query: { enabled: !!tokenAddress && tokenAddress.length === 42 },
  });

  // On-chain: total locks count
  const { data: nextLockId } = useReadContract({
    address: MEGALOCK_ADDRESS,
    abi: MEGALOCK_ABI,
    functionName: "nextLockId",
    query: { enabled: !!tokenAddress },
  });

  const fetchTokenData = useCallback(async (address: string) => {
    setLoading(true);
    setError(null);
    setTokenInfo(null);
    setHolders([]);
    setDeployerAddress(null);
    setDeployerBalance(null);

    try {
      // Fetch token info + holders + address info in parallel
      const [tokenRes, holdersRes, addressRes] = await Promise.all([
        fetch(`${BLOCKSCOUT_API}/tokens/${address}`),
        fetch(`${BLOCKSCOUT_API}/tokens/${address}/holders`),
        fetch(`${BLOCKSCOUT_API}/addresses/${address}`),
      ]);

      if (!tokenRes.ok) {
        throw new Error("Token not found on MegaETH");
      }

      const tokenData = await tokenRes.json();
      setTokenInfo(tokenData);

      if (holdersRes.ok) {
        const holdersData = await holdersRes.json();
        setHolders(holdersData.items || []);
      }

      if (addressRes.ok) {
        const addressData: AddressInfo = await addressRes.json();
        if (addressData.creator_address_hash) {
          setDeployerAddress(addressData.creator_address_hash);

          // Fetch deployer's balance of this token
          try {
            const balRes = await fetch(
              `${BLOCKSCOUT_API}/addresses/${addressData.creator_address_hash}/token-balances`
            );
            if (balRes.ok) {
              const balances = await balRes.json();
              const tokenBal = balances.find(
                (b: { token: { address: string } }) =>
                  b.token.address.toLowerCase() === address.toLowerCase()
              );
              setDeployerBalance(tokenBal?.value || "0");
            }
          } catch {
            // Non-critical
          }
        }
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
        <p className="text-muted mt-2">
          Search any ERC20 token on MegaETH by contract address
        </p>
      </div>

      {/* Search bar */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Enter token contract address (0x...)"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="flex-1 bg-card border border-card-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-primary"
        />
        <button
          onClick={handleSearch}
          disabled={loading}
          className="bg-primary hover:bg-primary-hover disabled:opacity-50 text-white font-medium py-3 px-6 rounded-lg transition-colors"
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 text-danger text-sm">
          {error}
        </div>
      )}

      {tokenInfo && (
        <>
          {/* Token Info Card */}
          <div className="bg-card border border-card-border rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              {tokenInfo.icon_url && (
                <img
                  src={tokenInfo.icon_url}
                  alt={tokenInfo.symbol}
                  className="w-10 h-10 rounded-full"
                />
              )}
              <div>
                <h2 className="text-xl font-bold">
                  {tokenInfo.name}{" "}
                  <span className="text-muted font-normal">
                    ({tokenInfo.symbol})
                  </span>
                </h2>
                <p className="text-muted text-xs font-mono">{tokenAddress}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-muted text-xs">Total Supply</p>
                <p className="font-semibold">
                  {formatTokenAmount(totalSupply, decimals)}
                </p>
              </div>
              <div>
                <p className="text-muted text-xs">Holders</p>
                <p className="font-semibold">{tokenInfo.holders}</p>
              </div>
              <div>
                <p className="text-muted text-xs">Decimals</p>
                <p className="font-semibold">{tokenInfo.decimals}</p>
              </div>
              <div>
                <p className="text-muted text-xs">Type</p>
                <p className="font-semibold">{tokenInfo.type}</p>
              </div>
            </div>
          </div>

          {/* Dev Info + MegaLock/Burn Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Dev Info */}
            <div className="bg-card border border-card-border rounded-xl p-6">
              <h3 className="font-semibold mb-3">Dev / Deployer</h3>
              {deployerAddress ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-muted text-xs">Deployer Address</p>
                    <a
                      href={`https://megaeth.blockscout.com/address/${deployerAddress}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary text-sm font-mono hover:underline"
                    >
                      {shortenAddress(deployerAddress)}
                    </a>
                  </div>
                  <div>
                    <p className="text-muted text-xs">Dev Token Balance</p>
                    {deployerBalance !== null ? (
                      <div>
                        <p className="font-semibold">
                          {formatTokenAmount(BigInt(deployerBalance), decimals)}{" "}
                          {tokenInfo.symbol}
                        </p>
                        {totalSupply > 0n && (
                          <p className="text-xs text-muted">
                            {(
                              Number(
                                (BigInt(deployerBalance) * 10000n) / totalSupply
                              ) / 100
                            ).toFixed(2)}
                            % of supply
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm">0</p>
                    )}
                  </div>
                  <div>
                    <p className="text-muted text-xs">Still Holding?</p>
                    {deployerBalance && BigInt(deployerBalance) > 0n ? (
                      <span className="text-danger font-semibold text-sm">
                        Yes — Dev still holds tokens
                      </span>
                    ) : (
                      <span className="text-success font-semibold text-sm">
                        No — Dev has no tokens
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-muted text-sm">
                  Deployer info not available
                </p>
              )}
            </div>

            {/* MegaLock + MegaBurn Stats */}
            <div className="bg-card border border-card-border rounded-xl p-6">
              <h3 className="font-semibold mb-3">MegaLock & Burn Stats</h3>
              <div className="space-y-3">
                <div>
                  <p className="text-muted text-xs">
                    Total Burned (via MegaBurn)
                  </p>
                  <p className="font-semibold text-danger">
                    {totalBurned
                      ? formatTokenAmount(totalBurned, decimals)
                      : "0"}{" "}
                    {tokenInfo.symbol}
                  </p>
                  {totalBurned && totalSupply > 0n && (
                    <p className="text-xs text-muted">
                      {(
                        Number((totalBurned * 10000n) / totalSupply) / 100
                      ).toFixed(2)}
                      % of supply
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-muted text-xs">Total Locks on MegaLock</p>
                  <p className="font-semibold">
                    {nextLockId !== undefined ? nextLockId.toString() : "0"}{" "}
                    locks created (all tokens)
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Top Holders */}
          {holders.length > 0 && (
            <div className="bg-card border border-card-border rounded-xl p-6">
              <h3 className="font-semibold mb-4">
                Top Holders ({holders.length})
              </h3>
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
                      const pct =
                        totalSupply > 0n
                          ? Number((balance * 10000n) / totalSupply) / 100
                          : 0;
                      const isDev =
                        deployerAddress &&
                        holder.address.hash.toLowerCase() ===
                          deployerAddress.toLowerCase();

                      return (
                        <tr
                          key={holder.address.hash}
                          className={`border-b border-card-border/50 ${
                            isDev ? "bg-primary/5" : ""
                          }`}
                        >
                          <td className="py-2 pr-4 text-muted">{i + 1}</td>
                          <td className="py-2 pr-4">
                            <a
                              href={`https://megaeth.blockscout.com/address/${holder.address.hash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-xs hover:text-primary"
                            >
                              {holder.address.name ||
                                shortenAddress(holder.address.hash)}
                            </a>
                          </td>
                          <td className="py-2 pr-4 text-right font-medium">
                            {formatTokenAmount(balance, decimals)}
                          </td>
                          <td className="py-2 pr-4 text-right">{pct.toFixed(2)}%</td>
                          <td className="py-2 text-right">
                            {isDev && (
                              <span className="bg-danger/10 text-danger text-xs font-medium px-2 py-0.5 rounded">
                                DEV
                              </span>
                            )}
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
