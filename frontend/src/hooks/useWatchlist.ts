"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "megascan_watchlist";

export interface WatchlistItem {
  address: string;
  name: string;
  symbol: string;
}

export function useWatchlist() {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setWatchlist(JSON.parse(stored));
    } catch { /* ignore corrupt data */ }
  }, []);

  const addToken = useCallback((item: WatchlistItem) => {
    setWatchlist((prev) => {
      if (prev.some((t) => t.address.toLowerCase() === item.address.toLowerCase())) return prev;
      const next = [...prev, item];
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* full */ }
      return next;
    });
  }, []);

  const removeToken = useCallback((address: string) => {
    setWatchlist((prev) => {
      const next = prev.filter((t) => t.address.toLowerCase() !== address.toLowerCase());
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* full */ }
      return next;
    });
  }, []);

  const isWatched = useCallback(
    (address: string) => watchlist.some((t) => t.address.toLowerCase() === address.toLowerCase()),
    [watchlist]
  );

  return { watchlist, addToken, removeToken, isWatched };
}
