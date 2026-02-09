"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { formatUnits } from "viem";

const BLOCKSCOUT_API = "https://megaeth.blockscout.com/api/v2";

interface TokenBalance {
  token: {
    address: string;
    name: string;
    symbol: string;
    decimals: string;
    type: string;
    icon_url: string | null;
  };
  value: string;
}

interface TokenSelectorProps {
  onSelect: (address: string, decimals: number, symbol: string) => void;
  selectedToken: string;
}

export function TokenSelector({ onSelect, selectedToken }: TokenSelectorProps) {
  const { address } = useAccount();
  const [tokens, setTokens] = useState<TokenBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    fetch(`${BLOCKSCOUT_API}/addresses/${address}/token-balances`)
      .then((res) => res.json())
      .then((data) => {
        const erc20s = (data || []).filter(
          (t: TokenBalance) => t.token.type === "ERC-20" && BigInt(t.value) > 0n
        );
        setTokens(erc20s);
      })
      .catch(() => setTokens([]))
      .finally(() => setLoading(false));
  }, [address]);

  const selected = tokens.find(
    (t) => t.token.address.toLowerCase() === selectedToken.toLowerCase()
  );

  if (loading) {
    return (
      <div className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm text-muted">
        Loading your tokens...
      </div>
    );
  }

  if (tokens.length === 0) {
    return (
      <div className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm text-muted">
        No ERC20 tokens found in your wallet
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm text-left focus:outline-none focus:border-primary flex items-center justify-between"
      >
        {selected ? (
          <span className="flex items-center gap-2">
            {selected.token.icon_url && (
              <img src={selected.token.icon_url} alt="" className="w-5 h-5 rounded-full" />
            )}
            <span className="font-medium">{selected.token.symbol}</span>
            <span className="text-muted">
              — {formatUnits(BigInt(selected.value), parseInt(selected.token.decimals))} tokens
            </span>
          </span>
        ) : (
          <span className="text-muted">Select a token from your wallet</span>
        )}
        <span className="text-muted">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-card border border-card-border rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {tokens.map((t) => {
            const bal = formatUnits(BigInt(t.value), parseInt(t.token.decimals));
            const isSelected = t.token.address.toLowerCase() === selectedToken.toLowerCase();
            return (
              <button
                key={t.token.address}
                type="button"
                onClick={() => {
                  onSelect(t.token.address, parseInt(t.token.decimals), t.token.symbol);
                  setOpen(false);
                }}
                className={`w-full px-3 py-2 text-sm text-left hover:bg-primary/10 flex items-center gap-2 ${
                  isSelected ? "bg-primary/5" : ""
                }`}
              >
                {t.token.icon_url && (
                  <img src={t.token.icon_url} alt="" className="w-5 h-5 rounded-full" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{t.token.symbol}</span>
                    <span className="text-muted text-xs truncate">{t.token.name}</span>
                  </div>
                  <p className="text-muted text-xs">{parseFloat(bal).toLocaleString()} tokens</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
