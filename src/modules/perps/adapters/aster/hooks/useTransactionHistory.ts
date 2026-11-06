import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Signer } from 'ethers';

import { useHistoryStore } from '../../../core/stores/historyStore';
import { getIncomeHistory } from '../api/account';
import type { IncomeRecord } from '../types/account';
import type { IAsterSigner } from '../types/signer';

export type TimeRange = '1d' | '1w' | '1m' | '3m';

const PAGE_LIMIT = 100;
const CACHE_TTL = 30000; // 30 seconds

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
  signer: Signer | IAsterSigner | null,
  userAddr: string | null,
  symbol?: string | null,
  timeRange: TimeRange = '1m'
) => {
  const cacheKey = userAddr ? `${userAddr}_${symbol || 'all'}_${timeRange}_income` : '';
  const cachedEntry = cacheKey ? globalIncomeCache[cacheKey] : undefined;

  const [income, setIncome] = useState<IncomeRecord[]>(() => cachedEntry?.data || []);
  const [isLoading, setIsLoading] = useState(() => !cachedEntry || cachedEntry.data.length === 0);
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

    // Only skip fetching if we have valid non-empty cached data within TTL
    if (
      currentCached &&
      currentCached.data.length > 0 &&
      Date.now() - currentCached.timestamp < CACHE_TTL
    ) {
      setIncome(currentCached.data);
      setHasMore(currentCached.hasMore);
      oldestQueriedRef.current = currentCached.oldestQueried;
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const fetchHistory = async () => {
      try {
        const now = Date.now();

        // Fetch recent income up to `now` without specifying a 30-day startTime
        const records = await getIncomeHistory(signer, userAddr, {
          symbol: symbol || undefined,
          endTime: now,
          limit: PAGE_LIMIT,
        });

        if (!isMounted) return;

        const sorted = sortDesc(
          records.filter((item, idx, arr) => {
            const key = getRecordKey(item);
            return arr.findIndex(x => getRecordKey(x) === key) === idx;
          })
        );

        const oldest = sorted.length > 0 ? sorted[sorted.length - 1].time || now : now;
        const more = sorted.length >= PAGE_LIMIT;

        setIncome(sorted);
        setHasMore(more);
        oldestQueriedRef.current = oldest;

        if (sorted.length > 0) {
          globalIncomeCache[cacheKey] = {
            data: sorted,
            timestamp: Date.now(),
            hasMore: more,
            oldestQueried: oldest,
          };
        }
      } catch (err: any) {
        console.error('[Aster Transaction History] Failed to load transaction history:', err);
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

    const curEnd = oldestQueriedRef.current - 1;
    if (curEnd <= 0) {
      setHasMore(false);
      if (globalIncomeCache[cacheKey]) globalIncomeCache[cacheKey].hasMore = false;
      return;
    }

    isFetchingMoreRef.current = true;
    setIsLoadingMore(true);

    try {
      const nextBatch = await getIncomeHistory(signer, userAddr, {
        symbol: symbol || undefined,
        endTime: curEnd,
        limit: PAGE_LIMIT,
      });

      const sortedNext = sortDesc(nextBatch);
      const oldest =
        sortedNext.length > 0 ? sortedNext[sortedNext.length - 1].time || curEnd : curEnd;
      const more = sortedNext.length >= PAGE_LIMIT;

      oldestQueriedRef.current = oldest;

      setIncome(prev => {
        const combined = deduplicateIncome(prev, sortedNext);
        if (globalIncomeCache[cacheKey]) {
          globalIncomeCache[cacheKey] = {
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
      console.error('[Aster Transaction History] Failed to load more transaction history:', err);
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
