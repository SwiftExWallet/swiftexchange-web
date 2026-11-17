import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Signer } from 'ethers';

import { useHistoryStore } from '../../../core/stores/historyStore';
import { getIncomeHistory } from '../api/account';

export type TimeRange = '1d' | '1w';

const PAGE_LIMIT = 1000;

export const useTransactionHistory = (
  signer: Signer | null,
  userAddr: string | null,
  symbol?: string | null,
  timeRange: TimeRange = '1w'
) => {
  const transactionHistory = useHistoryStore(state => state.transactionHistory);
  const hasFetched = useHistoryStore(state => state.hasFetchedTransactionHistory);
  const hasMore = useHistoryStore(state => state.hasMoreTransactionHistory);
  const oldestIncomeTime = useHistoryStore(state => state.oldestIncomeTime);

  const [isLoading, setIsLoading] = useState(() => !hasFetched && !!userAddr && !!signer);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const isFetchingMoreRef = useRef(false);
  const lastUserRef = useRef<string | null>(userAddr);

  useEffect(() => {
    if (userAddr !== lastUserRef.current) {
      lastUserRef.current = userAddr;
      useHistoryStore.getState().clear();
    }
  }, [userAddr]);

  useEffect(() => {
    if (!signer || !userAddr) {
      setIsLoading(false);
      return;
    }

    if (useHistoryStore.getState().hasFetchedTransactionHistory) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    const fetchHistory = async () => {
      try {
        const now = Date.now();
        const rangeMs = 7 * 24 * 60 * 60 * 1000;
        const minTimestamp = now - rangeMs;

        const records = await getIncomeHistory(signer, userAddr, {
          startTime: minTimestamp,
          endTime: now,
          limit: PAGE_LIMIT,
        });

        if (!isMounted) return;

        const more = records.length >= PAGE_LIMIT;
        useHistoryStore.getState().setTransactionHistory(records, more);
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
  }, [signer, userAddr]);

  const loadMore = useCallback(async () => {
    if (!signer || !userAddr || isLoadingMore || !hasMore || isFetchingMoreRef.current) return;

    const now = Date.now();
    const rangeMs = 7 * 24 * 60 * 60 * 1000;
    const minTimestamp = now - rangeMs;
    const curEnd = (oldestIncomeTime || now) - 1;

    if (curEnd <= minTimestamp || curEnd <= 0) {
      useHistoryStore.getState().appendTransactionHistory([], false);
      return;
    }

    isFetchingMoreRef.current = true;
    setIsLoadingMore(true);

    try {
      const nextBatch = await getIncomeHistory(signer, userAddr, {
        startTime: minTimestamp,
        endTime: curEnd,
        limit: PAGE_LIMIT,
      });

      const more = nextBatch.length >= PAGE_LIMIT;
      useHistoryStore.getState().appendTransactionHistory(nextBatch, more);
    } catch (err) {
      console.error('[Aster Transaction History] Failed to load more transaction history:', err);
    } finally {
      setIsLoadingMore(false);
      isFetchingMoreRef.current = false;
    }
  }, [signer, userAddr, isLoadingMore, hasMore, oldestIncomeTime]);

  const filteredIncome = useMemo(() => {
    let list = transactionHistory;
    if (symbol && symbol.trim()) {
      const cleanTarget = symbol.replace('-', '').toUpperCase();
      list = list.filter(inc => (inc.symbol || '').replace('-', '').toUpperCase() === cleanTarget);
    }
    if (timeRange === '1d') {
      const minTimestamp = Date.now() - 24 * 60 * 60 * 1000;
      list = list.filter(inc => (inc.time || 0) >= minTimestamp);
    }
    return list;
  }, [transactionHistory, symbol, timeRange]);

  return { income: filteredIncome, isLoading, isLoadingMore, hasMore, loadMore };
};
