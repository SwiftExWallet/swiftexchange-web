import { Check, Copy, ExternalLink, History, X } from 'lucide-react';
import React, { useCallback, useMemo, useRef, useState } from 'react';

import { useOrderHistory as useAsterOrderHistory } from '../../../adapters/aster/hooks/useOrderHistory';
import type { AsterOrderResponse } from '../../../adapters/aster/types/orders';
import { useHyperliquidOrderHistory } from '../../../adapters/hyperliquid/hooks/useHyperliquidOrderHistory';
import { useExchangeManager } from '../../../core/ExchangeManager';
import { getPerpExplorerAddressUrl, getPerpExplorerTxUrl } from '../../../utils/explorer';
import { safeFormatNumber } from '../../../utils/precision';
import { TabEmptyState } from './TabEmptyState';

export type TimeRange = '1d' | '1w';

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
  return safeFormatNumber(val, minDec, maxDec, fallback);
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

  const querySymbol = hideOtherSymbols ? asterSymbol : null;

  const asterHook = useAsterOrderHistory(
    currentExchange === 'aster' ? signer : null,
    currentExchange === 'aster' ? userAddr : null,
    querySymbol,
    timeRange
  );
  const hlHook = useHyperliquidOrderHistory(
    currentExchange === 'hyperliquid' ? userAddr : null,
    querySymbol
  );

  const { orders, isLoading, isLoadingMore, hasMore, loadMore } =
    currentExchange === 'hyperliquid' ? hlHook : asterHook;

  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || isLoadingMore || !hasMore) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 120) {
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

  const explorerAddressUrl = getPerpExplorerAddressUrl(currentExchange, currentNetwork, userAddr);

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
      <div className="w-full h-full flex flex-col justify-between">
        <TabEmptyState
          icon={History}
          title="No order history"
          description="Past filled or cancelled orders will appear here."
        />
        <div className="px-3 py-2 flex items-center justify-end text-[11px] text-secondary shrink-0 bg-secondary">
          <a
            href={explorerAddressUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand hover:underline inline-flex items-center gap-1 font-medium text-[11px]"
          >
            <span>Export more historical data</span>
            <ExternalLink size={11} />
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-secondary text-primary select-none text-[11px]">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-x-auto overflow-y-auto relative"
      >
        <div className="md:hidden space-y-2 p-2">
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
              origQtyNum * (avgPriceNum > 0 ? avgPriceNum : orderPriceNum > 0 ? orderPriceNum : 0);
            const dateInfo = formatSplitDate(o.updateTime || o.time || 0);
            const typeInfo = formatSplitType(o.type || o.origType);
            const explorerLink = getPerpExplorerTxUrl(
              currentExchange,
              currentNetwork,
              o.newChainData?.hash,
              userAddr
            );

            return (
              <div
                key={o.orderId || o.clientOrderId}
                className="bg-card/40 border border-white/[0.04] rounded-lg p-3 space-y-2 text-[11px]"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-primary">{symInfo.display}</span>
                    <span
                      className={`font-semibold px-1.5 py-0.5 rounded text-[10px] ${
                        isBuy ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'
                      }`}
                    >
                      {isBuy ? 'Buy' : 'Sell'}
                    </span>
                    <span className="text-secondary text-[10px]">{typeInfo.line1}</span>
                  </div>
                  <span className="text-muted text-[10px]">
                    {dateInfo.date} {dateInfo.time}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 py-1.5 border-y border-white/[0.04] text-[10px]">
                  <div>
                    <span className="text-secondary block">Price</span>
                    <span className="text-primary font-mono-tabular">
                      {avgPriceNum > 0 ? formatNum(avgPriceNum, 2, 4) : '--'}
                      <span className="text-muted ml-1">
                        / {isMarket ? 'Mkt' : formatNum(orderPriceNum, 2, 4)}
                      </span>
                    </span>
                  </div>
                  <div>
                    <span className="text-secondary block">Amount</span>
                    <span className="text-primary font-mono-tabular">
                      {formatNum(execQtyNum, 2, 4)} / {formatNum(origQtyNum, 2, 4)} {symInfo.base}
                    </span>
                  </div>
                  <div>
                    <span className="text-secondary block">Value</span>
                    <span className="text-primary font-mono-tabular">
                      {formatNum(filledValueNum, 2, 2)} / {formatNum(totalValueNum, 2, 2)}{' '}
                      {symInfo.quote}
                    </span>
                  </div>
                  <div>
                    <span className="text-secondary block">Status</span>
                    <span className="text-primary font-medium">{formatStatus(o.status)}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-0.5">
                  <div className="flex items-center gap-2">
                    {explorerLink && (
                      <a
                        href={explorerLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand hover:underline inline-flex items-center gap-1 text-[10px]"
                      >
                        <span>Explorer</span>
                        <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                  <button
                    onClick={() => setActiveDetailsOrder(o)}
                    className="px-2.5 py-0.5 rounded border border-white/[0.08] text-secondary hover:text-primary hover:border-brand bg-tertiary transition-colors text-[10px]"
                  >
                    Details
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="hidden md:block">
          <table className="w-full text-left whitespace-nowrap border-collapse">
            <thead className="text-secondary border-b border-white/[0.04] sticky top-0 bg-secondary z-10 text-[11px] font-medium">
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
            <tbody className="text-[11px]">
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

                const explorerLink = getPerpExplorerTxUrl(
                  currentExchange,
                  currentNetwork,
                  o.newChainData?.hash,
                  userAddr
                );

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
                    className="border-b border-white/[0.03] hover:bg-hover/60 transition-colors"
                  >
                    <td className="px-2.5 py-2">
                      <div className="flex flex-col gap-0.5 font-mono-tabular">
                        <span className="text-secondary text-[11px] leading-tight">
                          {dateInfo.date}
                        </span>
                        <span className="text-muted text-[10px] leading-tight">
                          {dateInfo.time}
                        </span>
                      </div>
                    </td>

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

                    <td className="px-2.5 py-2 text-primary font-medium">{symInfo.display}</td>

                    <td
                      className={`px-2.5 py-2 font-medium ${isBuy ? 'text-success' : 'text-danger'}`}
                    >
                      {isBuy ? 'Buy' : 'Sell'}
                    </td>

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

                    <td className="px-2.5 py-2 text-primary">{o.reduceOnly ? 'Yes' : 'No'}</td>

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

                    <td className="px-2.5 py-2 text-right">
                      <button
                        onClick={() => setActiveDetailsOrder(o)}
                        className="px-2.5 py-0.5 rounded border border-white/[0.08] text-secondary hover:text-primary hover:border-brand bg-tertiary transition-colors text-[10px]"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {isLoadingMore && (
          <div className="py-2.5 text-center text-muted text-[10px] flex items-center justify-center gap-1.5">
            <div className="w-3.5 h-3.5 border border-brand border-t-transparent rounded-full animate-spin" />
            <span>Loading more orders...</span>
          </div>
        )}
      </div>

      <div className="px-3 py-2 flex items-center justify-between text-[11px] text-secondary shrink-0 bg-secondary">
        <span className="text-muted text-[10px]">Showing {filteredOrders.length} records</span>
        <a
          href={explorerAddressUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand hover:underline inline-flex items-center gap-1 font-medium text-[11px]"
        >
          <span>Export more historical data</span>
          <ExternalLink size={11} />
        </a>
      </div>

      {/* Order Details Modal */}
      {activeDetailsOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="w-full max-w-md bg-secondary border border-white/[0.08] rounded-lg shadow-2xl p-5 relative text-primary">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-white/[0.08]">
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
              <div className="flex justify-between py-1 border-b border-white/[0.04]">
                <span className="text-secondary">Symbol</span>
                <span className="font-medium font-mono-tabular">
                  {parseSymbol(activeDetailsOrder.symbol).display}
                </span>
              </div>

              <div className="flex justify-between py-1 border-b border-white/[0.04]">
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
                <div className="flex justify-between py-1 border-b border-white/[0.04]">
                  <span className="text-secondary">Client Order ID</span>
                  <span className="font-mono-tabular text-secondary truncate max-w-[200px]">
                    {activeDetailsOrder.clientOrderId}
                  </span>
                </div>
              )}

              <div className="flex justify-between py-1 border-b border-white/[0.04]">
                <span className="text-secondary">Type</span>
                <span>
                  {formatSplitType(activeDetailsOrder.type || activeDetailsOrder.origType).line1}
                </span>
              </div>

              <div className="flex justify-between py-1 border-b border-white/[0.04]">
                <span className="text-secondary">Status</span>
                <span className="font-medium">{formatStatus(activeDetailsOrder.status)}</span>
              </div>

              <div className="flex justify-between py-1 border-b border-white/[0.04]">
                <span className="text-secondary">Order Price</span>
                <span className="font-mono-tabular">
                  {formatSplitType(activeDetailsOrder.type).line1 === 'Market'
                    ? 'Market'
                    : formatNum(activeDetailsOrder.price, 2, 4)}
                </span>
              </div>

              <div className="flex justify-between py-1 border-b border-white/[0.04]">
                <span className="text-secondary">Avg Executed Price</span>
                <span className="font-mono-tabular">
                  {formatNum(activeDetailsOrder.avgPrice, 2, 4)}
                </span>
              </div>

              <div className="flex justify-between py-1 border-b border-white/[0.04]">
                <span className="text-secondary">Executed / Total Qty</span>
                <span className="font-mono-tabular">
                  {formatNum(activeDetailsOrder.executedQty, 2, 4)} /{' '}
                  {formatNum(activeDetailsOrder.origQty, 2, 4)}{' '}
                  {parseSymbol(activeDetailsOrder.symbol).base}
                </span>
              </div>

              <div className="flex justify-between py-1 border-b border-white/[0.04]">
                <span className="text-secondary">Executed Value</span>
                <span className="font-mono-tabular">
                  {formatNum(activeDetailsOrder.cumQuote, 2, 2)}{' '}
                  {parseSymbol(activeDetailsOrder.symbol).quote}
                </span>
              </div>

              <div className="flex justify-between py-1 border-b border-white/[0.04]">
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

              <div className="flex justify-between py-1 border-b border-white/[0.04]">
                <span className="text-secondary">Reduce Only</span>
                <span>{activeDetailsOrder.reduceOnly ? 'Yes' : 'No'}</span>
              </div>

              {activeDetailsOrder.newChainData?.hash && (
                <div className="flex justify-between py-1 border-b border-white/[0.04]">
                  <span className="text-secondary">Transaction Hash</span>
                  <a
                    href={getPerpExplorerTxUrl(
                      currentExchange,
                      currentNetwork,
                      activeDetailsOrder.newChainData.hash,
                      userAddr
                    )}
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
                className="px-4 py-1.5 bg-tertiary hover:bg-hover text-primary border border-white/[0.08] rounded transition-colors text-xs font-medium"
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
