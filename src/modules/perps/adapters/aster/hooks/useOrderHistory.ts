import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Signer } from 'ethers';

import { useHistoryStore } from '../../../core/stores/historyStore';
import { useMarketStore } from '../../../core/stores/marketStore';
import { getAllOrders } from '../api/orders';
import { type ScanProgress, getPersistedHistory, persistHistory } from '../historyScanner';
import type { AsterOrderResponse } from '../types/orders';
import type { IAsterSigner } from '../types/signer';

export type TimeRange = '1d' | '1w';

const PAGE_LIMIT = 100;

const getOrderTime = (o: AsterOrderResponse): number => {
  return o.updateTime || o.time || 0;
};

export const useOrderHistory = (
  signer: Signer | IAsterSigner | null,
  userAddr: string | null,
  symbol: string | null,
  timeRange: TimeRange = '1w'
) => {
  const orderHistory = useHistoryStore(state => state.orderHistory);
  const hasFetched = useHistoryStore(state => state.hasFetchedOrderHistory);
  const hasMore = useHistoryStore(state => state.hasMoreOrderHistory);
  const oldestOrderTime = useHistoryStore(state => state.oldestOrderTime);

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

    if (useHistoryStore.getState().hasFetchedOrderHistory) {
      setIsLoading(false);
      return;
    }

    const persisted = getPersistedHistory<AsterOrderResponse>(userAddr, 'orders');
    if (
      persisted?.data &&
      persisted.data.length > 0 &&
      useHistoryStore.getState().orderHistory.length === 0
    ) {
      useHistoryStore.getState().loadPersistedOrderHistory(persisted.data);
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
        const res = await getAllOrders(
          signer,
          userAddr,
          {
            symbol: targetSymbol,
            startTime: minTimestamp,
            endTime: Math.floor(Date.now()),
            limit: PAGE_LIMIT,
          },
          abortController.signal
        );

        if (!isMounted) return;

        const items = Array.isArray(res) ? res : [];
        const more = items.length >= PAGE_LIMIT;
        useHistoryStore.getState().setOrderHistory(items, more);
        persistHistory(userAddr, 'orders', items, Date.now());
      } catch (err) {
        if (!abortController.signal.aborted) {
          console.error('[Aster Order History] Failed to load order history:', err);
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

    const curEnd = (oldestOrderTime || Date.now()) - 1;
    const rangeMs = 7 * 24 * 60 * 60 * 1000;
    const minTimestamp = Date.now() - rangeMs;

    if (curEnd <= minTimestamp || curEnd <= 0) {
      useHistoryStore.getState().appendOrderHistory([], false);
      return;
    }

    isFetchingMoreRef.current = true;
    setIsLoadingMore(true);

    try {
      const targetSymbol = (symbol || useMarketStore.getState().selectedSymbol || 'BTCUSDT')
        .replace(/[^a-zA-Z0-9]/g, '')
        .toUpperCase();
      const res = await getAllOrders(signer, userAddr, {
        symbol: targetSymbol,
        startTime: minTimestamp,
        endTime: Math.floor(curEnd),
        limit: PAGE_LIMIT,
      });

      const nextBatch = Array.isArray(res) ? res : [];
      const more = nextBatch.length >= PAGE_LIMIT;
      useHistoryStore.getState().appendOrderHistory(nextBatch, more);
    } catch (err) {
      console.error('[Aster Order History] Failed to load more order history:', err);
    } finally {
      setIsLoadingMore(false);
      isFetchingMoreRef.current = false;
    }
  }, [signer, userAddr, isLoadingMore, hasMore, oldestOrderTime, symbol]);

  const filteredOrders = useMemo(() => {
    let list = orderHistory;
    if (symbol && symbol.trim()) {
      const cleanTarget = symbol.replace('-', '').toUpperCase();
      list = list.filter(o => (o.symbol || '').replace('-', '').toUpperCase() === cleanTarget);
    }
    if (timeRange === '1d') {
      const minTimestamp = Date.now() - 24 * 60 * 60 * 1000;
      list = list.filter(o => getOrderTime(o) >= minTimestamp);
    }
    return list;
  }, [orderHistory, symbol, timeRange]);

  return {
    orders: filteredOrders,
    isLoading,
    isLoadingMore,
    hasMore,
    loadMore,
    scanProgress,
    pausedNotice,
  };
};
