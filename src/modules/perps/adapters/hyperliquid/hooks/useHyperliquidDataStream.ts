import { useEffect, useRef } from 'react';

import { HttpTransport, WebSocketTransport } from '@nktkas/hyperliquid';
import {
  frontendOpenOrders,
  clearinghouseState as getClearinghouseState,
  spotClearinghouseState as getSpotClearinghouseState,
} from '@nktkas/hyperliquid/api/info';
import {
  clearinghouseState,
  openOrders,
  spotState,
  userFills,
} from '@nktkas/hyperliquid/api/subscription';
import BigNumber from 'bignumber.js';

import { useExchangeManager } from '../../../core/ExchangeManager';
import type { AccountBalance, Order } from '../../../core/models';
import { useAccountStore } from '../../../core/stores/accountStore';
import { useHistoryStore } from '../../../core/stores/historyStore';
import { useMarketStore } from '../../../core/stores/marketStore';
import { useOrderEntryStore } from '../../../core/stores/orderEntryStore';
import { useOrderStore } from '../../../core/stores/orderStore';
import { usePositionStore } from '../../../core/stores/positionStore';
import { useTickerStore } from '../../../core/stores/tickerStore';

export function mapHyperliquidBalances(
  ch: any,
  spot: any
): {
  balances: AccountBalance[];
  summary: {
    totalWalletBalance: string;
    totalMarginBalance: string;
    availableBalance: string;
    totalUnrealizedProfit: string;
  };
} {
  const marginSummary = ch?.marginSummary || ch?.crossMarginSummary;

  const perpAccountValue = parseFloat(marginSummary?.accountValue || '0') || 0;
  const perpMarginUsed = parseFloat(marginSummary?.totalMarginUsed || '0') || 0;
  const perpTotalRawUsd =
    parseFloat(marginSummary?.totalRawUsd || marginSummary?.accountValue || '0') || 0;

  const perpAvailable = Math.max(0, perpAccountValue - perpMarginUsed);

  const spotBalances = Array.isArray(spot?.balances) ? spot.balances : [];
  const spotUsdc = spotBalances.find((b: any) => b.coin === 'USDC');
  const spotUsdcTotal = parseFloat(spotUsdc?.total || '0') || 0;
  const spotUsdcHold = parseFloat(spotUsdc?.hold || '0') || 0;
  const spotUsdcAvailable = Math.max(0, spotUsdcTotal - spotUsdcHold);

  const combinedTotal =
    perpTotalRawUsd >= 0
      ? (perpTotalRawUsd + spotUsdcTotal).toFixed(2)
      : Math.max(0, spotUsdcTotal - spotUsdcHold + perpAccountValue).toFixed(2);

  const combinedAvailable = (perpAvailable + spotUsdcAvailable).toFixed(2);

  const combinedLocked = (perpMarginUsed + spotUsdcHold).toFixed(2);
  const combinedMarginBalance = (perpAccountValue + spotUsdcTotal).toFixed(2);

  const assetPositions = Array.isArray(ch?.assetPositions) ? ch.assetPositions : [];
  const totalUnrealizedPnl = assetPositions.reduce((acc: number, p: any) => {
    return acc + (parseFloat(p?.position?.unrealizedPnl || '0') || 0);
  }, 0);
  const unrealizedPnlStr = (
    totalUnrealizedPnl !== 0 ? totalUnrealizedPnl : perpAccountValue - perpTotalRawUsd
  ).toFixed(2);

  const resultBalances: AccountBalance[] = [
    {
      asset: 'USDC',
      total: combinedTotal,
      available: combinedAvailable,
      locked: combinedLocked,
      marginBalance: combinedMarginBalance,
      unrealizedPnl: unrealizedPnlStr,
      usdValue: combinedMarginBalance,
    },
  ];

  for (const b of spotBalances) {
    if (b?.coin && b.coin !== 'USDC') {
      const bTotal = parseFloat(b.total || '0') || 0;
      const bHold = parseFloat(b.hold || '0') || 0;
      const bAvail = Math.max(0, bTotal - bHold);
      resultBalances.push({
        asset: b.coin,
        total: String(b.total || '0'),
        available: bAvail.toFixed(4),
        locked: String(b.hold || '0'),
        marginBalance: String(b.total || '0'),
        unrealizedPnl: '0',
      });
    }
  }

  return {
    balances: resultBalances,
    summary: {
      totalWalletBalance: combinedTotal,
      totalMarginBalance: combinedMarginBalance,
      availableBalance: combinedAvailable,
      totalUnrealizedProfit: unrealizedPnlStr,
    },
  };
}

