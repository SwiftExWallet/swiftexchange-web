import { useCallback, useEffect, useRef } from 'react';

import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { getAsterAssetIndex } from '../adapters/aster/api/account';
import { useExchangeManager } from '../core/ExchangeManager';
import { useAccountStore } from '../core/stores/accountStore';
import { usePositionStore } from '../core/stores/positionStore';
import { useAlertSettingsStore } from './alertSettingsStore';
import { alertsApi } from './api';
import { buildAlertSnapshotPayload, normalizeSymbol } from './snapshotBuilder';

const THROTTLE_INTERVAL_MS = 15_000;
const MAX_UNCHANGED_INTERVAL_MS = 5 * 60_000;

function computePositionsSignature(positions: Record<string, any>): string {
  const keys = Object.keys(positions).sort();
  return keys
    .map(k => {
      const p = positions[k];
      return `${normalizeSymbol(p.symbol)}:${p.size}:${p.marginType}`;
    })
    .join('|');
}

export function usePerpsAlertsSync() {
  const currentExchange = useExchangeManager(state => state.currentExchange);

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
  const balances = useAccountStore(state => state.balances);

  const getSettings = useAlertSettingsStore(state => state.getSettings);
  const cleanupClosedPositionMutedKeys = useAlertSettingsStore(
    state => state.cleanupClosedPositionMutedKeys
  );

  const lastSentTimeRef = useRef<number>(0);
  const lastSentSigRef = useRef<string>('');
  const lastTokenRef = useRef<string | null>(null);
  const isSyncingRef = useRef<boolean>(false);

  const syncSnapshot = useCallback(
    async (isImmediate = false) => {
      if (currentExchange !== 'aster') return;
      if (!wallet || !fcmToken) return;

      const settings = getSettings(wallet);
      if (!settings.enabled) return;

      const now = Date.now();
      const currentSig = computePositionsSignature(positions);
      const isSigChanged = currentSig !== lastSentSigRef.current;

      if (
        !isImmediate &&
        !isSigChanged &&
        now - lastSentTimeRef.current < MAX_UNCHANGED_INTERVAL_MS
      ) {
        return;
      }

      if (!isImmediate && now - lastSentTimeRef.current < THROTTLE_INTERVAL_MS) {
        return;
      }

      if (isSyncingRef.current) return;
      isSyncingRef.current = true;

      try {
        let assetIndexes: any[] = [];
        if (multiAssetsMargin) {
          assetIndexes = await getAsterAssetIndex().catch(() => []);
        }

        const positionRisksList = Object.values(positions).map(p => ({
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

        const accountAssetsList = Object.values(balances).map(b => ({
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
          accountInfo: {
            assets: accountAssetsList,
            positions: positionRisksList,
          } as any,
          positionRisks: positionRisksList,
          isMultiAsset: multiAssetsMargin,
          assetIndexes,
          savedMutedKeys: settings.mutedKeys,
        });

        const res = await alertsApi.postSnapshot(payload);
        if (res && res.ok) {
          lastSentTimeRef.current = now;
          lastSentSigRef.current = currentSig;

          const activeIsoKeys = payload.account.positions
            .filter(p => p.marginType === 'isolated')
            .map(p => `iso:${p.symbol}:${parseFloat(p.positionAmt) > 0 ? 'LONG' : 'SHORT'}`);
          cleanupClosedPositionMutedKeys(wallet, activeIsoKeys);
        }
      } catch (err) {
        console.warn('[alertsSync] Error syncing snapshot:', err);
      } finally {
        isSyncingRef.current = false;
      }
    },
    [
      currentExchange,
      wallet,
      fcmToken,
      positions,
      multiAssetsMargin,
      balances,
      getSettings,
      cleanupClosedPositionMutedKeys,
    ]
  );

  useEffect(() => {
    if (fcmToken && lastTokenRef.current && lastTokenRef.current !== fcmToken) {
      alertsApi.deleteDevice({ fcmToken: lastTokenRef.current }).catch(() => {});
    }
    lastTokenRef.current = fcmToken;
  }, [fcmToken]);

  useEffect(() => {
    if (wallet && fcmToken) {
      const settings = getSettings(wallet);
      if (!settings.enabled) {
        alertsApi.deleteDevice({ fcmToken }).catch(() => {});
      }
    }
  }, [wallet, fcmToken, getSettings]);

  useEffect(() => {
    if (!wallet || !fcmToken) return;
    const isSigChanged = computePositionsSignature(positions) !== lastSentSigRef.current;
    syncSnapshot(isSigChanged);
  }, [positions, syncSnapshot, wallet, fcmToken]);

  useEffect(() => {
    if (!wallet || !fcmToken) return;
    syncSnapshot(true);
  }, [multiAssetsMargin, syncSnapshot, wallet, fcmToken]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        syncSnapshot(false);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [syncSnapshot]);

  return {
    isSwiftExConnected: Boolean(fcmToken),
    syncSnapshot,
  };
}
