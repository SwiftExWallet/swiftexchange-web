import { Check, Copy, ExternalLink, History, X } from 'lucide-react';
import React, { useCallback, useMemo, useRef, useState } from 'react';

import { useOrderHistory as useAsterOrderHistory } from '../../../adapters/aster/hooks/useOrderHistory';
import type { AsterOrderResponse } from '../../../adapters/aster/types/orders';
import { useHyperliquidOrderHistory } from '../../../adapters/hyperliquid/hooks/useHyperliquidOrderHistory';
import { useExchangeManager } from '../../../core/ExchangeManager';
import { TabEmptyState } from './TabEmptyState';

export type TimeRange = '1d' | '1w' | '1m' | '3m' | 'all';

interface Props {
  signer: any;
  userAddr: string;
  asterSymbol: string;
  timeRange?: TimeRange;
  hideOtherSymbols?: boolean;
  hideCanceled?: boolean;
}

const TIME_RANGES: { label: string; value: TimeRange; ms: number }[] = [
  { label: '1 day', value: '1d', ms: 24 * 60 * 60 * 1000 },
  { label: '1 week', value: '1w', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: '1 month', value: '1m', ms: 30 * 24 * 60 * 60 * 1000 },
  { label: '3 months', value: '3m', ms: 90 * 24 * 60 * 60 * 1000 },
  { label: 'All', value: 'all', ms: Infinity },
];

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

function formatSplitType(typeStr: string | undefined): { line1: string; line2?: string } {
  if (!typeStr) return { line1: 'Market' };
  const upper = typeStr.toUpperCase();
  if (upper.includes('STOP')) return { line1: 'Stop', line2: 'Market' };
  if (upper === 'MARKET') return { line1: 'Market' };
  if (upper === 'LIMIT') return { line1: 'Limit' };
  if (upper === 'CHASE') return { line1: 'Chase' };
  return { line1: typeStr.charAt(0).toUpperCase() + typeStr.slice(1).toLowerCase() };
}

