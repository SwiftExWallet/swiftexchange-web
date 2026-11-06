import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Signer } from 'ethers';

import { useHistoryStore } from '../../../core/stores/historyStore';
import { useMarketStore } from '../../../core/stores/marketStore';
import { useOrderStore } from '../../../core/stores/orderStore';
import { usePositionStore } from '../../../core/stores/positionStore';
import { getAllOrders } from '../api/orders';
import type { AsterOrderResponse } from '../types/orders';
import type { IAsterSigner } from '../types/signer';

export type TimeRange = '1d' | '1w' | '1m' | '3m';

const PAGE_LIMIT = 100;
const CACHE_TTL = 30000;

interface CacheEntry {
  data: AsterOrderResponse[];
  timestamp: number;
  hasMore: boolean;
  oldestQueried: number;
}

const globalOrderCache: Record<string, CacheEntry> = {};

const getOrderTime = (o: AsterOrderResponse) => {
  return o.updateTime || o.time || 0;
};

const sortDesc = (items: AsterOrderResponse[]) => {
  return [...items].sort((a, b) => getOrderTime(b) - getOrderTime(a));
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

const deduplicateOrders = (existing: AsterOrderResponse[], incoming: AsterOrderResponse[]) => {
  const seen = new Set<string>();
  const combined: AsterOrderResponse[] = [];
  for (const item of [...incoming, ...existing]) {
    const id = String(item.orderId || item.clientOrderId);
    if (!seen.has(id)) {
      seen.add(id);
      combined.push(item);
    }
  }
  return sortDesc(combined);
};

export const useOrderHistory = (
  signer: Signer | IAsterSigner | null,
  userAddr: string | null,
  symbol: string | null,
  timeRange: TimeRange = '1m'
) => {
  const marketCount = useMarketStore(state => Object.keys(state.markets).length);
  const cacheKey = userAddr ? `${userAddr}_${symbol || 'all'}_${timeRange}_orders` : '';
  const cachedEntry = cacheKey ? globalOrderCache[cacheKey] : undefined;

  const [orders, setOrders] = useState<AsterOrderResponse[]>(() => cachedEntry?.data || []);
  const [isLoading, setIsLoading] = useState(() => !cachedEntry || cachedEntry.data.length === 0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(() => (cachedEntry ? cachedEntry.hasMore : true));

  const isFetchingMoreRef = useRef(false);
  const oldestQueriedRef = useRef<number>(cachedEntry?.oldestQueried || Date.now());

  useEffect(() => {
    if (!signer || !userAddr) {
      setOrders([]);
      setHasMore(false);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    const currentCached = globalOrderCache[cacheKey];

    // Only skip fetching if we have valid non-empty cached data within TTL
    if (
      currentCached &&
      currentCached.data.length > 0 &&
      Date.now() - currentCached.timestamp < CACHE_TTL
    ) {
      setOrders(currentCached.data);
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

        // Fetch recent orders up to `now` without specifying a 30-day startTime to prevent Aster's 7-day interval error
        const requests = targetSymbols.map(sym =>
          getAllOrders(signer, userAddr, {
            symbol: sym,
            endTime: Math.floor(now),
            limit: PAGE_LIMIT,
          })
        );

        const results = await Promise.allSettled(requests);
        if (!isMounted) return;

        const collected: AsterOrderResponse[] = [];
        for (const res of results) {
          if (res.status === 'fulfilled' && Array.isArray(res.value)) {
            collected.push(...res.value);
          }
        }

        const sorted = sortDesc(
          collected.filter((item, idx, arr) => {
            const id = String(item.orderId || item.clientOrderId);
            return arr.findIndex(x => String(x.orderId || x.clientOrderId) === id) === idx;
          })
        );

        const oldest = sorted.length > 0 ? getOrderTime(sorted[sorted.length - 1]) : now;
        const more = sorted.length >= PAGE_LIMIT;

        setOrders(sorted);
        setHasMore(more);
        oldestQueriedRef.current = oldest;

        if (sorted.length > 0) {
          globalOrderCache[cacheKey] = {
            data: sorted,
            timestamp: Date.now(),
            hasMore: more,
            oldestQueried: oldest,
          };
        }
      } catch (err: any) {
        console.error('[Aster Order History] Failed to load order history:', err);
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
      if (globalOrderCache[cacheKey]) globalOrderCache[cacheKey].hasMore = false;
      return;
    }

    isFetchingMoreRef.current = true;
    setIsLoadingMore(true);

    try {
      const targetSymbols = getTargetSymbols(symbol);
      const requests = targetSymbols.map(sym =>
        getAllOrders(signer, userAddr, {
          symbol: sym,
          endTime: Math.floor(curEnd),
          limit: PAGE_LIMIT,
        })
      );
      const results = await Promise.allSettled(requests);

      const nextBatch: AsterOrderResponse[] = [];
      for (const res of results) {
        if (res.status === 'fulfilled' && Array.isArray(res.value)) {
          nextBatch.push(...res.value);
        }
      }

      const sortedNext = sortDesc(nextBatch);
      const oldest =
        sortedNext.length > 0 ? getOrderTime(sortedNext[sortedNext.length - 1]) : curEnd;
      const more = sortedNext.length >= PAGE_LIMIT;

      oldestQueriedRef.current = oldest;

      setOrders(prev => {
        const combined = deduplicateOrders(prev, sortedNext);
        if (globalOrderCache[cacheKey]) {
          globalOrderCache[cacheKey] = {
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
      console.error('[Aster Order History] Failed to load more order history:', err);
    } finally {
      setIsLoadingMore(false);
      isFetchingMoreRef.current = false;
    }
  }, [signer, userAddr, symbol, timeRange, isLoadingMore, hasMore, cacheKey]);

  const recentOrders = useHistoryStore(state => state.recentOrders);

  const mergedOrders = useMemo(() => {
    const socketOrders = symbol ? recentOrders.filter(o => o.symbol === symbol) : recentOrders;
    const all = [...socketOrders, ...orders];
    const seen = new Set();
    return all
      .filter(o => {
        const key = String(o.orderId || o.clientOrderId);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => getOrderTime(b) - getOrderTime(a));
  }, [symbol, recentOrders, orders]);

  return { orders: mergedOrders, isLoading, isLoadingMore, hasMore, loadMore };
};
