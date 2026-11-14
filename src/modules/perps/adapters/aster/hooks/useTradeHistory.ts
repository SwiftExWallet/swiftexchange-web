import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Signer } from 'ethers';

import { useHistoryStore } from '../../../core/stores/historyStore';
import { useMarketStore } from '../../../core/stores/marketStore';
import { getUserTrades } from '../api/account';
import { type ScanProgress, getPersistedHistory, persistHistory } from '../historyScanner';
import type { AsterUserTrade } from '../types/account';
import type { TimeRange } from './useOrderHistory';

const PAGE_LIMIT = 100;

export const useTradeHistory = (
  signer: Signer | null,
  userAddr: string | null,
  symbol: string | null,
  timeRange: TimeRange = '1w'
) => {
  const tradeHistory = useHistoryStore(state => state.tradeHistory);
  const hasFetched = useHistoryStore(state => state.hasFetchedTradeHistory);
  const hasMore = useHistoryStore(state => state.hasMoreTradeHistory);
  const oldestTradeTime = useHistoryStore(state => state.oldestTradeTime);

  const [isLoading, setIsLoading] = useState(() => !hasFetched && !!userAddr && !!signer);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
  const [pausedNotice, setPausedNotice] = useState<string | null>(null);

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
      setScanProgress(null);
      setPausedNotice(null);
      return;
    }

    if (useHistoryStore.getState().hasFetchedTradeHistory) {
      setIsLoading(false);
      return;
    }

    const persisted = getPersistedHistory<AsterUserTrade>(userAddr, 'trades');
    if (
      persisted?.data &&
      persisted.data.length > 0 &&
      useHistoryStore.getState().tradeHistory.length === 0
    ) {
      useHistoryStore.getState().loadPersistedTradeHistory(persisted.data);
    }

    let isMounted = true;
    setIsLoading(true);
    const abortController = new AbortController();

    const rangeMs = 7 * 24 * 60 * 60 * 1000;
    const minTimestamp = Date.now() - rangeMs;
    const targetSymbol = (symbol || useMarketStore.getState().selectedSymbol || 'BTCUSDT')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase();

    const fetchHistory = async () => {
      try {
        const res = await getUserTrades(
          signer,
          userAddr,
          targetSymbol,
          {
            startTime: minTimestamp,
            endTime: Math.floor(Date.now()),
            limit: PAGE_LIMIT,
          },
          abortController.signal
        );

        if (!isMounted) return;

        const items = Array.isArray(res) ? res : [];
        const more = items.length >= PAGE_LIMIT;
        useHistoryStore.getState().setTradeHistory(items, more);
        persistHistory(userAddr, 'trades', items, Date.now());
      } catch (err) {
        if (!abortController.signal.aborted) {
          console.error('[Aster Trade History] Failed to load trade history:', err);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
          setScanProgress(null);
          setPausedNotice(null);
        }
      }
    };

    fetchHistory();

    return () => {
      isMounted = false;
      abortController.abort();
    };
  }, [signer, userAddr, symbol]);

  const loadMore = useCallback(async () => {
    if (!signer || !userAddr || isLoadingMore || !hasMore || isFetchingMoreRef.current) return;

    const curEnd = (oldestTradeTime || Date.now()) - 1;
    const rangeMs = 7 * 24 * 60 * 60 * 1000;
    const minTimestamp = Date.now() - rangeMs;

    if (curEnd <= minTimestamp || curEnd <= 0) {
      useHistoryStore.getState().appendTradeHistory([], false);
      return;
    }

    isFetchingMoreRef.current = true;
    setIsLoadingMore(true);

    try {
      const targetSymbol = (symbol || useMarketStore.getState().selectedSymbol || 'BTCUSDT')
        .replace(/[^a-zA-Z0-9]/g, '')
        .toUpperCase();
      const res = await getUserTrades(signer, userAddr, targetSymbol, {
        startTime: minTimestamp,
        endTime: Math.floor(curEnd),
        limit: PAGE_LIMIT,
      });

      const nextBatch = Array.isArray(res) ? res : [];
      const more = nextBatch.length >= PAGE_LIMIT;
      useHistoryStore.getState().appendTradeHistory(nextBatch, more);
    } catch (err) {
      console.error('[Aster Trade History] Failed to load more trade history:', err);
    } finally {
      setIsLoadingMore(false);
      isFetchingMoreRef.current = false;
    }
  }, [signer, userAddr, isLoadingMore, hasMore, oldestTradeTime, symbol]);

  const filteredTrades = useMemo(() => {
    let list = tradeHistory;
    if (symbol && symbol.trim()) {
      const cleanTarget = symbol.replace('-', '').toUpperCase();
      list = list.filter(t => (t.symbol || '').replace('-', '').toUpperCase() === cleanTarget);
    }
    if (timeRange === '1d') {
      const minTimestamp = Date.now() - 24 * 60 * 60 * 1000;
      list = list.filter(t => (t.time || 0) >= minTimestamp);
    }
    return list;
  }, [tradeHistory, symbol, timeRange]);

  return {
    trades: filteredTrades,
    isLoading,
    isLoadingMore,
    hasMore,
    loadMore,
    scanProgress,
    pausedNotice,
  };
};
