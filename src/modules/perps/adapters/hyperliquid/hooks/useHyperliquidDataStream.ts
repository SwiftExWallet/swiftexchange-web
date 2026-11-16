import { useEffect, useRef } from 'react';

import { HttpTransport, WebSocketTransport } from '@nktkas/hyperliquid';
import {
  clearinghouseState as getClearinghouseState,
  spotClearinghouseState as getSpotClearinghouseState,
} from '@nktkas/hyperliquid/api/info';
import {
  clearinghouseState,
  openOrders,
  spotState,
  userFills,
} from '@nktkas/hyperliquid/api/subscription';

import { useExchangeManager } from '../../../core/ExchangeManager';
import type { AccountBalance } from '../../../core/models';
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

  const perpWithdrawable =
    marginSummary?.withdrawable !== undefined && marginSummary?.withdrawable !== null
      ? parseFloat(marginSummary.withdrawable) || 0
      : ch?.withdrawable !== undefined && ch?.withdrawable !== null
        ? parseFloat(ch.withdrawable) || 0
        : Math.max(0, perpAccountValue - perpMarginUsed);

  const perpUnrealizedPnl = perpAccountValue - perpTotalRawUsd;

  const spotBalances = Array.isArray(spot?.balances) ? spot.balances : [];
  const spotUsdc = spotBalances.find((b: any) => b.coin === 'USDC');
  const spotUsdcTotal = parseFloat(spotUsdc?.total || '0') || 0;
  const spotUsdcHold = parseFloat(spotUsdc?.hold || '0') || 0;
  const spotUsdcAvailable = Math.max(0, spotUsdcTotal - spotUsdcHold);

  const combinedTotal = (perpTotalRawUsd + spotUsdcTotal).toFixed(2);
  const combinedAvailable = (perpWithdrawable + spotUsdcAvailable).toFixed(2);
  const combinedLocked = (perpMarginUsed + spotUsdcHold).toFixed(2);
  const combinedMarginBalance = (perpAccountValue + spotUsdcTotal).toFixed(2);
  const unrealizedPnlStr = perpUnrealizedPnl.toFixed(2);

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
            const [snapshotCh, snapshotSpot] = await Promise.all([
              getClearinghouseState({ transport: httpTransport }, { user: formattedUser }).catch(
                () => null
              ),
              getSpotClearinghouseState(
                { transport: httpTransport },
                { user: formattedUser }
              ).catch(() => null),
            ]);

            if (snapshotCh) {
              processClearinghouseState(snapshotCh);
            }
            if (snapshotSpot) {
              processSpotState(snapshotSpot);
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

                return {
                  id: fillId,
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
