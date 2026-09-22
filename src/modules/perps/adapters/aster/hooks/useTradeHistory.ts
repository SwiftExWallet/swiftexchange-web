import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Signer } from 'ethers';

import { useHistoryStore } from '../../../core/stores/historyStore';
import { getUserTrades } from '../api/account';
import type { AsterUserTrade } from '../types/account';

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
  data: AsterUserTrade[];
  timestamp: number;
  hasMore: boolean;
  oldestQueried: number;
}

const globalTradeCache: Record<string, CacheEntry> = {};

const sortDesc = (items: AsterUserTrade[]) => {
  return [...items].sort((a, b) => (b.time || 0) - (a.time || 0));
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
  signer: Signer | null,
  userAddr: string | null,
  symbol: string | null,
  timeRange: TimeRange = '1m'
) => {
  const cacheKey = userAddr ? `${userAddr}_${symbol || 'all'}_${timeRange}_trades` : '';
  const cachedEntry = cacheKey ? globalTradeCache[cacheKey] : undefined;

  const [trades, setTrades] = useState<AsterUserTrade[]>(() => cachedEntry?.data || []);
  const [isLoading, setIsLoading] = useState(() => !cachedEntry);
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

    if (currentCached && Date.now() - currentCached.timestamp < CACHE_TTL) {
      setTrades(currentCached.data);
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

        const initialBatchEnd = now;
        const initialBatchStart = Math.max(minStartTime, now - BATCH_SPAN_MS);
        const chunks = buildTimeChunks(initialBatchStart, initialBatchEnd);

        const results = await Promise.allSettled(
          chunks.map(chunk =>
            getUserTrades(signer, userAddr, symbol || undefined, {
              startTime: chunk.startTime,
              endTime: chunk.endTime,
              limit: PAGE_LIMIT,
            })
          )
        );

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

        oldestQueriedRef.current = initialBatchStart;
        const more = initialBatchStart > minStartTime;

        setTrades(sorted);
        setHasMore(more);
        globalTradeCache[cacheKey] = {
          data: sorted,
          timestamp: Date.now(),
          hasMore: more,
          oldestQueried: initialBatchStart,
        };
      } catch (err) {
        console.error('[Aster Trade History] Failed to load trade history:', err);
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
      if (globalTradeCache[cacheKey]) globalTradeCache[cacheKey].hasMore = false;
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
          getUserTrades(signer, userAddr, symbol || undefined, {
            startTime: chunk.startTime,
            endTime: chunk.endTime,
            limit: PAGE_LIMIT,
          })
        )
      );

      const nextBatch: AsterUserTrade[] = [];
      for (const res of results) {
        if (res.status === 'fulfilled' && Array.isArray(res.value)) {
          nextBatch.push(...res.value);
        }
      }

      oldestQueriedRef.current = curStart;
      const more = curStart > minStartTime;

      setTrades(prev => {
        const combined = deduplicateTrades(prev, nextBatch);
        if (globalTradeCache[cacheKey]) {
          globalTradeCache[cacheKey] = {
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
      console.error('Failed to load more trade history:', err);
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
