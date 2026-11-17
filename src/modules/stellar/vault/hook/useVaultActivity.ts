import { useCallback, useEffect, useMemo, useRef } from 'react';

import type { NetworkType } from '@/modules/walletconnect/config/chains';

import type { SingleVaultConfig } from '../config/vault.config';
import { VaultService } from '../service/vaultService';
import { getVaultActivityKey, useVaultActivityStore } from '../store/vaultActivityStore';
import type { VaultActivityRecord } from '../types/vault.types';

export interface UseVaultActivityResult {
  activities: VaultActivityRecord[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  refreshHistory: () => Promise<void>;
  fetchMore: () => Promise<void>;
}

export function useVaultActivity(
  vault: SingleVaultConfig,
  userAddress: string,
  network: NetworkType = 'testnet'
): UseVaultActivityResult {
  const activitiesByVault = useVaultActivityStore(state => state.activitiesByVault);
  const cursorByVault = useVaultActivityStore(state => state.cursorByVault);
  const isDoneByVault = useVaultActivityStore(state => state.isDoneByVault);
  const isLoading = useVaultActivityStore(state => state.isLoading);
  const isLoadingMore = useVaultActivityStore(state => state.isLoadingMore);
  const hasFetchedOnce = useVaultActivityStore(state => state.hasFetchedOnce);

  const appendActivities = useVaultActivityStore(state => state.appendActivities);
  const setLoading = useVaultActivityStore(state => state.setLoading);
  const setLoadingMore = useVaultActivityStore(state => state.setLoadingMore);
  const markFetched = useVaultActivityStore(state => state.markFetched);
  const resetVault = useVaultActivityStore(state => state.resetVault);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const fetchingRef = useRef<boolean>(false);

  const vaultKey = useMemo(
    () =>
      userAddress && vault ? getVaultActivityKey(network, userAddress, vault.vaultAddress) : '',
    [network, userAddress, vault]
  );

  const activities = useMemo(() => {
    if (!vaultKey) return [];
    return activitiesByVault[vaultKey] || [];
  }, [activitiesByVault, vaultKey]);

  const hasMore = useMemo(() => {
    if (!vaultKey) return false;
    return !isDoneByVault[vaultKey];
  }, [isDoneByVault, vaultKey]);

  const fetchMore = useCallback(async () => {
    if (!userAddress || !vault || !vaultKey || fetchingRef.current || isDoneByVault[vaultKey])
      return;

    fetchingRef.current = true;
    setLoadingMore(true);

    try {
      const currentCursor = cursorByVault[vaultKey];
      const res = await VaultService.fetchVaultHistoryFromHorizon(
        userAddress,
        vault,
        network,
        currentCursor,
        25
      );
      appendActivities(vaultKey, res.records, res.nextCursor, res.isDone);
    } catch (e) {
      console.warn('[useVaultActivity] Fetch more failed:', e);
    } finally {
      fetchingRef.current = false;
      setLoadingMore(false);
    }
  }, [
    userAddress,
    vault,
    network,
    vaultKey,
    cursorByVault,
    isDoneByVault,
    appendActivities,
    setLoadingMore,
  ]);

  const refreshHistory = useCallback(async () => {
    if (!userAddress || !vault || !vaultKey) return;
    setLoading(true);
    resetVault(vaultKey);
    try {
      const res = await VaultService.fetchVaultHistoryFromHorizon(
        userAddress,
        vault,
        network,
        undefined,
        25
      );
      appendActivities(vaultKey, res.records, res.nextCursor, res.isDone);
      markFetched(vaultKey);
    } catch (e) {
      console.warn('[useVaultActivity] Refresh failed:', e);
    } finally {
      setLoading(false);
    }
  }, [
    userAddress,
    vault,
    network,
    vaultKey,
    resetVault,
    appendActivities,
    markFetched,
    setLoading,
  ]);

  // Initial fetch only once per user/vault connection - NO background interval polling!
  useEffect(() => {
    if (!vaultKey || hasFetchedOnce[vaultKey]) return;
    refreshHistory();
  }, [vaultKey, hasFetchedOnce, refreshHistory]);

  // Infinite scroll IntersectionObserver on sentinel
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || isLoading || isLoadingMore) return;

    const observer = new IntersectionObserver(
      entries => {
        const [entry] = entries;
        if (entry.isIntersecting && !fetchingRef.current && hasMore) {
          fetchMore();
        }
      },
      { rootMargin: '250px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoading, isLoadingMore, fetchMore]);

  return {
    activities,
    isLoading,
    isLoadingMore,
    hasMore,
    sentinelRef,
    refreshHistory,
    fetchMore,
  };
}
