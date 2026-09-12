import { Clock, ExternalLink } from 'lucide-react';
import React, { useMemo, useState } from 'react';

import { useExchangeManager } from '../../../core/ExchangeManager';
import type { Order } from '../../../core/models';
import { useMarketStore } from '../../../core/stores/marketStore';
import { useOrderStore } from '../../../core/stores/orderStore';
import { useTickerStore } from '../../../core/stores/tickerStore';
import { useUnifiedExecution } from '../../../services/useUnifiedExecution';
import { TabEmptyState } from './TabEmptyState';

interface Props {
  signer?: any;
  userAddr?: string;
  hideOtherSymbols?: boolean;
  currentSymbol?: string;
}

function formatSplitDate(timestamp: number): { date: string; time: string } {
  if (!timestamp) return { date: '--', time: '' };
  const d = new Date(timestamp);
  const pad = (n: number) => n.toString().padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());
  return {
    date: `${year}-${month}-${day}`,
    time: `${hours}:${minutes}:${seconds}`,
  };
}

function parseSymbol(rawSymbol: string): { base: string; quote: string; display: string } {
  const clean = (rawSymbol || '').replace('-', '').toUpperCase();
  let quote = 'USDT';
  let base = clean;
  if (clean.endsWith('USDT')) {
    quote = 'USDT';
    base = clean.slice(0, -4);
  } else if (clean.endsWith('USDC')) {
    quote = 'USDC';
    base = clean.slice(0, -4);
  } else if (clean.endsWith('USD')) {
    quote = 'USD';
    base = clean.slice(0, -3);
  }
  return { base: base || 'BTC', quote, display: `${base || 'BTC'}${quote} Perp` };
}

function formatNum(
  val: string | number | undefined | null,
  minDec = 2,
  maxDec = 4,
  fallback = '--'
): string {
  if (val === undefined || val === null || val === '') return fallback;
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return fallback;
  return num.toLocaleString('en-US', {
    minimumFractionDigits: minDec,
    maximumFractionDigits: maxDec,
  });
}