function formatStatus(status: string | undefined): string {
  if (!status) return '--';
  const upper = status.toUpperCase();
  if (upper === 'FILLED') return 'Filled';
  if (upper === 'CANCELED') return 'Canceled';
  if (upper === 'EXPIRED') return 'Expired';
  if (upper === 'PARTIALLY_FILLED') return 'Partially Filled';
  if (upper === 'NEW') return 'New';
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

export const OrderHistoryTab: React.FC<Props> = ({
  signer,
  userAddr,
  asterSymbol,
  timeRange = '1w',
  hideOtherSymbols = false,
  hideCanceled = false,
}) => {
  const currentExchange = useExchangeManager(state => state.currentExchange);
  const currentNetwork = useExchangeManager(state => state.currentNetwork);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeDetailsOrder, setActiveDetailsOrder] = useState<AsterOrderResponse | null>(null);

  // Filter symbol for backend query
  const querySymbol = hideOtherSymbols ? asterSymbol : null;

  const asterHook = useAsterOrderHistory(signer, userAddr, querySymbol);
  const hlHook = useHyperliquidOrderHistory(userAddr, querySymbol);

  const { orders, isLoading, isLoadingMore, hasMore, loadMore } =
    currentExchange === 'hyperliquid' ? hlHook : asterHook;

  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || isLoadingMore || !hasMore) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 20) {
      loadMore();
    }
  }, [loadMore, isLoadingMore, hasMore]);

  const copyToClipboard = (text: string, idKey: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopiedId(idKey);
      setTimeout(() => setCopiedId(null), 1500);
    }
  };

  // Client-side filtering for time range, symbol, and canceled status
  const filteredOrders = useMemo(() => {
    const rangeObj = TIME_RANGES.find(r => r.value === timeRange);
    const minTimestamp = rangeObj && rangeObj.ms !== Infinity ? Date.now() - rangeObj.ms : 0;

    return orders.filter(o => {
      const orderTime = o.updateTime || o.time || 0;
      if (minTimestamp > 0 && orderTime < minTimestamp) return false;

      if (hideCanceled) {
        const s = (o.status || '').toUpperCase();
        if (s === 'CANCELED' || s === 'EXPIRED') return false;
      }

      if (hideOtherSymbols) {
        const cleanO = (o.symbol || '').replace('-', '').toUpperCase();
        const cleanTarget = (asterSymbol || '').replace('-', '').toUpperCase();
        if (cleanO !== cleanTarget) return false;
      }

      return true;
    });
  }, [orders, timeRange, hideCanceled, hideOtherSymbols, asterSymbol]);

  // Aster DEX explorer based on testnet or mainnet
  const asterExplorerBase =
    currentNetwork === 'mainnet'
      ? 'https://www.asterdex.com/en/explorer'
      : 'https://www.asterdex-testnet.com/en/explorer';

  if (isLoading && filteredOrders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 px-4 text-center w-full">
        <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin mb-2" />
        <span className="text-xs font-medium text-secondary">Loading order history...</span>
      </div>
    );
  }

  if (filteredOrders.length === 0) {
    return (
      <TabEmptyState
        icon={History}
        title="No order history"
        description="Past filled or cancelled orders will appear here."
      />
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-secondary text-primary select-none text-[11px]">
      {/* Table Container without extra duplicate header */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-x-auto overflow-y-auto scrollbar-none relative"
      >
        <table className="w-full text-left whitespace-nowrap border-collapse">
          <thead className="text-secondary border-b border-color sticky top-0 bg-secondary z-10 text-[11px] font-medium">
            <tr>
              <th className="px-2.5 py-1.5 font-medium">Time</th>
              <th className="px-2.5 py-1.5 font-medium">Type</th>
              <th className="px-2.5 py-1.5 font-medium">Symbol</th>
              <th className="px-2.5 py-1.5 font-medium">Side</th>
              <th className="px-2.5 py-1.5 font-medium">Filled / Order price</th>
              <th className="px-2.5 py-1.5 font-medium">Filled / Total amount</th>
              <th className="px-2.5 py-1.5 font-medium">Filled / Total value</th>
              <th className="px-2.5 py-1.5 font-medium">Trigger price</th>
              <th className="px-2.5 py-1.5 font-medium">Reduce only</th>
              <th className="px-2.5 py-1.5 font-medium">Explorer</th>
              <th className="px-2.5 py-1.5 font-medium">Status / Order ID</th>
              <th className="px-2.5 py-1.5 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-color text-[11px]">
            {filteredOrders.map(o => {
              const symInfo = parseSymbol(o.symbol);
              const isBuy = (o.side || '').toUpperCase() === 'BUY';
              const avgPriceNum = parseFloat(o.avgPrice || '0');
              const orderPriceNum = parseFloat(o.price || '0');
              const isMarket = (o.type || o.origType || '').toUpperCase() === 'MARKET';

              const execQtyNum = parseFloat(o.executedQty || '0');
              const origQtyNum = parseFloat(o.origQty || '0');

              const filledValueNum =
                parseFloat(o.cumQuote || '0') || (avgPriceNum > 0 ? execQtyNum * avgPriceNum : 0);
              const totalValueNum =
                origQtyNum *
                (avgPriceNum > 0 ? avgPriceNum : orderPriceNum > 0 ? orderPriceNum : 0);

              const triggerPriceNum = parseFloat(o.stopPrice || '0');

              // Aster DEX Explorer URL
              const explorerLink = o.newChainData?.hash
                ? `${asterExplorerBase}/tx/${o.newChainData.hash}`
                : userAddr
                  ? `${asterExplorerBase}/address/${userAddr}`
                  : null;

              const orderIdStr = String(o.orderId || '');
              const shortOrderId =
                orderIdStr.length > 8
                  ? `${orderIdStr.slice(0, 3)}...${orderIdStr.slice(-3)}`
                  : orderIdStr;

              const dateInfo = formatSplitDate(o.updateTime || o.time || 0);
              const typeInfo = formatSplitType(o.type || o.origType);

              return (
                <tr
                  key={o.orderId || o.clientOrderId}
                  className="border-b border-color hover:bg-hover transition-colors"
                >
                  {/* Time (2 rows: Date on line 1, Time on line 2) */}
                  <td className="px-2.5 py-2">
                    <div className="flex flex-col gap-0.5 font-mono-tabular">
                      <span className="text-secondary text-[11px] leading-tight">
                        {dateInfo.date}
                      </span>
                      <span className="text-muted text-[10px] leading-tight">{dateInfo.time}</span>
                    </div>
                  </td>

                  {/* Type (2 rows if Stop Market) */}
                  <td className="px-2.5 py-2">
                    <div className="flex flex-col gap-0.5 font-medium">
                      <span className="text-primary text-[11px] leading-tight">
                        {typeInfo.line1}
                      </span>
                      {typeInfo.line2 && (
                        <span className="text-primary text-[11px] leading-tight">
                          {typeInfo.line2}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Symbol */}
                  <td className="px-2.5 py-2 text-primary font-medium">{symInfo.display}</td>

                  {/* Side */}
                  <td
                    className={`px-2.5 py-2 font-medium ${isBuy ? 'text-success' : 'text-danger'}`}
                  >
                    {isBuy ? 'Buy' : 'Sell'}
                  </td>

                  {/* Filled / Order price (2 clean lines with no overlap) */}
                  <td className="px-2.5 py-2 font-mono-tabular">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-primary text-[11px] leading-tight">
                        {avgPriceNum > 0 ? formatNum(avgPriceNum, 2, 4) : '--'}
                      </span>
                      <span className="text-muted text-[10px] leading-tight">
                        {isMarket ? 'Market' : formatNum(orderPriceNum, 2, 4)}
                      </span>
                    </div>
                  </td>

                  {/* Filled / Total amount (2 clean lines) */}
                  <td className="px-2.5 py-2 font-mono-tabular">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-primary text-[11px] leading-tight">
                        {formatNum(execQtyNum, 2, 4)} {symInfo.base}
                      </span>
                      <span className="text-muted text-[10px] leading-tight">
                        {formatNum(origQtyNum, 2, 4)} {symInfo.base}
                      </span>
                    </div>
                  </td>

                  {/* Filled / Total value (2 clean lines) */}
                  <td className="px-2.5 py-2 font-mono-tabular">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-primary text-[11px] leading-tight">
                        {formatNum(filledValueNum, 2, 2)} {symInfo.quote}
                      </span>
                      <span className="text-muted text-[10px] leading-tight">
                        {formatNum(totalValueNum, 2, 2)} {symInfo.quote}
                      </span>
                    </div>
                  </td>

                  {/* Trigger price (2 rows if trigger active) */}
                  <td className="px-2.5 py-2 font-mono-tabular">
                    {triggerPriceNum > 0 ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-muted text-[10px] leading-tight">Last price</span>
                        <span className="text-primary text-[11px] leading-tight">
                          {`>= ${formatNum(triggerPriceNum, 2, 2)}`}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted">--</span>
                    )}
                  </td>

                  {/* Reduce only */}
                  <td className="px-2.5 py-2 text-primary">{o.reduceOnly ? 'Yes' : 'No'}</td>

                  {/* Explorer (Aster DEX Explorer) */}
                  <td className="px-2.5 py-2">
                    {explorerLink ? (
                      <a
                        href={explorerLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand hover:underline inline-flex items-center gap-1 transition-colors"
                      >
                        <span>View Explorer</span>
                        <ExternalLink size={10} />
                      </a>
                    ) : (
                      <span className="text-muted">--</span>
                    )}
                  </td>

                  {/* Status / Order ID (2 clean lines) */}
                  <td className="px-2.5 py-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-primary font-medium text-[11px] leading-tight">
                        {formatStatus(o.status)}
                      </span>
                      <div className="flex items-center gap-1 text-muted text-[10px] font-mono-tabular leading-tight">
                        <span>{shortOrderId}</span>
                        <button
                          onClick={() => copyToClipboard(orderIdStr, orderIdStr)}
                          title="Copy full Order ID"
                          className="hover:text-primary transition-colors p-0.5"
                        >
                          {copiedId === orderIdStr ? (
                            <Check size={11} className="text-success" />
                          ) : (
                            <Copy size={11} />
                          )}
                        </button>
                      </div>
                    </div>
                  </td>

                  {/* Action */}
                  <td className="px-2.5 py-2 text-right">
                    <button
                      onClick={() => setActiveDetailsOrder(o)}
                      className="px-2.5 py-0.5 rounded border border-color text-secondary hover:text-primary hover:border-brand bg-tertiary transition-colors text-[10px]"
                    >
                      Details
                    </button>
                  </td>
                </tr>
              );
            })}

            {isLoadingMore && (
              <tr>
                <td colSpan={12} className="px-4 py-1.5 text-center text-muted text-[10px]">
                  Loading more orders...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Order Details Modal */}
      {activeDetailsOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="w-full max-w-md bg-secondary border border-color rounded-lg shadow-2xl p-5 relative text-primary">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-color">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">Order Details</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                    (activeDetailsOrder.side || '').toUpperCase() === 'BUY'
                      ? 'bg-success/15 text-success'
                      : 'bg-danger/15 text-danger'
                  }`}
                >
                  {activeDetailsOrder.side}
                </span>
              </div>
              <button
                onClick={() => setActiveDetailsOrder(null)}
                className="text-muted hover:text-primary p-1 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2.5 text-[11px]">
              <div className="flex justify-between py-1 border-b border-color">
                <span className="text-secondary">Symbol</span>
                <span className="font-medium font-mono-tabular">
                  {parseSymbol(activeDetailsOrder.symbol).display}
                </span>
              </div>

              <div className="flex justify-between py-1 border-b border-color">
                <span className="text-secondary">Order ID</span>
                <div className="flex items-center gap-1.5 font-mono-tabular">
                  <span>{activeDetailsOrder.orderId}</span>
                  <button
                    onClick={() =>
                      copyToClipboard(
                        String(activeDetailsOrder.orderId),
                        `modal-${activeDetailsOrder.orderId}`
                      )
                    }
                    className="hover:text-brand text-muted"
                  >
                    {copiedId === `modal-${activeDetailsOrder.orderId}` ? (
                      <Check size={12} className="text-success" />
                    ) : (
                      <Copy size={12} />
                    )}
                  </button>
                </div>
              </div>

              {activeDetailsOrder.clientOrderId && (
                <div className="flex justify-between py-1 border-b border-color">
                  <span className="text-secondary">Client Order ID</span>
                  <span className="font-mono-tabular text-secondary truncate max-w-[200px]">
                    {activeDetailsOrder.clientOrderId}
                  </span>
                </div>
              )}

              <div className="flex justify-between py-1 border-b border-color">
                <span className="text-secondary">Type</span>
                <span>
                  {formatSplitType(activeDetailsOrder.type || activeDetailsOrder.origType).line1}
                </span>
              </div>

              <div className="flex justify-between py-1 border-b border-color">
                <span className="text-secondary">Status</span>
                <span className="font-medium">{formatStatus(activeDetailsOrder.status)}</span>
              </div>

              <div className="flex justify-between py-1 border-b border-color">
                <span className="text-secondary">Order Price</span>
                <span className="font-mono-tabular">
                  {formatSplitType(activeDetailsOrder.type).line1 === 'Market'
                    ? 'Market'
                    : formatNum(activeDetailsOrder.price, 2, 4)}
                </span>
              </div>

              <div className="flex justify-between py-1 border-b border-color">
                <span className="text-secondary">Avg Executed Price</span>
                <span className="font-mono-tabular">
                  {formatNum(activeDetailsOrder.avgPrice, 2, 4)}
                </span>
              </div>

              <div className="flex justify-between py-1 border-b border-color">
                <span className="text-secondary">Executed / Total Qty</span>
                <span className="font-mono-tabular">
                  {formatNum(activeDetailsOrder.executedQty, 2, 4)} /{' '}
                  {formatNum(activeDetailsOrder.origQty, 2, 4)}{' '}
                  {parseSymbol(activeDetailsOrder.symbol).base}
                </span>
              </div>

              <div className="flex justify-between py-1 border-b border-color">
                <span className="text-secondary">Executed Value</span>
                <span className="font-mono-tabular">
                  {formatNum(activeDetailsOrder.cumQuote, 2, 2)}{' '}
                  {parseSymbol(activeDetailsOrder.symbol).quote}
                </span>
              </div>

              <div className="flex justify-between py-1 border-b border-color">
                <span className="text-secondary">Time</span>
                <span className="text-secondary">
                  {
                    formatSplitDate(activeDetailsOrder.updateTime || activeDetailsOrder.time || 0)
                      .date
                  }{' '}
                  {
                    formatSplitDate(activeDetailsOrder.updateTime || activeDetailsOrder.time || 0)
                      .time
                  }
                </span>
              </div>

              <div className="flex justify-between py-1 border-b border-color">
                <span className="text-secondary">Reduce Only</span>
                <span>{activeDetailsOrder.reduceOnly ? 'Yes' : 'No'}</span>
              </div>

              {activeDetailsOrder.newChainData?.hash && (
                <div className="flex justify-between py-1 border-b border-color">
                  <span className="text-secondary">Transaction Hash</span>
                  <a
                    href={`${asterExplorerBase}/tx/${activeDetailsOrder.newChainData.hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand hover:underline flex items-center gap-1 font-mono-tabular"
                  >
                    <span>
                      {activeDetailsOrder.newChainData.hash.slice(0, 6)}...
                      {activeDetailsOrder.newChainData.hash.slice(-6)}
                    </span>
                    <ExternalLink size={10} />
                  </a>
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setActiveDetailsOrder(null)}
                className="px-4 py-1.5 bg-tertiary hover:bg-hover text-primary border border-color rounded transition-colors text-xs font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