export function mapHyperliquidPositions(
  assetPositions: any[],
  assetCtxByMarket: Record<string, any> = {}
) {
  if (!Array.isArray(assetPositions)) return [];

  return assetPositions
    .map((p: any) => {
      const rawPos = p?.position;
      if (!rawPos) return null;

      // Prune closed positions with zero size so they don't linger in UI
      if (!rawPos.szi || rawPos.szi === '0' || Number(rawPos.szi) === 0) {
        return null;
      }

      const rawCoin = rawPos.coin || '';
      const symbol = rawCoin.includes('-') ? rawCoin : `${rawCoin}-USDC`;
      const levValue = rawPos.leverage?.value ? Number(rawPos.leverage.value) : 1;
      const marginType =
        rawPos.leverage?.type === 'isolated' ? ('isolated' as const) : ('cross' as const);

      const liveMarkPx =
        assetCtxByMarket[symbol]?.markPx ||
        assetCtxByMarket[rawCoin]?.markPx ||
        rawPos.entryPx ||
        '0';

      return {
        symbol,
        size: rawPos.szi || '0',
        entryPrice: rawPos.entryPx || '0',
        markPrice: liveMarkPx,
        liquidationPrice: rawPos.liquidationPx ? String(rawPos.liquidationPx) : '0',
        unrealizedPnl: rawPos.unrealizedPnl || '0',
        leverage: levValue,
        marginType,
        isolatedMargin: rawPos.marginUsed || '0',
      };
    })
    .filter(Boolean);
}

