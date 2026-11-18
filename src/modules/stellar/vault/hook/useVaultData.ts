import { useCallback, useEffect, useState } from 'react';

import { useWalletConnect } from '@/modules/walletconnect/hooks/useWalletConnect';
import { useWalletStore } from '@/modules/walletconnect/store/walletConnectStore';

import type { SingleVaultConfig } from '../config/vault.config';
import { getVaultEnvironment } from '../config/vault.config';
import { VaultService } from '../service/vaultService';
import type { UserVaultPosition, VaultMetrics } from '../types/vault.types';

export const useVaultData = () => {
  const currentNetwork = useWalletStore(state => state.network);
  const { connectedWallets } = useWalletConnect();
  const stellarAddress = connectedWallets.stellar?.address || '';

  const env = getVaultEnvironment(currentNetwork);
  const [vaultConfigs, setVaultConfigs] = useState<SingleVaultConfig[]>(env.vaults);
  const [metrics, setMetrics] = useState<Record<string, VaultMetrics>>({});
  const [positions, setPositions] = useState<Record<string, UserVaultPosition>>({});
  const [walletBalances, setWalletBalances] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refreshData = useCallback(async () => {
    // Only trigger full loading state on initial fetch to avoid flickering UI during 20s polling
    setMetrics(prev => {
      if (Object.keys(prev).length === 0) {
        setIsLoading(true);
      }
      return prev;
    });
    setError(null);
    try {
      const activeEnv = getVaultEnvironment(currentNetwork);
      setVaultConfigs(activeEnv.vaults);

      const metricsMap: Record<string, VaultMetrics> = {};
      const positionsMap: Record<string, UserVaultPosition> = {};
      const balancesMap: Record<string, string> = {};

      await Promise.all(
        activeEnv.vaults.map(async vault => {
          try {
            const m = await VaultService.fetchVaultMetrics(vault, currentNetwork);
            metricsMap[vault.id] = m;
          } catch (e) {
            console.warn(`[useVaultData] Error fetching metrics for ${vault.id}:`, e);
          }

          if (stellarAddress) {
            try {
              const p = await VaultService.fetchUserPosition(vault, stellarAddress, currentNetwork);
              positionsMap[vault.id] = p;
            } catch (e) {
              console.warn(`[useVaultData] Error fetching position for ${vault.id}:`, e);
            }

            try {
              const b = await VaultService.fetchUserWalletBalance(
                vault.underlyingAsset.contractId,
                stellarAddress,
                currentNetwork
              );
              balancesMap[vault.id] = b.balanceFormatted;
            } catch (e) {
              console.warn(`[useVaultData] Error fetching balance for ${vault.id}:`, e);
            }
          }
        })
      );

      setMetrics(metricsMap);
      setPositions(positionsMap);
      setWalletBalances(balancesMap);
    } catch (err: any) {
      setError(err?.message || 'Failed to load vault data');
    } finally {
      setIsLoading(false);
    }
  }, [currentNetwork, stellarAddress]);

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 20000);
    return () => clearInterval(interval);
  }, [refreshData]);

  // Total deposited across all vaults by user
  const totalUserDepositedUsd = Object.values(positions).reduce((sum, p) => {
    const val = parseFloat(p.formatted?.underlying || '0');
    return sum + (isNaN(val) ? 0 : val);
  }, 0);

  // Total Value Locked across all vaults in active network
  const totalTvlUsd = Object.values(metrics).reduce((sum, m) => {
    const val = Number(m.totalAssets) / 1e7;
    return sum + (isNaN(val) ? 0 : val);
  }, 0);

  return {
    network: currentNetwork,
    stellarAddress,
    vaultConfigs,
    metrics,
    positions,
    walletBalances,
    totalUserDepositedUsd,
    totalTvlUsd,
    isLoading,
    error,
    refreshData,
  };
};