function formatOrderType(o: Order): string {
  const raw = (o.rawType || o.origType || o.type || '').toUpperCase();
  if (raw === 'TRAILING_STOP_MARKET') return 'Trailing Stop';
  if (raw === 'STOP_MARKET') return 'Stop Market';
  if (raw === 'STOP') return 'Stop Limit';
  if (raw === 'TAKE_PROFIT_MARKET') return 'Take Profit Market';
  if (raw === 'TAKE_PROFIT') return 'Take Profit Limit';
  if (raw === 'CHASE') return 'Chase Order';
  if (raw === 'LIMIT') return 'Limit';
  if (raw === 'MARKET') return 'Market';
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function formatOrderPrice(o: Order, tickSize?: number): string {
  const raw = (o.rawType || o.origType || o.type || '').toUpperCase();
  if (raw === 'TRAILING_STOP_MARKET') {
    const rate = o.callbackRate ? String(o.callbackRate) : '2.0';
    return `Callback rate = ${parseFloat(rate).toFixed(1)}%`;
  }
  if (raw === 'STOP_MARKET' || raw === 'MARKET') {
    return 'Market';
  }
  const p = parseFloat(o.price);
  if (isNaN(p) || p <= 0) return 'Market';
  const dec = tickSize ? Math.max(0, -Math.floor(Math.log10(tickSize))) : 2;
  return formatNum(p, dec, dec);
}

function formatTriggerPrice(o: Order, tickSize?: number): { label: string; value: string } | null {
  const raw = (o.rawType || o.origType || o.type || '').toUpperCase();
  const dec = tickSize ? Math.max(0, -Math.floor(Math.log10(tickSize))) : 1;
  const isBuy = o.side === 'buy';

  if (raw === 'TRAILING_STOP_MARKET') {
    const actPx = parseFloat(String(o.activationPrice || '0'));
    const op = isBuy ? '<=' : '>=';
    return {
      label: 'Activation price',
      value: actPx > 0 ? `${op} ${formatNum(actPx, dec, dec)}` : '--',
    };
  }

  const stopPx = parseFloat(String(o.stopPrice || '0'));
  if (raw.includes('STOP') || raw.includes('PROFIT') || stopPx > 0) {
    const isMark = o.workingType === 'MARK_PRICE';
    const label = isMark ? 'Mark price' : 'Last price';
    const op = isBuy ? '>=' : '<=';
    return {
      label,
      value: stopPx > 0 ? `${op} ${formatNum(stopPx, dec, dec)}` : '--',
    };
  }

  return null;
}

export const OpenOrdersTab: React.FC<Props> = ({ hideOtherSymbols, currentSymbol }) => {
  const orders = useOrderStore(state => state.orders);
  const currentNetwork = useExchangeManager(state => state.currentNetwork);
  const { isReady, cancelSingleOrder, cancelAll } = useUnifiedExecution();
  const assetCtxByMarket = useTickerStore(state => state.assetCtxByMarket);
  const markets = useMarketStore(state => state.markets);

  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [cancelingAll, setCancelingAll] = useState(false);

  const displayOrders = useMemo(() => {
    let list = Object.values(orders).filter(
      o => o.status === 'new' || o.status === 'partially_filled'
    );

    if (hideOtherSymbols && currentSymbol) {
      const cleanCur = currentSymbol.replace('-', '').toUpperCase();
      list = list.filter(o => o.symbol.replace('-', '').toUpperCase() === cleanCur);
    }

    return list.sort((a, b) => b.timestamp - a.timestamp);
  }, [orders, hideOtherSymbols, currentSymbol]);

  const handleCancel = async (symbol: string, orderId: string) => {
    if (!isReady || cancelingId) return;
    setCancelingId(orderId);
    try {
      await cancelSingleOrder(symbol, orderId);
    } catch (e) {
      console.error('Failed to cancel order:', e);
    } finally {
      setCancelingId(null);
    }
  };

  const handleCancelAll = async () => {
    if (!isReady || cancelingAll || displayOrders.length === 0) return;
    setCancelingAll(true);
    try {
      await cancelAll();
    } catch (e) {
      console.error('Failed to cancel all open orders:', e);
    } finally {
      setCancelingAll(false);
    }
  };

  const explorerBase =
    currentNetwork === 'testnet'
      ? 'https://www.asterdex-testnet.com/en/explorer/tx/'
      : 'https://www.asterdex.com/en/explorer/tx/';

  if (displayOrders.length === 0) {
    return (
      <TabEmptyState
        icon={Clock}
        title="No open orders"
        description="Your active limit and trigger orders will appear here."
      />
    );
  }

  return (
    <div className="w-full h-full overflow-x-auto overflow-y-auto scrollbar-none">
      <table className="w-full text-[11px] text-left whitespace-nowrap">
        <thead className="text-secondary border-b border-color sticky top-0 bg-secondary z-10">
          <tr>
            <th className="px-3 py-2 font-medium">Time</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Symbol</th>
            <th className="px-3 py-2 font-medium">Side</th>
            <th className="px-3 py-2 font-medium">Order price</th>
            <th className="px-3 py-2 font-medium">Filled amount</th>
            <th className="px-3 py-2 font-medium">Total amount</th>
            <th className="px-3 py-2 font-medium">Order value</th>
            <th className="px-3 py-2 font-medium">Trigger price</th>
            <th className="px-3 py-2 font-medium">Reduce only</th>
            <th className="px-3 py-2 font-medium">TP/SL</th>
            <th className="px-3 py-2 font-medium">Explorer</th>
            <th className="px-3 py-2 font-medium text-right">
              {displayOrders.length > 0 ? (
                <button
                  onClick={handleCancelAll}
                  disabled={cancelingAll || !isReady}
                  className="text-secondary hover:text-danger text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-40"
                  title="Cancel all open orders"
                >
                  {cancelingAll ? 'Canceling...' : 'Cancel all'}
                </button>
              ) : (
                <span>Action</span>
              )}
            </th>
          </tr>
        </thead>
        <tbody>
          {displayOrders.map(o => {
            const { date, time } = formatSplitDate(o.timestamp);
            const symInfo = parseSymbol(o.symbol);
            const market = markets[o.symbol] || markets[o.symbol.replace('-', '')];
            const tickSize = market?.tickSize || 0.1;
            const stepSize = market?.stepSize || 0.001;
            const baseDec = Math.max(0, -Math.floor(Math.log10(stepSize)));

            const isBuy = o.side === 'buy';
            const orderTypeLabel = formatOrderType(o);
            const priceDisplay = formatOrderPrice(o, tickSize);
            const triggerInfo = formatTriggerPrice(o, tickSize);

            // Calculate order value
            const cleanSym = o.symbol.replace('-', '');
            const markPriceStr =
              assetCtxByMarket[cleanSym]?.markPx ||
              assetCtxByMarket[`${cleanSym}USDT`]?.markPx ||
              assetCtxByMarket[o.symbol]?.markPx ||
              '0';
            const markPx = parseFloat(markPriceStr) || 0;
            const rawPrice = parseFloat(o.price);
            const effectivePx = rawPrice > 0 ? rawPrice : markPx;
            const sizeNum = parseFloat(o.size) || 0;
            const orderValue =
              effectivePx > 0 && sizeNum > 0
                ? `$${(effectivePx * sizeNum).toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`
                : '--';

            const leverage = o.leverage || 20;
            const marginType = (o.marginType || 'cross').toLowerCase();
            const marginTypeDisplay = marginType.charAt(0).toUpperCase() + marginType.slice(1);

            return (
              <tr key={o.id} className="border-b border-color hover:bg-hover transition-colors">
                {/* 1. Time (2 rows: Date top, Time bottom) */}
                <td className="px-3 py-2 text-secondary">
                  <div className="flex flex-col leading-tight gap-0.5">
                    <span className="text-secondary">{date}</span>
                    <span className="text-muted text-[10px]">{time}</span>
                  </div>
                </td>

                {/* 2. Type */}
                <td className="px-3 py-2 text-primary font-medium">{orderTypeLabel}</td>

                {/* 3. Symbol (2 rows: Symbol top, Leverage / Margin bottom) */}
                <td className="px-3 py-2 text-primary">
                  <div className="flex flex-col leading-tight gap-0.5">
                    <span className="font-medium text-primary">{symInfo.display}</span>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted">
                      <span>{leverage}x</span>
                      <span>{marginTypeDisplay}</span>
                    </div>
                  </div>
                </td>

                {/* 4. Side */}
                <td className="px-3 py-2 font-medium">
                  <span className={isBuy ? 'text-success font-medium' : 'text-danger font-medium'}>
                    {isBuy ? 'Buy' : 'Sell'}
                  </span>
                </td>

                {/* 5. Order price */}
                <td className="px-3 py-2 text-primary font-mono-tabular">{priceDisplay}</td>

                {/* 6. Filled amount */}
                <td className="px-3 py-2 text-primary font-mono-tabular">
                  {formatNum(o.filledSize || '0', baseDec, baseDec)} {symInfo.base}
                </td>

                {/* 7. Total amount */}
                <td className="px-3 py-2 text-primary font-mono-tabular">
                  {formatNum(o.size, baseDec, baseDec)} {symInfo.base}
                </td>

                {/* 8. Order value */}
                <td className="px-3 py-2 text-primary font-mono-tabular">{orderValue}</td>

                {/* 9. Trigger price (2 rows: Label top, Condition bottom) */}
                <td className="px-3 py-2 text-secondary">
                  {triggerInfo ? (
                    <div className="flex flex-col leading-tight gap-0.5">
                      <span className="text-muted text-[10px]">{triggerInfo.label}</span>
                      <span className="text-primary font-mono-tabular font-medium">
                        {triggerInfo.value}
                      </span>
                    </div>
                  ) : (
                    <span>--</span>
                  )}
                </td>

                {/* 10. Reduce only */}
                <td className="px-3 py-2 text-secondary">{o.reduceOnly ? 'Yes' : 'No'}</td>

                {/* 11. TP/SL */}
                <td className="px-3 py-2 text-secondary">--</td>

                {/* 12. Explorer */}
                <td className="px-3 py-2 text-secondary">
                  {o.hash ? (
                    <a
                      href={`${explorerBase}${o.hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand hover:underline inline-flex items-center gap-1 font-mono text-[11px]"
                    >
                      <span>View</span>
                      <ExternalLink size={10} />
                    </a>
                  ) : (
                    <span>--</span>
                  )}
                </td>

                {/* 13. Action */}
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => handleCancel(o.symbol.replace('-', ''), o.id)}
                    disabled={cancelingId === o.id || !isReady}
                    className="text-[10px] bg-tertiary hover:bg-hover px-2.5 py-1 rounded text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    title={!isReady ? 'Trading session not active' : 'Cancel Order'}
                  >
                    {cancelingId === o.id ? '...' : 'Cancel'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