export function mapHyperliquidOrders(orderList: any[]): Order[] {
  if (!Array.isArray(orderList)) return [];
  return orderList.map((o: any) => {
    const rawCoin = o.coin || '';
    const symbol = rawCoin.includes('-') ? rawCoin : `${rawCoin}-USDC`;
    let type = 'limit';
    const ot = (o.orderType || '').toLowerCase();
    if (ot.includes('stop market') || ot === 'stop') {
      type = 'stop_market';
    } else if (ot.includes('take profit market') || ot.includes('tp market')) {
      type = 'take_profit_market';
    } else if (ot.includes('stop limit')) {
      type = 'stop';
    } else if (ot.includes('take profit limit')) {
      type = 'take_profit';
    } else if (ot.includes('market')) {
      type = 'market';
    }

    return {
      id: String(o.oid),
      symbol,
      type,
      rawType: o.orderType || type,
      side: o.side === 'A' ? ('sell' as const) : ('buy' as const),
      price: o.limitPx || o.triggerPx || '0',
      size: o.sz || '0',
      filledSize: '0',
      status: 'new' as const,
      reduceOnly: Boolean(o.reduceOnly),
      timestamp: o.timestamp || Date.now(),
      stopPrice: o.triggerPx ? String(o.triggerPx) : undefined,
    };
  });
}

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
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    const isTestnet = currentNetwork === 'testnet';
    const transport = new WebSocketTransport({ isTestnet });
    transportRef.current = transport;

    const setup = async () => {
      useAccountStore.getState().setIsLoading(true);
      try {
        const formattedUser = (
          userAddr.toLowerCase().startsWith('0x') ? userAddr : `0x${userAddr}`
        ) as `0x${string}`;

        let latestClearinghouse: any = null;
        let latestSpot: any = null;

        const syncBalances = () => {
          if (!isMounted) return;
          if (!latestClearinghouse && !latestSpot) return;

          const { balances, summary } = mapHyperliquidBalances(latestClearinghouse, latestSpot);
          useAccountStore.getState().setBalances(balances, summary);
        };

        const processClearinghouseState = (ch: any) => {
          if (!isMounted || !ch) return;
          latestClearinghouse = ch;
          syncBalances();

          const tickerState = useTickerStore.getState().assetCtxByMarket;
          const positions = mapHyperliquidPositions(ch.assetPositions, tickerState);

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

        const processSpotState = (spot: any) => {
          if (!isMounted || !spot) return;
          latestSpot = spot;
          syncBalances();
        };

        const fetchSnapshot = async () => {
          if (!isMounted) return;
          try {
            const httpTransport = new HttpTransport({ isTestnet });
            const [snapshotCh, snapshotSpot, snapshotOrders] = await Promise.all([
              getClearinghouseState({ transport: httpTransport }, { user: formattedUser }).catch(
                () => null
              ),
              getSpotClearinghouseState(
                { transport: httpTransport },
                { user: formattedUser }
              ).catch(() => null),
              frontendOpenOrders({ transport: httpTransport }, { user: formattedUser }).catch(
                () => null
              ),
            ]);

            if (snapshotCh) {
              processClearinghouseState(snapshotCh);
            }
            if (snapshotSpot) {
              processSpotState(snapshotSpot);
            }
            if (Array.isArray(snapshotOrders)) {
              useOrderStore.getState().setOrders(mapHyperliquidOrders(snapshotOrders));
            }
          } catch {
            void 0;
          } finally {
            if (isMounted) {
              useAccountStore.getState().setIsLoading(false);
            }
          }
        };

        await fetchSnapshot();

        pollTimer = setInterval(() => {
          if (isMounted) {
            fetchSnapshot();
          }
        }, 10000);

        try {
          await clearinghouseState(
            { transport },
            { user: formattedUser },
            (event: any) => {
              if (!isMounted || !event) return;
              processClearinghouseState(event.clearinghouseState);
            },
            { onError: () => {} }
          );
        } catch {
          void 0;
        }

        try {
          await spotState(
            { transport },
            { user: formattedUser },
            (event: any) => {
              if (!isMounted || !event) return;
              processSpotState(event.spotState);
            },
            { onError: () => {} }
          );
        } catch {
          void 0;
        }

        try {
          await openOrders(
            { transport },
            { user: formattedUser },
            (event: any) => {
              if (!isMounted || !event) return;
              const mappedWsOrders = mapHyperliquidOrders(event.orders || []);
              const existingOrders = Object.values(useOrderStore.getState().orders || {});
              const existingTriggers = existingOrders.filter(
                o =>
                  o.stopPrice ||
                  (o.rawType &&
                    (o.rawType.toLowerCase().includes('stop') ||
                      o.rawType.toLowerCase().includes('profit')))
              );
              const newIds = new Set(mappedWsOrders.map(o => o.id));
              const retainedTriggers = existingTriggers.filter(o => !newIds.has(o.id));
              useOrderStore.getState().setOrders([...mappedWsOrders, ...retainedTriggers]);
            },
            { onError: () => {} }
          );
        } catch {
          void 0;
        }

        try {
          await userFills(
            { transport },
            { user: formattedUser },
            (event: any) => {
              if (!isMounted || !event) return;
              const fills = event.fills || [];
              const trades = fills.map((f: any) => {
                const rawCoin = f.coin || '';
                const symbol = rawCoin.includes('-') ? rawCoin : `${rawCoin}-USDC`;
                const fillId =
                  f.tid !== undefined && f.tid !== null
                    ? String(f.tid)
                    : f.hash
                      ? `${f.hash}-${f.oid}`
                      : `${f.oid}-${f.time}`;
                const quoteQty = new BigNumber(f.px || 0).times(f.sz || 0).toFixed(2);

                return {
                  id: fillId,
                  orderId: f.oid,
                  symbol,
                  price: f.px || '0',
                  qty: f.sz || '0',
                  quoteQty,
                  realizedPnl: f.closedPnl || '0',
                  commission: f.fee || '0',
                  commissionAsset: f.feeToken || 'USDC',
                  marginAsset: 'USDC',
                  time: f.time || Date.now(),
                  buyer: f.side === 'B',
                  maker: (f as any).maker !== undefined ? (f as any).maker : !f.crossed,
                  side: f.side === 'B' ? 'BUY' : 'SELL',
                  dir: f.dir,
                  newChainData: {
                    hash: f.hash,
                  },
                };
              });

              const historyStore = useHistoryStore.getState();
              trades.forEach((t: any) => historyStore.addTrade(t));
            },
            { onError: () => {} }
          );
        } catch {
          void 0;
        }
      } catch (err) {
        console.error('[hyperliquid ws] Subscription error', err);
      }
    };

    setup();

    return () => {
      isMounted = false;
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      if (transportRef.current) {
        try {
          transportRef.current.close();
        } catch {
          void 0;
        }
        transportRef.current = null;
      }
    };
  }, [userAddr, currentExchange, currentNetwork]);
};
