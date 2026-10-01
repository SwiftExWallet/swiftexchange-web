import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getStellarConfig } from '../../walletconnect/config/chains';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { getHistoryKey, useStellarHistoryStore } from '../store/stellarHistoryStore';
import type { UnifiedTransaction } from '../types/allTransaction.types';
import {
  type StellarHistoryTab,
  mapOperationToTransaction,
  matchesTab,
  normalizeTab,
} from '../utils/stellarHistoryFilter';

export interface UseStellarHistoryResult {
  items: UnifiedTransaction[];
  rawItems: any[];
  pool: any[];
  tab: StellarHistoryTab;
  setTab: (tab: StellarHistoryTab | string) => void;
  loading: boolean;
  done: boolean;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  refresh: () => Promise<void>;
}

export function useStellarHistory(
  account?: string,
  initialTab: StellarHistoryTab | string = 'all'
): UseStellarHistoryResult {
  const network = useWalletStore(state => state.network);
  const [tab, setTabInternal] = useState<StellarHistoryTab>(() => normalizeTab(initialTab));
  const tabRef = useRef<StellarHistoryTab>(tab);

  const [loading, setLoading] = useState<boolean>(false);
  const loadingRef = useRef<boolean>(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const historyByAccount = useStellarHistoryStore(state => state.historyByAccount);
  const appendRecords = useStellarHistoryStore(state => state.appendRecords);
  const prependFreshRecords = useStellarHistoryStore(state => state.prependFreshRecords);
  const resetAccount = useStellarHistoryStore(state => state.resetAccount);

  const accountKey = getHistoryKey(network, account || '');
  const accountState = historyByAccount[accountKey] || {
    pool: [],
    cursor: undefined,
    done: false,
    lastFetchedAt: 0,
  };

  const pool = accountState.pool;
  const done = accountState.done;

  const setTab = useCallback((newTab: StellarHistoryTab | string) => {
    const normalized = normalizeTab(newTab);
    tabRef.current = normalized;
    setTabInternal(normalized);
  }, []);

  // Derived view: filter shared pool by tab without triggering API calls
  const visibleOps = useMemo(() => {
    if (!account) return [];
    return pool.filter((op: any) => matchesTab(op, tab, account));
  }, [pool, tab, account]);

  // Derived view: map raw operations to UI transactions
  const items = useMemo(() => {
    if (!account) return [];
    return visibleOps
      .map((op: any) => mapOperationToTransaction(op, account))
      .filter((tx): tx is UnifiedTransaction => tx !== null);
  }, [visibleOps, account]);

  // Background fetch loop: fetch until minVisible items match the tab, or done, or 8 pages
  const fetchMore = useCallback(
    async (targetTab: StellarHistoryTab = tabRef.current, minVisible = 10) => {
      if (!account || loadingRef.current) return;

      const currentAccData = useStellarHistoryStore.getState().getAccountState(network, account);
      if (currentAccData.done) return;

      loadingRef.current = true;
      setLoading(true);

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const config = getStellarConfig(network);
      const horizonUrl = config?.horizonUrl || 'https://horizon.stellar.org';

      let currentCursor = currentAccData.cursor;
      let newMatchesCount = 0;
      let pagesFetched = 0;
      const MAX_PAGES = 8;
      const PAGE_LIMIT = 200;

      try {
        while (pagesFetched < MAX_PAGES && !abortController.signal.aborted) {
          pagesFetched++;

          const url = new URL(`${horizonUrl}/accounts/${account}/operations`);
          url.searchParams.set('join', 'transactions');
          url.searchParams.set('limit', String(PAGE_LIMIT));
          url.searchParams.set('order', 'desc');
          url.searchParams.set('include_failed', 'false');
          if (currentCursor) {
            url.searchParams.set('cursor', currentCursor);
          }

          // Retry with exponential backoff on HTTP 429
          let res: Response | null = null;
          let attempt = 0;

          while (attempt <= 3 && !abortController.signal.aborted) {
            try {
              res = await fetch(url.toString(), { signal: abortController.signal });
              if (res.status === 429) {
                if (attempt >= 3) break;
                const delay = Math.pow(2, attempt) * 1000;
                await new Promise(r => setTimeout(r, delay));
                attempt++;
                continue;
              }
              break;
            } catch (err: any) {
              if (err?.name === 'AbortError') return;
              if (attempt >= 3) throw err;
              const delay = Math.pow(2, attempt) * 1000;
              await new Promise(r => setTimeout(r, delay));
              attempt++;
            }
          }

          if (abortController.signal.aborted || !res) return;

          if (res.status === 404) {
            appendRecords(network, account, [], currentCursor, true);
            break;
          }

          if (!res.ok) {
            break;
          }

          const data = await res.json();
          const records: any[] = data._embedded?.records || [];
          const isPageDone = records.length < PAGE_LIMIT;
          const nextCursor =
            records.length > 0 ? records[records.length - 1].paging_token : currentCursor;
          currentCursor = nextCursor;

          // Append each page to the pool immediately so matching items appear on screen
          appendRecords(network, account, records, nextCursor, isPageDone);

          const matchesInPage = records.filter(op => matchesTab(op, targetTab, account)).length;
          newMatchesCount += matchesInPage;

          if (isPageDone) {
            break;
          }

          if (newMatchesCount >= minVisible) {
            break;
          }
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          console.error('Failed to fetch transaction operations:', err);
        }
      } finally {
        if (abortControllerRef.current === abortController) {
          loadingRef.current = false;
          setLoading(false);
        }
      }
    },
    [account, network, appendRecords]
  );

  // Stale-while-revalidate / initial prefetch on wallet load or account/network change
  useEffect(() => {
    if (!account) return;

    abortControllerRef.current?.abort();
    loadingRef.current = false;
    setLoading(false);

    const currentAccData = useStellarHistoryStore.getState().getAccountState(network, account);

    if (currentAccData.pool.length > 0) {
      // Revalidate newest page silently in background
      const config = getStellarConfig(network);
      const horizonUrl = config?.horizonUrl || 'https://horizon.stellar.org';
      const url = `${horizonUrl}/accounts/${account}/operations?join=transactions&limit=200&order=desc&include_failed=false`;

      fetch(url)
        .then(res => (res.ok ? res.json() : null))
        .then(data => {
          if (data?._embedded?.records) {
            prependFreshRecords(network, account, data._embedded.records);
          }
        })
        .catch(() => {});
    } else {
      // Initial prefetch 1-2 pages
      fetchMore(tabRef.current, 10);
    }

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [account, network, fetchMore, prependFreshRecords]);

  // When switching tabs, if current tab has no matching items yet and more history exists, fetch in background
  useEffect(() => {
    if (!account || done || loadingRef.current) return;
    if (visibleOps.length === 0) {
      fetchMore(tab);
    }
  }, [tab, visibleOps.length, done, account, fetchMore]);

  // Infinite scroll observer on sentinel div
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || done) return;

    const observer = new IntersectionObserver(
      entries => {
        const [entry] = entries;
        if (entry.isIntersecting && !loadingRef.current && !done) {
          fetchMore(tabRef.current);
        }
      },
      { rootMargin: '300px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [done, loading, fetchMore]);

  const refresh = useCallback(async () => {
    if (!account) return;
    abortControllerRef.current?.abort();
    resetAccount(network, account);
    await fetchMore(tabRef.current, 10);
  }, [account, network, resetAccount, fetchMore]);

  return {
    items,
    rawItems: visibleOps,
    pool,
    tab,
    setTab,
    loading,
    done,
    sentinelRef,
    refresh,
  };
}
