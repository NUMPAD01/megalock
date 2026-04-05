"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { formatUnits, parseAbiItem } from "viem";
import { rpcClient } from "@/lib/rpcClient";
import { ERC20_ABI } from "@/lib/contracts";

interface KnownToken {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
}

interface WalletToken extends KnownToken {
  balance: bigint;
}

interface TokenSelectorProps {
  onSelect: (address: string, decimals: number, symbol: string) => void;
  selectedToken: string;
}

export function TokenSelector({ onSelect, selectedToken }: TokenSelectorProps) {
  const { address: walletAddress } = useAccount();
  const [tokens, setTokens] = useState<WalletToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  useEffect(() => {
    if (!walletAddress) return;

    const fetchBalances = async () => {
      setLoading(true);
      try {
        // Fetch balances from Tempo Explorer API
        const withBalance: WalletToken[] = [];
        try {
          const res = await fetch(`/api/wallet-balances?address=${walletAddress}`);
          if (res.ok) {
            const data = await res.json();
            if (data?.balances) {
              for (const t of data.balances) {
                const bal = BigInt(t.balance || "0");
                if (bal > 0n) {
                  withBalance.push({
                    address: t.token,
                    name: t.name || "Unknown",
                    symbol: t.symbol || "???",
                    decimals: t.decimals ?? 6,
                    balance: bal,
                    logoURI: undefined,
                  });
                }
              }
            }
          }
        } catch { /* skip */ }

        withBalance.sort((a, b) => (b.balance > a.balance ? 1 : b.balance < a.balance ? -1 : 0));
        setTokens(withBalance);
      } catch {
        setTokens([]);
      } finally {
        setLoading(false);
      }
    };

    fetchBalances();
  }, [walletAddress]);

  const handleManualLoad = async () => {
    const addr = manualInput.trim();
    if (!addr || addr.length !== 42 || !addr.startsWith("0x")) {
      setManualError("Enter a valid address (0x...)");
      return;
    }
    setManualLoading(true);
    setManualError(null);
    try {
      const [symbol, decimals] = await Promise.all([
        rpcClient.readContract({ address: addr as `0x${string}`, abi: ERC20_ABI, functionName: "symbol" }),
        rpcClient.readContract({ address: addr as `0x${string}`, abi: ERC20_ABI, functionName: "decimals" }),
      ]);
      onSelect(addr, Number(decimals), symbol as string);
      setOpen(false);
      setManualInput("");
    } catch {
      setManualError("Not a valid ERC20/TIP-20 token");
    } finally {
      setManualLoading(false);
    }
  };

  const selected = selectedToken
    ? tokens.find((t) => t.address.toLowerCase() === selectedToken.toLowerCase())
    : undefined;

  if (loading) {
    return (
      <div className="w-full bg-background border border-card-border rounded-lg px-3 py-2.5 text-sm text-muted animate-pulse">
        Loading your tokens...
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full bg-background border border-card-border rounded-lg px-3 py-2.5 text-sm text-left focus:outline-none focus:border-primary flex items-center justify-between"
      >
        {selected ? (
          <span className="flex items-center gap-2">
            {selected.logoURI && <img src={selected.logoURI} alt="" className="w-5 h-5 rounded-full" />}
            <span className="font-medium">{selected.symbol}</span>
            <span className="text-muted">
              — {parseFloat(formatUnits(selected.balance, selected.decimals)).toLocaleString()} tokens
            </span>
          </span>
        ) : selectedToken ? (
          <span className="text-foreground font-mono text-xs">{selectedToken.slice(0, 10)}...{selectedToken.slice(-6)}</span>
        ) : (
          <span className="text-muted">Select a token</span>
        )}
        <span className="text-muted">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-card border border-card-border rounded-lg shadow-lg max-h-72 overflow-y-auto">
          {/* Manual input */}
          <div className="p-2 border-b border-card-border">
            <div className="flex gap-1.5">
              <input
                type="text"
                placeholder="Or paste address (0x...)"
                value={manualInput}
                onChange={(e) => { setManualInput(e.target.value); setManualError(null); }}
                onKeyDown={(e) => e.key === "Enter" && handleManualLoad()}
                className="flex-1 bg-background border border-card-border rounded px-2 py-1.5 text-xs focus:outline-none focus:border-primary font-mono"
              />
              <button
                type="button"
                onClick={handleManualLoad}
                disabled={manualLoading}
                className="bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium px-3 rounded transition-colors disabled:opacity-50"
              >
                {manualLoading ? "..." : "Load"}
              </button>
            </div>
            {manualError && <p className="text-danger text-[10px] mt-1">{manualError}</p>}
          </div>

          {tokens.length === 0 ? (
            <div className="px-3 py-4 text-center text-muted text-xs">
              No tokens found in wallet
            </div>
          ) : (
            tokens.map((t) => {
              const bal = formatUnits(t.balance, t.decimals);
              const isSelected = selectedToken && t.address.toLowerCase() === selectedToken.toLowerCase();
              return (
                <button
                  key={t.address}
                  type="button"
                  onClick={() => {
                    onSelect(t.address, t.decimals, t.symbol);
                    setOpen(false);
                  }}
                  className={`w-full px-3 py-2.5 text-sm text-left hover:bg-primary/10 flex items-center gap-2 transition-colors ${
                    isSelected ? "bg-primary/5" : ""
                  }`}
                >
                  {t.logoURI ? (
                    <img src={t.logoURI} alt="" className="w-5 h-5 rounded-full" />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-card-border flex items-center justify-center shrink-0">
                      <span className="text-[8px] font-bold text-muted">{t.symbol.slice(0, 2)}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{t.symbol}</span>
                      <span className="text-muted text-xs truncate">{t.name}</span>
                    </div>
                    <p className="text-muted text-xs">{parseFloat(bal).toLocaleString()} tokens</p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
