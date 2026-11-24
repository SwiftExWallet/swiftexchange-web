import { useCallback, useEffect, useRef } from 'react';

import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { getAsterAssetIndex } from '../adapters/aster/api/account';
import { useExchangeManager } from '../core/ExchangeManager';
import { useAccountStore } from '../core/stores/accountStore';
import { usePositionStore } from '../core/stores/positionStore';
import { useAlertSettingsStore } from './alertSettingsStore';
import { alertsApi } from './api';
import { buildAlertSnapshotPayload, normalizeSymbol } from './snapshotBuilder';

const MIN_GAP_MS = 2_000;

function computePositionsSignature(positions: Record<string, any>): string {
  if (!positions || typeof positions !== 'object') return '';
  return Object.keys(positions)
    .sort()
    .map(k => {
      const p = positions[k];
      const sizeNum = parseFloat(String(p?.size || '0'));
      if (Math.abs(sizeNum) === 0) return '';
      return `${normalizeSymbol(p.symbol)}:${sizeNum}:${p.marginType || 'cross'}`;
    })
    .filter(Boolean)
    .join('|');
}

export function usePerpsAlertsSync() {
  const currentExchange = useExchangeManager(state => state.currentExchange);
  const network = useWalletStore(state => state.network);

  const session = useWalletStore(state => state.session);
  const evmAddress = useWalletStore(state => state.connectedWallets.evm?.address);

  const rawWallet = evmAddress || session?.namespaces?.eip155?.accounts?.[0]?.split(':')?.[2] || '';
  const wallet = rawWallet.toLowerCase();

  const userDevice = session?.peer?.metadata?.userDevice as Record<string, any> | undefined;
  const fcmToken =
    typeof userDevice?.fcmToken === 'string' && userDevice.fcmToken.trim().length >= 20
      ? userDevice.fcmToken.trim()
      : null;

  const positions = usePositionStore(state => state.positions);
  const multiAssetsMargin = useAccountStore(state => state.multiAssetsMargin);

  const lastSentTimeRef = useRef<number>(0);
  const lastSentSigRef = useRef<string>('');
  const lastTokenRef = useRef<string | null>(null);
  const isSyncingRef = useRef<boolean>(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncSnapshot = useCallback(
    async (isImmediate = false) => {
      // Do not sync liquidation alert snapshots on testnet
      const currentNetwork = useWalletStore.getState().network;
      if (currentNetwork === 'testnet') return;

      const activeExchange = useExchangeManager.getState().currentExchange;
      if (activeExchange !== 'aster') return;
      if (!wallet || !fcmToken) return;

      const settings = useAlertSettingsStore.getState().getSettings(wallet);
      if (!settings.enabled) return;

      const now = Date.now();
      const currentPositions = usePositionStore.getState().positions;
      const currentSig = computePositionsSignature(currentPositions);
      const isSigChanged = currentSig !== lastSentSigRef.current;

      // Rate limit check: don't call faster than MIN_GAP_MS
      if (now - lastSentTimeRef.current < MIN_GAP_MS) return;

      // For automatic calls, only send if the position signature has actually changed
      if (!isImmediate && !isSigChanged) return;

      if (isSyncingRef.current) return;
      isSyncingRef.current = true;

      try {
        const isMulti = useAccountStore.getState().multiAssetsMargin;
        const currentBalances = useAccountStore.getState().balances;

        let assetIndexes: any[] = [];
        if (isMulti) {
          assetIndexes = await getAsterAssetIndex().catch(() => []);
        }

        const positionRisksList = Object.values(currentPositions).map(p => ({
          symbol: p.symbol,
          positionAmt: String(p.size || '0'),
          entryPrice: String(p.entryPrice || '0'),
          markPrice: String(p.markPrice || '0'),
          unRealizedProfit: String(p.unrealizedPnl || '0'),
          liquidationPrice: String(p.liquidationPrice || '0'),
          leverage: String(p.leverage || '1'),
          maxNotionalValue: '0',
          marginType: p.marginType || 'cross',
          isolatedMargin: String(p.isolatedMargin || '0'),
          isAutoAddMargin: 'false',
          positionSide: parseFloat(String(p.size || '0')) >= 0 ? 'LONG' : 'SHORT',
          notional: String(
            Math.abs(parseFloat(String(p.size || '0')) * parseFloat(String(p.markPrice || '0')))
          ),
          isolatedWallet: String(p.isolatedMargin || '0'),
          updateTime: now,
        }));

        const accountAssetsList = Object.values(currentBalances).map(b => ({
          asset: b.asset,
          walletBalance: b.total || '0',
          unrealizedProfit: b.unrealizedPnl || '0',
          marginBalance: b.marginBalance || '0',
          maintMargin: '0',
          initialMargin: '0',
          positionInitialMargin: '0',
          openOrderInitialMargin: '0',
          crossWalletBalance: b.available || b.marginBalance || b.total || '0',
          crossUnPnl: '0',
          availableBalance: b.available || '0',
          maxWithdrawAmount: b.available || '0',
        }));

        const payload = buildAlertSnapshotPayload({
          fcmToken,
          wallet,
          accountInfo: { assets: accountAssetsList, positions: positionRisksList } as any,
          positionRisks: positionRisksList,
          isMultiAsset: isMulti,
          assetIndexes,
          savedMutedKeys: settings.mutedKeys,
        });

        const res = await alertsApi.postSnapshot(payload);
        if (res && res.ok) {
          lastSentTimeRef.current = Date.now();
          lastSentSigRef.current = currentSig;

          const activeIsoKeys = payload.account.positions
            .filter(p => p.marginType === 'isolated')
            .map(p => `iso:${p.symbol}:${parseFloat(p.positionAmt) > 0 ? 'LONG' : 'SHORT'}`);
          useAlertSettingsStore.getState().cleanupClosedPositionMutedKeys(wallet, activeIsoKeys);
        }
      } catch (err) {
        console.warn('[alertsSync] Error syncing snapshot:', err);
      } finally {
        isSyncingRef.current = false;
      }
    },
    [wallet, fcmToken]
  );

  const syncSnapshotRef = useRef(syncSnapshot);
  syncSnapshotRef.current = syncSnapshot;

  // Cleanup old FCM token if device changes
  useEffect(() => {
    if (fcmToken && lastTokenRef.current && lastTokenRef.current !== fcmToken) {
      alertsApi.deleteDevice({ fcmToken: lastTokenRef.current }).catch(() => {});
    }
    lastTokenRef.current = fcmToken;
  }, [fcmToken]);

  // Clean device if user disables master switch
  useEffect(() => {
    if (wallet && fcmToken) {
      const settings = useAlertSettingsStore.getState().getSettings(wallet);
      if (!settings.enabled) {
        alertsApi.deleteDevice({ fcmToken }).catch(() => {});
      }
    }
  }, [wallet, fcmToken]);

  // Compute positions signature directly from positions in render
  const positionsSig = computePositionsSignature(positions);

  // Trigger sync ONLY when positions signature changes (open / close / resize)
  useEffect(() => {
    if (network === 'testnet' || currentExchange !== 'aster' || !wallet || !fcmToken) return;

    if (positionsSig === lastSentSigRef.current) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      syncSnapshotRef.current(false);
    }, 600);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [network, positionsSig, currentExchange, wallet, fcmToken]);

  // Sync when multiAssetsMargin mode changes
  const prevMultiAssetRef = useRef(multiAssetsMargin);
  useEffect(() => {
    if (network === 'testnet' || currentExchange !== 'aster' || !wallet || !fcmToken) return;

    if (prevMultiAssetRef.current !== multiAssetsMargin) {
      prevMultiAssetRef.current = multiAssetsMargin;
      syncSnapshotRef.current(false);
    }
  }, [network, multiAssetsMargin, currentExchange, wallet, fcmToken]);

  return {
    isSwiftExConnected: Boolean(fcmToken),
    syncSnapshot,
  };
}
