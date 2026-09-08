import { useEffect, useRef } from 'react';

import { HttpTransport, WebSocketTransport } from '@nktkas/hyperliquid';
import { clearinghouseState as getClearinghouseState } from '@nktkas/hyperliquid/api/info';
import { clearinghouseState, openOrders, userFills } from '@nktkas/hyperliquid/api/subscription';

import { useExchangeManager } from '../../../core/ExchangeManager';
import { useAccountStore } from '../../../core/stores/accountStore';
import { useHistoryStore } from '../../../core/stores/historyStore';
import { useMarketStore } from '../../../core/stores/marketStore';
import { useOrderEntryStore } from '../../../core/stores/orderEntryStore';
import { useOrderStore } from '../../../core/stores/orderStore';
import { usePositionStore } from '../../../core/stores/positionStore';

export const useHyperliquidDataStream = (userAddr: string | null) => {
  const currentExchange = useExchangeManager(s => s.currentExchange);
  const currentNetwork = useExchangeManager(s => s.currentNetwork);
  const transportRef = useRef<WebSocketTransport | null>(null);

  useEffect(() => {
    if (currentExchange !== 'hyperliquid' || !userAddr) {
      if (transportRef.current) {
        transportRef.current.close();
        transportRef.current = null;
      }
      useAccountStore.getState().setIsLoading(false);
      return;
    }

    let isMounted = true;
    const isTestnet = currentNetwork === 'testnet';
    const transport = new WebSocketTransport({ isTestnet });
    transportRef.current = transport;

    const setup = async () => {
      useAccountStore.getState().setIsLoading(true);
      try {
        const formattedUser = (
          userAddr.toLowerCase().startsWith('0x') ? userAddr : `0x${userAddr}`
        ) as `0x${string}`;

        const processClearinghouseState = (ch: any) => {
          if (!isMounted || !ch) return;
          const marginSummary = ch.marginSummary || ch.crossMarginSummary;
          if (marginSummary) {
            const accountValue = String(marginSummary.accountValue || '0');
            const totalMarginUsed = String(marginSummary.totalMarginUsed || '0');
            const withdrawable = String(
              marginSummary.withdrawable ||
                Math.max(0, parseFloat(accountValue) - parseFloat(totalMarginUsed)).toFixed(2)
            );

            useAccountStore.getState().setBalances([
              {
                asset: 'USDC',
                total: accountValue,
                available: withdrawable,
                locked: totalMarginUsed,
                marginBalance: accountValue,
              },
              {
                asset: 'USD',
                total: accountValue,
                available: withdrawable,
                locked: totalMarginUsed,
                marginBalance: accountValue,
              },
            ]);
          }

          const positions = ch.assetPositions
            ?.map((p: any) => {
              const rawPos = p.position;
              if (!rawPos) return null;
              const rawCoin = rawPos.coin || '';
              const symbol = rawCoin.includes('-') ? rawCoin : `${rawCoin}-USDC`;
              const levValue = rawPos.leverage?.value ? Number(rawPos.leverage.value) : 1;
              const marginType =
                rawPos.leverage?.type === 'isolated' ? ('isolated' as const) : ('cross' as const);

              return {
                symbol,
                size: rawPos.szi || '0',
                entryPrice: rawPos.entryPx || '0',
                markPrice: rawPos.entryPx || '0',
                liquidationPrice: rawPos.liquidationPx || '0',
                unrealizedPnl: rawPos.unrealizedPnl || '0',
                leverage: levValue,
                marginType,
                isolatedMargin: rawPos.marginUsed || '0',
              };
            })
            .filter(Boolean);

          if (positions) {
            usePositionStore.getState().setPositions(positions as any);
            positions.forEach((pos: any) => {
              if (pos?.symbol && pos?.leverage) {
                useOrderEntryStore
                  .getState()
                  .setSymbolSettings(pos.symbol, pos.leverage, pos.marginType);
              }
            });
            const curSym = useMarketStore.getState().selectedSymbol;
            if (curSym) {
              useOrderEntryStore.getState().syncForSymbol(curSym);
            }
          }
        };

        // 0. Immediate REST snapshot to eliminate WebSocket delay
        try {
          const httpTransport = new HttpTransport({ isTestnet });
          const snapshot = await getClearinghouseState(
            { transport: httpTransport },
            { user: formattedUser }
          );
          processClearinghouseState(snapshot);
        } catch (restErr) {
          console.warn('[hyperliquid rest snapshot] Failed to fetch initial state:', restErr);
        } finally {
          if (isMounted) {
            useAccountStore.getState().setIsLoading(false);
          }
        }

        // 1. Subscribe to clearinghouseState (margin & positions)
        await clearinghouseState({ transport }, { user: formattedUser }, (event: any) => {
          if (!isMounted || !event) return;
          processClearinghouseState(event.clearinghouseState);
        });

        // 2. Subscribe to openOrders
        await openOrders({ transport }, { user: formattedUser }, (event: any) => {
          if (!isMounted || !event) return;
          const orderList = event.orders || [];
          const orders = orderList.map((o: any) => {
            const rawCoin = o.coin || '';
            const symbol = rawCoin.includes('-') ? rawCoin : `${rawCoin}-USDC`;
            return {
              id: String(o.oid),
              symbol,
              type: 'limit' as const,
              side: o.side === 'A' ? ('sell' as const) : ('buy' as const),
              price: o.limitPx || '0',
              size: o.sz || '0',
              filledSize: '0',
              status: 'new' as const,
              reduceOnly: Boolean(o.reduceOnly),
              timestamp: o.timestamp || Date.now(),
            };
          });

          useOrderStore.getState().setOrders(orders);
        });

        // 3. Subscribe to userFills
        await userFills({ transport }, { user: formattedUser }, (event: any) => {
          if (!isMounted || !event) return;
          const fills = event.fills || [];
          const trades = fills.map((f: any) => {
            const rawCoin = f.coin || '';
            const symbol = rawCoin.includes('-') ? rawCoin : `${rawCoin}-USDC`;
            return {
              id: String(f.oid || f.tid || Date.now()),
              orderId: String(f.oid || ''),
              symbol,
              side: f.side === 'B' ? ('buy' as const) : ('sell' as const),
              price: f.px || '0',
              size: f.sz || '0',
              fee: f.fee || '0',
              feeAsset: f.feeToken || 'USDC',
              realizedPnl: f.closedPnl || '0',
              timestamp: f.time || Date.now(),
            };
          });

          const historyStore = useHistoryStore.getState();
          trades.forEach((t: any) => historyStore.addTrade(t));
        });
      } catch (err) {
        console.error('[hyperliquid ws] Subscription error', err);
      }
    };

    setup();

    return () => {
      isMounted = false;
      if (transportRef.current) {
        transportRef.current.close();
        transportRef.current = null;
      }
    };
  }, [userAddr, currentExchange, currentNetwork]);
};
