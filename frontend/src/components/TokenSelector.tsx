"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { formatUnits } from "viem";

const BLOCKSCOUT_API = "https://megaeth.blockscout.com/api/v2";

interface ApiTokenBalance {
  token: {
    address_hash: string;
    name: string;
    symbol: string;
    decimals: string;
    type: string;
    icon_url: string | null;
  };
  value: string;
}

interface TokenItem {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  iconUrl: string | null;
  balance: string;
}

interface TokenSelectorProps {
  onSelect: (address: string, decimals: number, symbol: string) => void;
  selectedToken: string;
}

export function TokenSelector({ onSelect, selectedToken }: TokenSelectorProps) {
  const { address } = useAccount();
  const [tokens, setTokens] = useState<TokenItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    fetch(`${BLOCKSCOUT_API}/addresses/${address}/token-balances`)
      .then((res) => res.json())
      .then((data) => {
        const erc20s = (data || [])
          .filter(
            (t: ApiTokenBalance) =>
              t.token?.address_hash && t.token.type === "ERC-20" && BigInt(t.value) > 0n
          )
          .map((t: ApiTokenBalance): TokenItem => ({
            address: t.token.address_hash,
            name: t.token.name,
            symbol: t.token.symbol,
            decimals: parseInt(t.token.decimals),
            iconUrl: t.token.icon_url,
            balance: t.value,
          }));
        setTokens(erc20s);
      })
      .catch(() => setTokens([]))
      .finally(() => setLoading(false));
  }, [address]);

  const selected = selectedToken
    ? tokens.find((t) => t.address.toLowerCase() === selectedToken.toLowerCase())
    : undefined;

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
            {selected.iconUrl && (
              <img src={selected.iconUrl} alt="" className="w-5 h-5 rounded-full" />
            )}
            <span className="font-medium">{selected.symbol}</span>
            <span className="text-muted">
              — {formatUnits(BigInt(selected.balance), selected.decimals)} tokens
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
            const bal = formatUnits(BigInt(t.balance), t.decimals);
            const isSelected = selectedToken && t.address.toLowerCase() === selectedToken.toLowerCase();
            return (
              <button
                key={t.address}
                type="button"
                onClick={() => {
                  onSelect(t.address, t.decimals, t.symbol);
                  setOpen(false);
                }}
                className={`w-full px-3 py-2 text-sm text-left hover:bg-primary/10 flex items-center gap-2 ${
                  isSelected ? "bg-primary/5" : ""
                }`}
              >
                {t.iconUrl && (
                  <img src={t.iconUrl} alt="" className="w-5 h-5 rounded-full" />
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
          })}
        </div>
      )}
    </div>
  );
}
