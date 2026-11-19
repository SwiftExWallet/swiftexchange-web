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
    return Boolean(
      hasFetchedOnce[vaultKey] &&
      !isDoneByVault[vaultKey] &&
      (activitiesByVault[vaultKey] || []).length > 0
    );
  }, [hasFetchedOnce, isDoneByVault, vaultKey, activitiesByVault]);

  const fetchMore = useCallback(async () => {
    if (
      !userAddress ||
      !vault ||
      !vaultKey ||
      fetchingRef.current ||
      isLoadingMore ||
      isDoneByVault[vaultKey]
    )
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
      const isActuallyDone = res.isDone || !res.nextCursor || res.nextCursor === currentCursor;
      appendActivities(vaultKey, res.records, res.nextCursor, isActuallyDone);
    } catch (e) {
      console.warn('[useVaultActivity] Fetch more failed:', e);
      appendActivities(vaultKey, [], undefined, true);
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
    isLoadingMore,
    appendActivities,
    setLoadingMore,
  ]);

  const refreshHistory = useCallback(async () => {
    if (!userAddress || !vault || !vaultKey || fetchingRef.current) return;
    fetchingRef.current = true;
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
      const isActuallyDone = res.isDone || !res.nextCursor;
      appendActivities(vaultKey, res.records, res.nextCursor, isActuallyDone);
      markFetched(vaultKey);
    } catch (e) {
      console.warn('[useVaultActivity] Refresh failed:', e);
      markFetched(vaultKey);
    } finally {
      fetchingRef.current = false;
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

  // Initial fetch strictly once per user/vault connection - NO background interval polling!
  useEffect(() => {
    if (!vaultKey || hasFetchedOnce[vaultKey] || fetchingRef.current) return;
    refreshHistory();
  }, [vaultKey, hasFetchedOnce, refreshHistory]);

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
