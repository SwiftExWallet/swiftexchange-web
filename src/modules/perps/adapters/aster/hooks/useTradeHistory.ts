import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Signer } from 'ethers';

import { useHistoryStore } from '../../../core/stores/historyStore';
import { useMarketStore } from '../../../core/stores/marketStore';
import { useOrderStore } from '../../../core/stores/orderStore';
import { usePositionStore } from '../../../core/stores/positionStore';
import { getUserTrades } from '../api/account';
import type { AsterUserTrade } from '../types/account';
import type { IAsterSigner } from '../types/signer';
import type { TimeRange } from './useOrderHistory';

const PAGE_LIMIT = 100;
const CACHE_TTL = 30000;

interface CacheEntry {
  data: AsterUserTrade[];
  timestamp: number;
  hasMore: boolean;
  oldestQueried: number;
}

const globalTradeCache: Record<string, CacheEntry> = {};

const sortDesc = (items: AsterUserTrade[]) => {
  return [...items].sort((a, b) => (b.time || 0) - (a.time || 0));
};

function getTargetSymbols(specificSymbol?: string | null): string[] {
  if (specificSymbol && specificSymbol.trim()) {
    return [specificSymbol.replace('-', '').toUpperCase()];
  }
  const symbolSet = new Set<string>();
  const cur = useMarketStore.getState().selectedSymbol;
  if (cur) symbolSet.add(cur.replace('-', '').toUpperCase());

  // Add all active markets
  const allMarkets = Object.keys(useMarketStore.getState().markets);
  allMarkets.forEach(m => {
    symbolSet.add(m.replace('-', '').toUpperCase());
  });

  // Open positions
  Object.keys(usePositionStore.getState().positions).forEach(s => {
    symbolSet.add(s.replace('-', '').toUpperCase());
  });

  // Open orders
  Object.values(useOrderStore.getState().orders).forEach(o => {
    if (o.symbol) symbolSet.add(o.symbol.replace('-', '').toUpperCase());
  });

  // Always include major traded pairs as baseline fallback
  ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT'].forEach(s => symbolSet.add(s));

  return Array.from(symbolSet);
}

const deduplicateTrades = (existing: AsterUserTrade[], incoming: AsterUserTrade[]) => {
  const seen = new Set<string>();
  const combined: AsterUserTrade[] = [];
  for (const item of [...incoming, ...existing]) {
    const id = String(item.id);
    if (!seen.has(id)) {
      seen.add(id);
      combined.push(item);
    }
  }
  return sortDesc(combined);
};

