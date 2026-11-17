import { useEffect, useRef, useState } from 'react';

import BigNumber from 'bignumber.js';
import type { Signer } from 'ethers';

import { useExchangeManager } from '../../../core/ExchangeManager';
import { useAccountStore } from '../../../core/stores/accountStore';
import {
  startDepositPolling,
  useDepositTrackerStore,
} from '../../../core/stores/depositTrackerStore';
import { useLeverageStore } from '../../../core/stores/leverageStore';
import { useMarketStore } from '../../../core/stores/marketStore';
import { useOrderEntryStore } from '../../../core/stores/orderEntryStore';
import { useOrderStore } from '../../../core/stores/orderStore';
import { usePositionStore } from '../../../core/stores/positionStore';
import { useTickerStore } from '../../../core/stores/tickerStore';
import {
  getAccountInfo,
  getLeverageBracket,
  getMultiAssetsMargin,
  getPositionRisk,
} from '../api/account';
import { isAsterDepositRequiredError, isAsterNoAgentError } from '../api/errors';
import { getOpenOrders } from '../api/orders';
import { useUserDataStream } from './useUserDataStream';

let activeSnapshotPromise: Promise<any> | null = null;
let lastSnapshotKey: string | null = null;

export async function fetchAsterSnapshot(signer: Signer, userAddr: string, force = false) {
  const currentNetwork = useExchangeManager.getState().currentNetwork;
  const snapshotKey = `${userAddr}_${currentNetwork}`;

  if (!force && activeSnapshotPromise && lastSnapshotKey === snapshotKey) {
    return activeSnapshotPromise;
  }

  useAccountStore.getState().setIsLoading(true);

  activeSnapshotPromise = (async () => {
    try {
      let accountInfo: any;
      try {
        accountInfo = await getAccountInfo(signer, userAddr);
      } catch (err: any) {
        if (isAsterDepositRequiredError(err) || isAsterNoAgentError(err)) {
          useAccountStore.getState().setBalances([]);
          usePositionStore.getState().setPositions([]);
          useOrderStore.getState().setOrders([]);
          return {
            mappedPositions: [],
            mappedBalances: [],
            mappedOrders: [],
            requiresDeposit: true,
          };
        }
        throw err;
      }

      const hasBrackets = Object.keys(useLeverageStore.getState().bracketsBySymbol).length > 0;
      const [positionRiskRes, openOrdersRes, leverageBracketRes, multiAssetRes] =
        await Promise.allSettled([
          getPositionRisk(signer, userAddr),
          getOpenOrders(signer, userAddr),
          hasBrackets ? Promise.resolve([]) : getLeverageBracket(signer, userAddr),
          getMultiAssetsMargin(signer, userAddr),
        ]);

      const positionRisk = positionRiskRes.status === 'fulfilled' ? positionRiskRes.value : [];
      const openOrdersResponse = openOrdersRes.status === 'fulfilled' ? openOrdersRes.value : [];
      const _leverageBracketResponse =
        leverageBracketRes.status === 'fulfilled' ? leverageBracketRes.value : [];
      const multiAssetResponse = multiAssetRes.status === 'fulfilled' ? multiAssetRes.value : null;

      const tickerCtxs = useTickerStore.getState().assetCtxByMarket;
      const mappedBalances = (accountInfo.assets || []).map((a: any) => {
        const walletBal = new BigNumber(a.walletBalance || '0');
        const availBal = new BigNumber(a.availableBalance || a.crossWalletBalance || '0');

        let usdVal = walletBal;
        if (a.asset === 'USDT' || a.asset === 'USDC' || a.asset === 'USD') {
          usdVal = walletBal;
        } else {
          const markPx =
            tickerCtxs[`${a.asset}-USDT`]?.markPx ||
            tickerCtxs[`${a.asset}USDT`]?.markPx ||
            tickerCtxs[`${a.asset}-USDC`]?.markPx ||
            tickerCtxs[`${a.asset}USDC`]?.markPx;
          if (markPx && parseFloat(markPx) > 0) {
            usdVal = walletBal.times(markPx);
          } else {
            usdVal = walletBal;
          }
        }

        return {
          asset: a.asset,
          total: a.walletBalance,
          available: a.availableBalance || a.crossWalletBalance || '0',
          locked: walletBal.minus(availBal).toString(),
          marginBalance: a.marginBalance || a.crossWalletBalance || a.walletBalance || '0',
          unrealizedPnl: a.unrealizedProfit || '0',
          usdValue: usdVal.toFixed(2),
          discountRate: a.asset === 'ASTER' ? '5%' : undefined,
        };
      });

      const mappedPositions = (positionRisk || [])
        .map(p => {
          const symbol = p.symbol.replace(/(USDT|USDC)$/, '-$1');
          const lev =
            Number(p.leverage) ||
            useOrderEntryStore.getState().leverageBySymbol[symbol] ||
            useOrderEntryStore.getState().leverageBySymbol[p.symbol] ||
            useOrderEntryStore.getState().leverage ||
            0;
          return {
            symbol,
            size: p.positionAmt,
            entryPrice: p.entryPrice,
            markPrice: p.markPrice,
            liquidationPrice: p.liquidationPrice,
            unrealizedPnl: p.unRealizedProfit,
            leverage: lev,
            marginType:
              p.marginType?.toLowerCase() === 'isolated'
                ? ('isolated' as const)
                : ('cross' as const),
            isolatedMargin: p.isolatedMargin || '0',
            initialMargin: (p as any).initialMargin || (p as any).positionInitialMargin || '0',
          };
        })
        .filter(p => !new BigNumber(p.size || '0').isZero());

      if (Array.isArray(positionRisk)) {
        positionRisk.forEach(p => {
          const sym = p.symbol.replace(/(USDT|USDC)$/, '-$1');
          const lev = Number(p.leverage);
          const mt =
            p.marginType?.toLowerCase() === 'isolated' ? ('isolated' as const) : ('cross' as const);
          if (lev && lev > 0) {
            useOrderEntryStore.getState().setSymbolSettings(sym, lev, mt);
          }
        });
        const curSym = useMarketStore.getState().selectedSymbol;
        if (curSym) {
          useOrderEntryStore.getState().syncForSymbol(curSym);
        }
      }

      const mappedOrders = (openOrdersResponse || []).map(o => {
        const symbol = o.symbol.replace(/(USDT|USDC)$/, '-$1');
        const lev =
          useOrderEntryStore.getState().leverageBySymbol[symbol] ||
          useOrderEntryStore.getState().leverageBySymbol[o.symbol] ||
          useOrderEntryStore.getState().leverage ||
          20;
        const mt =
          useOrderEntryStore.getState().marginTypeBySymbol[symbol] ||
          useOrderEntryStore.getState().marginTypeBySymbol[o.symbol] ||
          useOrderEntryStore.getState().marginType ||
          'cross';

        return {
          id: String(o.orderId),
          symbol,
          type: (o.type || 'LIMIT').toLowerCase() as any,
          rawType: o.type,
          origType: o.origType,
          side: (o.side || 'BUY').toLowerCase() as any,
          price: o.price,
          size: o.origQty,
          filledSize: o.executedQty,
          cumQuote: o.cumQuote,
          avgPrice: o.avgPrice,
          status: (o.status || 'NEW').toLowerCase() as any,
          reduceOnly: o.reduceOnly || false,
          timestamp: o.time || o.updateTime || Date.now(),
          stopPrice: o.stopPrice,
          workingType: o.workingType,
          callbackRate: (o as any).callbackRate,
          activationPrice: (o as any).activationPrice,
          leverage: lev,
          marginType: mt,
          hash: o.newChainData?.hash,
          timeInForce: o.timeInForce,
        };
      });

      useAccountStore.getState().setBalances(mappedBalances, {
        totalWalletBalance: accountInfo.totalWalletBalance,
        totalMarginBalance: accountInfo.totalMarginBalance,
        availableBalance: accountInfo.availableBalance,
        totalUnrealizedProfit: accountInfo.totalUnrealizedProfit,
      });

      if (multiAssetResponse && typeof multiAssetResponse.multiAssetsMargin !== 'undefined') {
        useAccountStore.getState().setMultiAssetsMargin(multiAssetResponse.multiAssetsMargin);
      }

      if (Array.isArray(_leverageBracketResponse) && _leverageBracketResponse.length > 0) {
        const bracketsMap: Record<string, any[]> = {};
        _leverageBracketResponse.forEach((lb: any) => {
          if (lb.symbol && Array.isArray(lb.brackets)) {
            const mapped = lb.brackets.map((rb: any) => ({
              bracket: rb.bracket,
              initialLeverage: rb.initialLeverage,
              notionalCap: rb.notionalCap,
              notionalFloor: rb.notionalFloor,
              maintMarginRatio: rb.maintMarginRatio,
              cum: rb.cum,
            }));
            bracketsMap[lb.symbol] = mapped;
            const hyphenated = lb.symbol.replace(/(USDT|USDC)$/, '-$1');
            bracketsMap[hyphenated] = mapped;
          }
        });
        useLeverageStore.getState().setAllBrackets(bracketsMap);
      }

      usePositionStore.getState().setPositions(mappedPositions);
      useOrderStore.getState().setOrders(mappedOrders);

      return { mappedPositions, mappedBalances, mappedOrders };
    } catch (err: any) {
      if (isAsterDepositRequiredError(err) || isAsterNoAgentError(err)) {
        useAccountStore.getState().setBalances([]);
        usePositionStore.getState().setPositions([]);
        useOrderStore.getState().setOrders([]);
        return {
          mappedPositions: [],
          mappedBalances: [],
          mappedOrders: [],
          requiresDeposit: true,
        };
      }
      console.error('[aster] Failed to fetch REST snapshot:', err);
      throw err;
    } finally {
      useAccountStore.getState().setIsLoading(false);
      activeSnapshotPromise = null;
    }
  })();

  lastSnapshotKey = snapshotKey;
  return activeSnapshotPromise;
}

