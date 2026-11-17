import { useEffect, useRef, useState } from 'react';

import BigNumber from 'bignumber.js';
import type { Signer } from 'ethers';

import { useNotificationStore } from '../../../../../store/notificationStore';
import type { AccountBalance, Order, Position } from '../../../core/models';
import { useAccountStore } from '../../../core/stores/accountStore';
import { useHistoryStore } from '../../../core/stores/historyStore';
import { useOrderEntryStore } from '../../../core/stores/orderEntryStore';
import { useOrderStore } from '../../../core/stores/orderStore';
import { usePositionStore } from '../../../core/stores/positionStore';
import { useTickerStore } from '../../../core/stores/tickerStore';
import { getAsterWsUrl } from '../constants';
import { fetchAsterSnapshot } from './useAsterDataSync';
import { useListenKey } from './useListenKey';

export interface MarginCallPosition {
  symbol: string;
  positionSide: string;
  positionAmount: string;
  marginType: string;
  isolatedWallet: string;
  markPrice: string;
  unrealizedPnl: string;
  maintenanceMarginRequired: string;
}

export interface MarginCallEvent {
  eventTime: number;
  crossWalletBalance?: string;
  positions: MarginCallPosition[];
}

export function useUserDataStream(signer: Signer | null, userAddr: string | null) {
  const { listenKey, refresh } = useListenKey(signer, userAddr);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const applyAccountUpdate = (a: any) => {
    if (!a) return;

    if (Array.isArray(a.P) && a.P.length > 0) {
      try {
        const upsertList: Position[] = [];
        const removeList: string[] = [];
        const posMap = usePositionStore.getState().positions;
        const orderEntryState = useOrderEntryStore.getState();

        a.P.forEach((p: any) => {
          const rawSymbol = String(p.s || '');
          const cleanSymbol = rawSymbol.replace(/(USDT|USDC)$/, '-$1');
          const isZero = !p.pa || new BigNumber(p.pa).isZero();

          if (isZero) {
            removeList.push(cleanSymbol);
            removeList.push(rawSymbol);
          } else {
            const existing =
              posMap[cleanSymbol] || posMap[rawSymbol] || posMap[cleanSymbol.replace('-', '')];

            const storedLev =
              (existing?.leverage && existing.leverage > 0 ? existing.leverage : null) ||
              orderEntryState.leverageBySymbol[cleanSymbol] ||
              orderEntryState.leverageBySymbol[rawSymbol] ||
              orderEntryState.leverage ||
              20;

            const tickerMark =
              useTickerStore.getState().assetCtxByMarket[cleanSymbol]?.markPx ||
              useTickerStore.getState().assetCtxByMarket[rawSymbol]?.markPx;

            upsertList.push({
              symbol: cleanSymbol,
              size: String(p.pa),
              entryPrice: String(p.ep || '0'),
              markPrice: String(p.mp || existing?.markPrice || tickerMark || '0'),
              liquidationPrice: existing?.liquidationPrice || '0',
              unrealizedPnl: String(p.up || '0'),
              leverage: storedLev,
              marginType: p.mt
                ? String(p.mt).toLowerCase() === 'isolated'
                  ? 'isolated'
                  : 'cross'
                : existing?.marginType || 'cross',
              isolatedMargin: p.iw ? String(p.iw) : '0',
              initialMargin: (existing as any)?.initialMargin,
            });
          }
        });

        if (upsertList.length > 0 || removeList.length > 0) {
          usePositionStore.getState().batchUpdatePositions({
            upsert: upsertList,
            remove: removeList,
          });
        }
      } catch (err) {
        console.error('[UserDataStream] Error updating positions:', err);
      }
    }

    try {
      const curPositions = usePositionStore.getState().positions;
      const curOrders = useOrderStore.getState().orders;
      const curBalances = useAccountStore.getState().balances;
      const curAssetCtx = useTickerStore.getState().assetCtxByMarket;
      const isMulti = useAccountStore.getState().multiAssetsMargin;

      let totalWallet = 0;
      if (isMulti) {
        totalWallet = Object.values(curBalances).reduce((acc, b) => {
          let bTotal = parseFloat(b.total || '0') || 0;
          if (Array.isArray(a.B)) {
            const matchB = a.B.find((item: any) => item.a === b.asset);
            if (matchB) bTotal = parseFloat(matchB.wb || '0') || 0;
          }
          let px = 1;
          if (b.asset !== 'USDT' && b.asset !== 'USDC') {
            const mPx =
              curAssetCtx[`${b.asset}-USDT`]?.markPx || curAssetCtx[`${b.asset}USDT`]?.markPx;
            if (mPx) px = parseFloat(mPx);
            else if (b.asset === 'ASTER') px = 0.783681;
            else px = 0;
          }
          return acc + bTotal * px;
        }, 0);
      } else {
        let usdtTotal =
          parseFloat(
            curBalances['USDT']?.total ||
              curBalances['USDT']?.available ||
              curBalances['USDC']?.total ||
              '0'
          ) || 0;
        if (Array.isArray(a.B)) {
          const matchUsdt = a.B.find((item: any) => item.a === 'USDT' || item.a === 'USDC');
          if (matchUsdt && matchUsdt.wb !== undefined) {
            usdtTotal = parseFloat(matchUsdt.wb || '0') || 0;
          }
        }
        totalWallet = usdtTotal;
      }

      let resolvedTotalWallet = totalWallet;
      if (resolvedTotalWallet <= 0) {
        const storeTotal = parseFloat(useAccountStore.getState().totalWalletBalance || '0') || 0;
        if (storeTotal > 0) {
          resolvedTotalWallet = storeTotal;
        } else {
          const storeAvail = parseFloat(useAccountStore.getState().availableBalance || '0') || 0;
          if (storeAvail > 0) {
            resolvedTotalWallet = storeAvail;
          }
        }
      }

      const activePosList = Object.values(curPositions).filter(
        p => p.size && !new BigNumber(p.size).isZero()
      );

      const posMargin = activePosList.reduce((acc, p) => {
        if (p.marginType === 'isolated') {
          return acc + (parseFloat(p.isolatedMargin || '0') || 0);
        }
        const sz = Math.abs(parseFloat(p.size || '0'));
        const px =
          parseFloat(p.entryPrice || '0') > 0
            ? parseFloat(p.entryPrice)
            : parseFloat(p.markPrice || '0') || 0;
        const lev = Math.max(1, p.leverage || 1);
        return acc + (sz * px) / lev;
      }, 0);

      const activeOrdList = Object.values(curOrders).filter(
        o => !o.reduceOnly && (o.status === 'new' || o.status === 'partially_filled')
      );

      const orderMargin = activeOrdList.reduce((acc, o) => {
        const remSize = Math.max(
          0,
          (parseFloat(o.size || '0') || 0) - (parseFloat(o.filledSize || '0') || 0)
        );
        if (remSize <= 0) return acc;
        const px =
          parseFloat(o.price || '0') > 0
            ? parseFloat(o.price)
            : parseFloat(curAssetCtx[o.symbol]?.markPx || '0') || 0;
        const lev = Math.max(1, o.leverage || 1);
        return acc + (remSize * px) / lev;
      }, 0);

      const crossLoss = activePosList
        .filter(p => p.marginType === 'cross')
        .reduce((acc, p) => {
          const upnl = parseFloat(p.unrealizedPnl || '0');
          return upnl < 0 ? acc + upnl : acc;
        }, 0);

      const realAvail = Math.max(0, resolvedTotalWallet + crossLoss - posMargin - orderMargin);
      const realAvailStr = realAvail.toFixed(4);

      if (Array.isArray(a.B) && a.B.length > 0) {
        const balanceUpdates: AccountBalance[] = a.B.map((b: any) => {
          const wbBn = new BigNumber(b.wb || '0');
          const cwBn = new BigNumber(b.cw || '0');
          const isQuoteAsset = b.a === 'USDT' || (!isMulti && (b.a === 'USDC' || b.a === 'USD'));
          const availVal = isQuoteAsset ? realAvailStr : b.cw || '0';
          const lockedVal = isQuoteAsset
            ? Math.max(0, wbBn.minus(new BigNumber(realAvailStr)).toNumber()).toFixed(4)
            : wbBn.minus(cwBn).toString();
          return {
            asset: b.a,
            total: b.wb || '0',
            available: availVal,
            locked: lockedVal,
            marginBalance: b.cw || '0',
          };
        });

        useAccountStore.getState().updateBalances(balanceUpdates, {
          availableBalance: realAvailStr,
          totalWalletBalance: resolvedTotalWallet > 0 ? resolvedTotalWallet.toFixed(4) : undefined,
          totalMarginBalance:
            resolvedTotalWallet > 0 ? (resolvedTotalWallet + crossLoss).toFixed(4) : undefined,
        });

        if (a.m === 'DEPOSIT' || a.m === 'WITHDRAW' || a.m === 'TRANSFER') {
          a.B.forEach((b: any) => {
            if (b.bc && String(b.bc).trim() !== '' && !new BigNumber(b.bc).isZero()) {
              useHistoryStore.getState().prependIncome({
                symbol: '',
                incomeType: a.m,
                income: String(b.bc),
                asset: b.a || 'USDT',
                time: Date.now(),
                tranId: String(Date.now()),
                tradeId: '',
                info: a.m,
              });
            }
          });
        }
      } else {
        const qAsset = isMulti ? 'USDT' : curBalances['USDT'] ? 'USDT' : 'USDC';
        const qBal = curBalances[qAsset];
        const updatedBalList: AccountBalance[] = qBal
          ? [
              {
                ...qBal,
                available: realAvailStr,
                locked: Math.max(0, parseFloat(qBal.total || '0') - realAvail).toFixed(4),
              },
            ]
          : [];
        useAccountStore.getState().updateBalances(updatedBalList, {
          availableBalance: realAvailStr,
          totalWalletBalance: resolvedTotalWallet > 0 ? resolvedTotalWallet.toFixed(4) : undefined,
          totalMarginBalance:
            resolvedTotalWallet > 0 ? (resolvedTotalWallet + crossLoss).toFixed(4) : undefined,
        });
      }
    } catch (err) {
      console.error('[UserDataStream] Error updating balances:', err);
    }
  };

  const applyOrderUpdate = (o: any) => {
    if (!o || !o.s) return;
    const symbol = String(o.s).replace('USDT', '-USDT');
    const status = o.X ? (String(o.X).toLowerCase() as Order['status']) : 'new';
    const orderId = String(o.i);

    const terminalStatuses = new Set(['filled', 'canceled', 'rejected', 'expired']);

    if (terminalStatuses.has(status)) {
      useOrderStore.getState().removeOrder(orderId);
    } else {
      useOrderStore.getState().updateOrder({
        id: orderId,
        symbol,
        type: (o.o || o.ot ? String(o.o || o.ot).toLowerCase() : 'limit') as Order['type'],
        side: o.S ? (String(o.S).toLowerCase() as Order['side']) : 'buy',
        price: o.p,
        size: o.q,
        filledSize: o.z,
        status,
        reduceOnly: o.R ?? false,
        timestamp: o.T ?? Date.now(),
      });
    }

    if (o.x !== 'CALCULATED') {
      const actionText = o.S === 'BUY' ? 'Buy' : 'Sell';
      let title = '';
      let message = `${actionText} ${o.q} ${symbol} at ${o.p === '0' ? 'Market' : o.p}`;
      let type: 'success' | 'error' | 'info' = 'info';

      if (o.X === 'FILLED' || o.X === 'PARTIALLY_FILLED') {
        title = `Order ${o.X === 'FILLED' ? 'Filled' : 'Partially Filled'}`;
        type = 'success';
        message = `Executed ${o.z} ${symbol} at $${o.ap}`;
      } else if (o.X === 'CANCELED') {
        title = 'Order Canceled';
        type = 'info';
      } else if (o.X === 'REJECTED') {
        title = 'Order Rejected';
        type = 'error';
        message = o.r || 'Order was rejected by the exchange';
      } else if (o.X === 'EXPIRED') {
        title = 'Order Expired';
        type = 'info';
      }

      if (title) {
        useNotificationStore.getState().showToast({
          type: type === 'error' ? 'SYSTEM' : 'DYDX',
          title,
          message,
        });
      }
    }

    const txTime = o.T || Date.now();
    useHistoryStore.getState().prependOrder({
      orderId: o.i,
      symbol: o.s,
      status: o.X,
      clientOrderId: o.c,
      price: o.p,
      avgPrice: o.ap,
      origQty: o.q,
      executedQty: o.z,
      cumQty: o.z || '0',
      cumQuote: '0',
      timeInForce: o.f,
      type: o.o,
      reduceOnly: o.R,
      closePosition: o.cp,
      side: o.S,
      positionSide: o.ps,
      stopPrice: o.sp,
      workingType: o.wt,
      priceProtect: false,
      origType: o.ot,
      time: txTime,
      updateTime: txTime,
    });

    if (o.x === 'TRADE') {
      useHistoryStore.getState().prependTrade({
        buyer: o.S === 'BUY',
        commission: o.n || '0',
        commissionAsset: o.N || 'USDT',
        id: o.t,
        maker: o.m,
        orderId: o.i,
        price: o.L,
        qty: o.l,
        quoteQty: new BigNumber(o.L || '0').times(new BigNumber(o.l || '0')).toString(),
        realizedPnl: o.rp || '0',
        side: o.S,
        positionSide: o.ps,
        symbol: o.s,
        time: txTime,
      });

      if (o.n && new BigNumber(o.n).gt(0)) {
        useHistoryStore.getState().prependIncome({
          symbol: o.s,
          incomeType: 'COMMISSION',
          income: `-${o.n}`,
          asset: o.N || 'USDT',
          time: txTime,
          tranId: String(o.t || txTime),
          tradeId: String(o.t || ''),
          info: '',
        });
      }

      if (o.rp && !new BigNumber(o.rp).isZero()) {
        useHistoryStore.getState().prependIncome({
          symbol: o.s,
          incomeType: 'REALIZED_PNL',
          income: o.rp,
          asset: 'USDT',
          time: txTime,
          tranId: String(o.t || txTime),
          tradeId: String(o.t || ''),
          info: '',
        });
      }
    }
  };

  useEffect(() => {
    if (!listenKey) return;

    let isDisposed = false;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let watchdogTimer: ReturnType<typeof setInterval> | null = null;
    let lastActivityTime = Date.now();
    let reconnectAttempts = 0;

    const connectWs = () => {
      if (isDisposed) return;

      const ws = new WebSocket(`${getAsterWsUrl()}/${listenKey}`);
      wsRef.current = ws;

      const clearWatchdog = () => {
        if (watchdogTimer) {
          clearInterval(watchdogTimer);
          watchdogTimer = null;
        }
      };

      const startWatchdog = () => {
        clearWatchdog();
        lastActivityTime = Date.now();
        watchdogTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(JSON.stringify({ method: 'ping' }));
            } catch {
              void 0;
            }
          }

          if (Date.now() - lastActivityTime > 180_000) {
            console.warn(
              '[UserDataStream] Watchdog timeout (no data for 180s), closing stale connection'
            );
            ws.close();
          }
        }, 25_000);
      };

      ws.onopen = () => {
        if (isDisposed) {
          ws.close();
          return;
        }
        console.log('[UserDataStream] Connected');
        setConnected(true);
        reconnectAttempts = 0;
        startWatchdog();

        if (signer && userAddr) {
          fetchAsterSnapshot(signer, userAddr).catch(err => {
            console.error('[UserDataStream] Resync on connect failed:', err);
          });
        }
      };

      ws.onmessage = event => {
        lastActivityTime = Date.now();
        let data: any;
        try {
          data = JSON.parse(event.data as string);
        } catch {
          return;
        }

        try {
          switch (data.e) {
            case 'ACCOUNT_UPDATE':
              applyAccountUpdate(data.a);
              break;
            case 'ORDER_TRADE_UPDATE':
              applyOrderUpdate(data.o);
              break;
            case 'ACCOUNT_CONFIG_UPDATE':
              if (data.ac && data.ac.s) {
                const symbol = String(data.ac.s).replace('USDT', '-USDT');
                const existing = usePositionStore.getState().positions[symbol];
                if (existing) {
                  usePositionStore.getState().updatePosition({
                    ...existing,
                    leverage: data.ac.l || existing.leverage,
                  });
                  if (data.ac.l) {
                    useNotificationStore.getState().showToast({
                      type: 'DYDX',
                      title: 'Leverage Updated',
                      message: `Leverage for ${symbol} set to ${data.ac.l}x`,
                    });
                  }
                }
              }
              break;
            case 'listenKeyExpired':
              ws.close();
              refresh();
              break;
            case 'MARGIN_CALL':
              if (data.positions && data.positions.length > 0) {
                const pos = data.positions[0];
                const symbol = String(pos.symbol).replace('USDT', '-USDT');
                useNotificationStore.getState().showToast({
                  type: 'SYSTEM',
                  title: 'Margin Call Warning',
                  message: `Your position on ${symbol} is close to liquidation. Margin Required: ${pos.maintenanceMarginRequired}`,
                });
              }
              break;
          }
        } catch (err) {
          console.error('[UserDataStream] Error processing event:', err);
        }
      };

      ws.onclose = () => {
        clearWatchdog();
        setConnected(false);
        wsRef.current = null;
        if (isDisposed) return;

        console.log('[UserDataStream] Disconnected, scheduling reconnect...');
        const delay =
          Math.min(1000 * Math.pow(2, reconnectAttempts), 30_000) + Math.random() * 1000;
        reconnectAttempts++;
        if (reconnectAttempts > 3) {
          refresh().catch(() => {});
        }
        reconnectTimeout = setTimeout(() => {
          connectWs();
        }, delay);
      };

      ws.onerror = err => {
        console.error('[UserDataStream] WebSocket error:', err);
      };
    };

    connectWs();

    const handleVisibility = () => {
      if (
        document.visibilityState === 'visible' &&
        signer &&
        userAddr &&
        (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN)
      ) {
        fetchAsterSnapshot(signer, userAddr).catch(() => {});
      }
    };
    const handleOnline = () => {
      if (signer && userAddr) {
        fetchAsterSnapshot(signer, userAddr).catch(() => {});
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleOnline);

    return () => {
      isDisposed = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleOnline);
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
      if (watchdogTimer) {
        clearInterval(watchdogTimer);
        watchdogTimer = null;
      }
      if (wsRef.current) {
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [listenKey, refresh, signer, userAddr]);

  return { connected };
}