export const useTradeHistory = (
  signer: Signer | IAsterSigner | null,
  userAddr: string | null,
  symbol: string | null,
  timeRange: TimeRange = '1m'
) => {
  const marketCount = useMarketStore(state => Object.keys(state.markets).length);
  const cacheKey = userAddr ? `${userAddr}_${symbol || 'all'}_${timeRange}_trades` : '';
  const cachedEntry = cacheKey ? globalTradeCache[cacheKey] : undefined;

  const [trades, setTrades] = useState<AsterUserTrade[]>(() => cachedEntry?.data || []);
  const [isLoading, setIsLoading] = useState(() => !cachedEntry || cachedEntry.data.length === 0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(() => (cachedEntry ? cachedEntry.hasMore : true));

  const isFetchingMoreRef = useRef(false);
  const oldestQueriedRef = useRef<number>(cachedEntry?.oldestQueried || Date.now());

  useEffect(() => {
    if (!signer || !userAddr) {
      setTrades([]);
      setHasMore(false);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    const currentCached = globalTradeCache[cacheKey];

    // Only skip fetching if we have valid non-empty cached data within TTL
    if (
      currentCached &&
      currentCached.data.length > 0 &&
      Date.now() - currentCached.timestamp < CACHE_TTL
    ) {
      setTrades(currentCached.data);
      setHasMore(currentCached.hasMore);
      oldestQueriedRef.current = currentCached.oldestQueried;
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const fetchHistory = async () => {
      try {
        const now = Date.now();
        const targetSymbols = getTargetSymbols(symbol);

        // Fetch recent trades up to `now` without specifying a 30-day startTime to prevent Aster's 7-day interval error
        const requests = targetSymbols.map(sym =>
          getUserTrades(signer, userAddr, sym, {
            endTime: Math.floor(now),
            limit: PAGE_LIMIT,
          })
        );

        const results = await Promise.allSettled(requests);
        if (!isMounted) return;

        const collected: AsterUserTrade[] = [];
        for (const res of results) {
          if (res.status === 'fulfilled' && Array.isArray(res.value)) {
            collected.push(...res.value);
          }
        }

        const sorted = sortDesc(
          collected.filter((item, idx, arr) => {
            const id = String(item.id);
            return arr.findIndex(x => String(x.id) === id) === idx;
          })
        );

        const oldest = sorted.length > 0 ? sorted[sorted.length - 1].time || now : now;
        const more = sorted.length >= PAGE_LIMIT;

        setTrades(sorted);
        setHasMore(more);
        oldestQueriedRef.current = oldest;

        if (sorted.length > 0) {
          globalTradeCache[cacheKey] = {
            data: sorted,
            timestamp: Date.now(),
            hasMore: more,
            oldestQueried: oldest,
          };
        }
      } catch (err: any) {
        console.error('[Aster Trade History] Failed to load trade history:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchHistory();

    return () => {
      isMounted = false;
    };
  }, [signer, userAddr, symbol, timeRange, cacheKey, marketCount]);

  const loadMore = useCallback(async () => {
    if (!signer || !userAddr || isLoadingMore || !hasMore || isFetchingMoreRef.current) return;

    const curEnd = oldestQueriedRef.current - 1;
    if (curEnd <= 0) {
      setHasMore(false);
      if (globalTradeCache[cacheKey]) globalTradeCache[cacheKey].hasMore = false;
      return;
    }

    isFetchingMoreRef.current = true;
    setIsLoadingMore(true);

    try {
      const targetSymbols = getTargetSymbols(symbol);
      const requests = targetSymbols.map(sym =>
        getUserTrades(signer, userAddr, sym, {
          endTime: Math.floor(curEnd),
          limit: PAGE_LIMIT,
        })
      );
      const results = await Promise.allSettled(requests);

      const nextBatch: AsterUserTrade[] = [];
      for (const res of results) {
        if (res.status === 'fulfilled' && Array.isArray(res.value)) {
          nextBatch.push(...res.value);
        }
      }

      const sortedNext = sortDesc(nextBatch);
      const oldest =
        sortedNext.length > 0 ? sortedNext[sortedNext.length - 1].time || curEnd : curEnd;
      const more = sortedNext.length >= PAGE_LIMIT;

      oldestQueriedRef.current = oldest;

      setTrades(prev => {
        const combined = deduplicateTrades(prev, sortedNext);
        if (globalTradeCache[cacheKey]) {
          globalTradeCache[cacheKey] = {
            data: combined,
            timestamp: Date.now(),
            hasMore: more,
            oldestQueried: oldest,
          };
        }
        return combined;
      });
      setHasMore(more);
    } catch (err) {
      console.error('[Aster Trade History] Failed to load more trade history:', err);
    } finally {
      setIsLoadingMore(false);
      isFetchingMoreRef.current = false;
    }
  }, [signer, userAddr, symbol, timeRange, isLoadingMore, hasMore, cacheKey]);

  const recentTrades = useHistoryStore(state => state.recentTrades);

  const mergedTrades = useMemo(() => {
    const socketTrades = symbol ? recentTrades.filter(t => t.symbol === symbol) : recentTrades;
    const all = [...socketTrades, ...trades];
    const seen = new Set();
    return all
      .filter(t => {
        const key = `${t.id}_${t.time}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => (b.time || 0) - (a.time || 0));
  }, [symbol, recentTrades, trades]);

  return { trades: mergedTrades, isLoading, isLoadingMore, hasMore, loadMore };
};
