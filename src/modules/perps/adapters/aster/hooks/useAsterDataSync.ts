import { useEffect, useState } from 'react';

import BigNumber from 'bignumber.js';
import type { Signer } from 'ethers';

import { useExchangeManager } from '../../../core/ExchangeManager';
import { useAccountStore } from '../../../core/stores/accountStore';
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
import { getOpenOrders } from '../api/orders';
import { useUserDataStream } from './useUserDataStream';

export function useAsterDataSync(signer: Signer | null, userAddr: string | null) {
  const currentExchange = useExchangeManager(s => s.currentExchange);
  const [isRestSynced, setIsRestSynced] = useState(false);
  const { connected } = useUserDataStream(signer, userAddr);

  useEffect(() => {
    if (currentExchange !== 'aster') {
      setIsRestSynced(false);
      return;
    }

    if (!signer || !userAddr) {
      setIsRestSynced(false);
      useAccountStore.getState().setBalances([]);
      usePositionStore.getState().setPositions([]);
      useOrderStore.getState().setOrders([]);
      return;
    }

    let isMounted = true;

    async function fetchSnapshot() {
      useAccountStore.getState().setIsLoading(true);
      try {
        const [
          accountInfo,
          positionRisk,
          openOrdersResponse,
          _leverageBracketResponse,
          multiAssetResponse,
        ] = await Promise.all([
          getAccountInfo(signer!, userAddr!),
          getPositionRisk(signer!, userAddr!),
          getOpenOrders(signer!, userAddr!),
          getLeverageBracket(signer!, userAddr!),
          getMultiAssetsMargin(signer!, userAddr!),
        ]);

        if (!isMounted) return;

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
            } else if (a.asset === 'ASTER') {
              usdVal = walletBal.times('0.7483');
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
            const symbol = p.symbol.replace('USDT', '-USDT');
            return {
              symbol,
              size: p.positionAmt,
              entryPrice: p.entryPrice,
              markPrice: p.markPrice,
              liquidationPrice: p.liquidationPrice,
              unrealizedPnl: p.unRealizedProfit,
              leverage: new BigNumber(p.leverage || '0').toNumber(),
              marginType:
                p.marginType?.toLowerCase() === 'isolated'
                  ? ('isolated' as const)
                  : ('cross' as const),
              isolatedMargin: p.isolatedMargin || '0',
            };
          })
          .filter(p => !new BigNumber(p.size || '0').isZero());

        if (Array.isArray(positionRisk)) {
          positionRisk.forEach(p => {
            const sym = p.symbol.replace('USDT', '-USDT');
            const lev = Number(p.leverage);
            const mt =
              p.marginType?.toLowerCase() === 'isolated'
                ? ('isolated' as const)
                : ('cross' as const);
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
          const symbol = o.symbol.replace('USDT', '-USDT');
          return {
            id: String(o.orderId),
            symbol,
            type: (o.type || 'LIMIT').toLowerCase() as any,
            side: (o.side || 'BUY').toLowerCase() as any,
            price: o.price,
            size: o.origQty,
            filledSize: o.executedQty,
            status: (o.status || 'NEW').toLowerCase() as any,
            reduceOnly: o.reduceOnly || false,
            timestamp: o.updateTime || Date.now(),
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
              bracketsMap[lb.symbol] = lb.brackets.map((rb: any) => ({
                bracket: rb.bracket,
                initialLeverage: rb.initialLeverage,
                notionalCap: rb.notionalCap,
                notionalFloor: rb.notionalFloor,
                maintMarginRatio: rb.maintMarginRatio,
                cum: rb.cum,
              }));
            }
          });
          useLeverageStore.getState().setAllBrackets(bracketsMap);
        }

        usePositionStore.getState().setPositions(mappedPositions);
        useOrderStore.getState().setOrders(mappedOrders);

        setIsRestSynced(true);
      } catch (err) {
        console.error('[aster] Failed to fetch REST snapshot:', err);
      } finally {
        if (isMounted) {
          useAccountStore.getState().setIsLoading(false);
        }
      }
    }

    fetchSnapshot();

    return () => {
      isMounted = false;
    };
  }, [signer, userAddr, currentExchange]);

  return { isRestSynced, connected };
}
