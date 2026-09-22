import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Signer } from 'ethers';

import { useHistoryStore } from '../../../core/stores/historyStore';
import { getIncomeHistory } from '../api/account';
import type { IncomeRecord } from '../types/account';

export type TimeRange = '1d' | '1w' | '1m' | '3m';

const PAGE_LIMIT = 100;
const CACHE_TTL = 30000; // 30 seconds
const SEVEN_DAYS_MS = 6.9 * 24 * 60 * 60 * 1000; // Safely under Aster's 7-day query interval limit
const BATCH_SPAN_MS = 30 * 24 * 60 * 60 * 1000; // 30 days per pagination batch
const TIME_RANGE_MS: Record<TimeRange, number> = {
  '1d': 24 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000,
  '1m': 30 * 24 * 60 * 60 * 1000,
  '3m': 90 * 24 * 60 * 60 * 1000,
};

interface CacheEntry {
  data: IncomeRecord[];
  timestamp: number;
  hasMore: boolean;
  oldestQueried: number;
}

const globalIncomeCache: Record<string, CacheEntry> = {};

const sortDesc = (items: IncomeRecord[]) => {
  return [...items].sort((a, b) => (b.time || 0) - (a.time || 0));
};

const getRecordKey = (item: IncomeRecord) => {
  return `${item.tranId || ''}_${item.time || ''}_${item.incomeType || ''}_${item.symbol || ''}`;
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

const deduplicateIncome = (existing: IncomeRecord[], incoming: IncomeRecord[]) => {
  const seen = new Set<string>();
  const combined: IncomeRecord[] = [];
  for (const item of [...incoming, ...existing]) {
    const key = getRecordKey(item);
    if (!seen.has(key)) {
      seen.add(key);
      combined.push(item);
    }
  }
  return sortDesc(combined);
};

export const useTransactionHistory = (
  signer: Signer | null,
  userAddr: string | null,
  symbol?: string | null,
  timeRange: TimeRange = '1m'
) => {
  const cacheKey = userAddr ? `${userAddr}_${symbol || 'all'}_${timeRange}_income` : '';
  const cachedEntry = cacheKey ? globalIncomeCache[cacheKey] : undefined;

  const [income, setIncome] = useState<IncomeRecord[]>(() => cachedEntry?.data || []);
  const [isLoading, setIsLoading] = useState(() => !cachedEntry);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(() => (cachedEntry ? cachedEntry.hasMore : true));

  const isFetchingMoreRef = useRef(false);
  const oldestQueriedRef = useRef<number>(cachedEntry?.oldestQueried || Date.now());

  useEffect(() => {
    if (!signer || !userAddr) {
      setIncome([]);
      setHasMore(false);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    const currentCached = globalIncomeCache[cacheKey];

    if (currentCached && Date.now() - currentCached.timestamp < CACHE_TTL) {
      setIncome(currentCached.data);
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
            getIncomeHistory(signer, userAddr, {
              symbol: symbol || undefined,
              startTime: chunk.startTime,
              endTime: chunk.endTime,
              limit: PAGE_LIMIT,
            })
          )
        );

        if (!isMounted) return;

        const collected: IncomeRecord[] = [];
        for (const res of results) {
          if (res.status === 'fulfilled' && Array.isArray(res.value)) {
            collected.push(...res.value);
          }
        }

        const sorted = sortDesc(
          collected.filter((item, idx, arr) => {
            const key = getRecordKey(item);
            return arr.findIndex(x => getRecordKey(x) === key) === idx;
          })
        );

        oldestQueriedRef.current = initialBatchStart;
        const more = initialBatchStart > minStartTime;

        setIncome(sorted);
        setHasMore(more);
        globalIncomeCache[cacheKey] = {
          data: sorted,
          timestamp: Date.now(),
          hasMore: more,
          oldestQueried: initialBatchStart,
        };
      } catch (err) {
        console.error('Failed to load transaction history:', err);
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
      if (globalIncomeCache[cacheKey]) globalIncomeCache[cacheKey].hasMore = false;
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
          getIncomeHistory(signer, userAddr, {
            symbol: symbol || undefined,
            startTime: chunk.startTime,
            endTime: chunk.endTime,
            limit: PAGE_LIMIT,
          })
        )
      );

      const nextBatch: IncomeRecord[] = [];
      for (const res of results) {
        if (res.status === 'fulfilled' && Array.isArray(res.value)) {
          nextBatch.push(...res.value);
        }
      }

      oldestQueriedRef.current = curStart;
      const more = curStart > minStartTime;

      setIncome(prev => {
        const combined = deduplicateIncome(prev, nextBatch);
        if (globalIncomeCache[cacheKey]) {
          globalIncomeCache[cacheKey] = {
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
      console.error('Failed to load more transaction history:', err);
    } finally {
      setIsLoadingMore(false);
      isFetchingMoreRef.current = false;
    }
  }, [signer, userAddr, symbol, timeRange, isLoadingMore, hasMore, cacheKey]);

  const recentIncome = useHistoryStore(state => state.recentIncome);

  const mergedIncome = useMemo(() => {
    if (recentIncome.length === 0) return income;
    const all = [...recentIncome, ...income];
    const seen = new Set();
    return all
      .filter(item => {
        const key = getRecordKey(item);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => (b.time || 0) - (a.time || 0));
  }, [income, recentIncome]);

  return { income: mergedIncome, isLoading, isLoadingMore, hasMore, loadMore };
};
