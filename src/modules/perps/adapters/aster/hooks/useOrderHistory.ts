import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Signer } from 'ethers';

import { useHistoryStore } from '../../../core/stores/historyStore';
import { getAllOrders } from '../api/orders';
import type { AsterOrderResponse } from '../types/orders';

export type TimeRange = '1d' | '1w' | '1m' | '3m';

const PAGE_LIMIT = 100;
const CACHE_TTL = 30000;
const SEVEN_DAYS_MS = 6.9 * 24 * 60 * 60 * 1000; // Safely under Aster's 7-day query interval limit
const BATCH_SPAN_MS = 30 * 24 * 60 * 60 * 1000; // 30 days per pagination batch
const TIME_RANGE_MS: Record<TimeRange, number> = {
  '1d': 24 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000,
  '1m': 30 * 24 * 60 * 60 * 1000,
  '3m': 90 * 24 * 60 * 60 * 1000,
};

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

function buildTimeChunks(startMs: number, endMs: number): { startTime: number; endTime: number }[] {
  const chunks: { startTime: number; endTime: number }[] = [];
  let curEnd = endMs;
  while (curEnd > startMs) {
    const curStart = Math.max(startMs, curEnd - SEVEN_DAYS_MS);
    chunks.push({ startTime: Math.floor(curStart), endTime: Math.floor(curEnd) });
    curEnd = curStart - 1;
  }
  return chunks;
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
  signer: Signer | null,
  userAddr: string | null,
  symbol: string | null,
  timeRange: TimeRange = '1m'
) => {
  const cacheKey = userAddr ? `${userAddr}_${symbol || 'all'}_${timeRange}_orders` : '';
  const cachedEntry = cacheKey ? globalOrderCache[cacheKey] : undefined;

  const [orders, setOrders] = useState<AsterOrderResponse[]>(() => cachedEntry?.data || []);
  const [isLoading, setIsLoading] = useState(() => !cachedEntry);
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

    if (currentCached && Date.now() - currentCached.timestamp < CACHE_TTL) {
      setOrders(currentCached.data);
      setHasMore(currentCached.hasMore);
      oldestQueriedRef.current = currentCached.oldestQueried;
      setIsLoading(false);
      return;
    }

    if (!currentCached) {
      setIsLoading(true);
    }

    const fetchHistory = async () => {
      try {
        const now = Date.now();
        const duration = TIME_RANGE_MS[timeRange] || TIME_RANGE_MS['1m'];
        const minStartTime = now - duration;

        // Fetch first batch (up to 30 days) in 7-day chunks to respect Aster's 7-day interval rule
        const initialBatchEnd = now;
        const initialBatchStart = Math.max(minStartTime, now - BATCH_SPAN_MS);
        const chunks = buildTimeChunks(initialBatchStart, initialBatchEnd);

        const results = await Promise.allSettled(
          chunks.map(chunk =>
            getAllOrders(signer, userAddr, {
              symbol: symbol || undefined,
              startTime: chunk.startTime,
              endTime: chunk.endTime,
              limit: PAGE_LIMIT,
            })
          )
        );

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

        oldestQueriedRef.current = initialBatchStart;
        const more = initialBatchStart > minStartTime;

        setOrders(sorted);
        setHasMore(more);
        globalOrderCache[cacheKey] = {
          data: sorted,
          timestamp: Date.now(),
          hasMore: more,
          oldestQueried: initialBatchStart,
        };
      } catch (err) {
        console.error('[Aster Order History] Failed to load order history:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchHistory();

    return () => {
      isMounted = false;
    };
  }, [signer, userAddr, symbol, timeRange, cacheKey]);

  const loadMore = useCallback(async () => {
    if (!signer || !userAddr || isLoadingMore || !hasMore || isFetchingMoreRef.current) return;

    const now = Date.now();
    const duration = TIME_RANGE_MS[timeRange] || TIME_RANGE_MS['1m'];
    const minStartTime = now - duration;

    const curEnd = oldestQueriedRef.current - 1;
    if (curEnd <= minStartTime) {
      setHasMore(false);
      if (globalOrderCache[cacheKey]) globalOrderCache[cacheKey].hasMore = false;
      return;
    }

    const curStart = Math.max(minStartTime, curEnd - BATCH_SPAN_MS);
    const chunks = buildTimeChunks(curStart, curEnd);
    if (chunks.length === 0) {
      setHasMore(false);
      return;
    }

    isFetchingMoreRef.current = true;
    setIsLoadingMore(true);

    try {
      const results = await Promise.allSettled(
        chunks.map(chunk =>
          getAllOrders(signer, userAddr, {
            symbol: symbol || undefined,
            startTime: chunk.startTime,
            endTime: chunk.endTime,
            limit: PAGE_LIMIT,
          })
        )
      );

      const nextBatch: AsterOrderResponse[] = [];
      for (const res of results) {
        if (res.status === 'fulfilled' && Array.isArray(res.value)) {
          nextBatch.push(...res.value);
        }
      }

      oldestQueriedRef.current = curStart;
      const more = curStart > minStartTime;

      setOrders(prev => {
        const combined = deduplicateOrders(prev, nextBatch);
        if (globalOrderCache[cacheKey]) {
          globalOrderCache[cacheKey] = {
            data: combined,
            timestamp: Date.now(),
            hasMore: more,
            oldestQueried: curStart,
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