export function useAsterDataSync(signer: Signer | null, userAddr: string | null) {
  const currentExchange = useExchangeManager(s => s.currentExchange);
  const currentNetwork = useExchangeManager(s => s.currentNetwork);
  const [isRestSynced, setIsRestSynced] = useState(false);
  const { connected } = useUserDataStream(signer, userAddr);

  const initializedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (currentExchange !== 'aster') {
      setIsRestSynced(false);
      initializedKeyRef.current = null;
      return;
    }

    if (!userAddr) {
      setIsRestSynced(false);
      initializedKeyRef.current = null;
      useAccountStore.getState().setBalances([]);
      usePositionStore.getState().setPositions([]);
      useOrderStore.getState().setOrders([]);
      return;
    }

    if (!signer) {
      setIsRestSynced(false);
      useAccountStore.getState().setIsLoading(false);
      return;
    }

    const sessionKey = `${userAddr}_${currentNetwork}`;
    if (initializedKeyRef.current === sessionKey) {
      return;
    }

    initializedKeyRef.current = sessionKey;
    let isMounted = true;

    if (useDepositTrackerStore.getState().hasActiveTransactions()) {
      startDepositPolling(signer, userAddr);
    }

    const initSnapshot = async () => {
      try {
        const result = await fetchAsterSnapshot(signer, userAddr);
        if (isMounted && !result?.requiresDeposit) {
          setIsRestSynced(true);
        }
      } catch (err: any) {
        if (!isAsterDepositRequiredError(err) && !isAsterNoAgentError(err)) {
          initializedKeyRef.current = null;
        }
      }
    };

    initSnapshot();

    return () => {
      isMounted = false;
    };
  }, [signer, userAddr, currentExchange, currentNetwork]);

  return { isRestSynced, connected };
}
