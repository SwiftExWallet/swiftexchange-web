import { ArrowUpDown, ExternalLink, Share2, X } from 'lucide-react';
import React, { useCallback, useMemo, useRef, useState } from 'react';

import { useTradeHistory as useAsterTradeHistory } from '../../../adapters/aster/hooks/useTradeHistory';
import type { AsterUserTrade } from '../../../adapters/aster/types/account';
import { useHyperliquidTradeHistory } from '../../../adapters/hyperliquid/hooks/useHyperliquidTradeHistory';
import { useExchangeManager } from '../../../core/ExchangeManager';
import type { TimeRange } from './OrderHistoryTab';
import { TabEmptyState } from './TabEmptyState';

interface Props {
  signer: any;
  userAddr: string;
  asterSymbol: string;
  timeRange?: TimeRange;
  hideOtherSymbols?: boolean;
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

function formatFee(feeVal: string | number, asset: string = 'ASTER'): string {
  const num = typeof feeVal === 'string' ? parseFloat(feeVal) : feeVal;
  if (isNaN(num) || num === 0) return `0.00 ${asset}`;
  const absNum = Math.abs(num);
  const formatted = absNum.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  });
  return `-${formatted} ${asset}`;
}

export const TradeHistoryTab: React.FC<Props> = ({
  signer,
  userAddr,
  asterSymbol,
  timeRange = '1w',
  hideOtherSymbols = false,
}) => {
  const currentExchange = useExchangeManager(state => state.currentExchange);
  const currentNetwork = useExchangeManager(state => state.currentNetwork);

  const [activeShareTrade, setActiveShareTrade] = useState<AsterUserTrade | null>(null);

  const querySymbol = hideOtherSymbols ? asterSymbol : null;

  const asterHook = useAsterTradeHistory(signer, userAddr, querySymbol);
  const hlHook = useHyperliquidTradeHistory(userAddr, querySymbol);

  const { trades, isLoading, isLoadingMore, hasMore, loadMore } =
    currentExchange === 'hyperliquid' ? hlHook : asterHook;

  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || isLoadingMore || !hasMore) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 20) {
      loadMore();
    }
  }, [loadMore, isLoadingMore, hasMore]);

  // Client-side filtering for time range and symbol
  const filteredTrades = useMemo(() => {
    const rangeObj = TIME_RANGES.find(r => r.value === timeRange);
    const minTimestamp = rangeObj && rangeObj.ms !== Infinity ? Date.now() - rangeObj.ms : 0;

    return trades.filter(t => {
      if (minTimestamp > 0 && t.time < minTimestamp) return false;

      if (hideOtherSymbols) {
        const cleanT = (t.symbol || '').replace('-', '').toUpperCase();
        const cleanTarget = (asterSymbol || '').replace('-', '').toUpperCase();
        if (cleanT !== cleanTarget) return false;
      }

      return true;
    });
  }, [trades, timeRange, hideOtherSymbols, asterSymbol]);

  // Aster DEX explorer base URL
  const asterExplorerBase =
    currentNetwork === 'mainnet'
      ? 'https://www.asterdex.com/en/explorer'
      : 'https://www.asterdex-testnet.com/en/explorer';

  if (isLoading && filteredTrades.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 px-4 text-center w-full">
        <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin mb-2" />
        <span className="text-xs font-medium text-secondary">Loading trade history...</span>
      </div>
    );
  }

  if (filteredTrades.length === 0) {
    return (
      <TabEmptyState
        icon={ArrowUpDown}
        title="No trade history"
        description="Your executed trades and fills will appear here."
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
              <th className="px-2.5 py-1.5 font-medium">Symbol</th>
              <th className="px-2.5 py-1.5 font-medium">Side</th>
              <th className="px-2.5 py-1.5 font-medium">Order price</th>
              <th className="px-2.5 py-1.5 font-medium">Executed amount</th>
              <th className="px-2.5 py-1.5 font-medium">Executed value</th>
              <th className="px-2.5 py-1.5 font-medium">Fee</th>
              <th className="px-2.5 py-1.5 font-medium">Realized profit</th>
              <th className="px-2.5 py-1.5 font-medium text-right">Role</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-color text-[11px]">
            {filteredTrades.map(t => {
              const symInfo = parseSymbol(t.symbol);
              const isBuy = (t.side || '').toUpperCase() === 'BUY';
              const priceNum = parseFloat(t.price || '0');
              const qtyNum = parseFloat(t.qty || '0');
              const quoteQtyNum = parseFloat(t.quoteQty || '0') || priceNum * qtyNum;
              const pnlNum = parseFloat(t.realizedPnl || '0');
              const isPnlPositive = pnlNum > 0;
              const isPnlNegative = pnlNum < 0;

              const role = t.maker ? 'Maker' : 'Taker';
              const marginUnit = t.marginAsset || 'USDT';
              const dateInfo = formatSplitDate(t.time);

              return (
                <tr key={t.id} className="border-b border-color hover:bg-hover transition-colors">
                  {/* Time (2 rows: Date on line 1, Time on line 2) */}
                  <td className="px-2.5 py-2">
                    <div className="flex flex-col gap-0.5 font-mono-tabular">
                      <span className="text-secondary text-[11px] leading-tight">
                        {dateInfo.date}
                      </span>
                      <span className="text-muted text-[10px] leading-tight">{dateInfo.time}</span>
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

                  {/* Order price */}
                  <td className="px-2.5 py-2 text-primary font-mono-tabular">
                    {formatNum(priceNum, 2, 4)}
                  </td>

                  {/* Executed amount */}
                  <td className="px-2.5 py-2 text-primary font-mono-tabular">
                    {formatNum(qtyNum, 2, 4)} {symInfo.base}
                  </td>

                  {/* Executed value */}
                  <td className="px-2.5 py-2 text-primary font-mono-tabular">
                    {formatNum(quoteQtyNum, 2, 2)} {symInfo.quote}
                  </td>

                  {/* Fee */}
                  <td className="px-2.5 py-2 text-secondary font-mono-tabular">
                    {formatFee(t.commission, t.commissionAsset || 'ASTER')}
                  </td>

                  {/* Realized profit with share icon */}
                  <td className="px-2.5 py-2 font-mono-tabular">
                    <div className="inline-flex items-center gap-1.5">
                      <span
                        className={`font-medium ${
                          isPnlPositive
                            ? 'text-success'
                            : isPnlNegative
                              ? 'text-danger'
                              : 'text-secondary'
                        }`}
                      >
                        {isPnlPositive ? '+' : ''}
                        {formatNum(pnlNum, 2, 2)} {marginUnit}
                      </span>
                      <button
                        onClick={() => setActiveShareTrade(t)}
                        title="Share PnL"
                        className="text-secondary hover:text-brand transition-colors p-0.5"
                      >
                        <ExternalLink size={11} />
                      </button>
                    </div>
                  </td>

                  {/* Role */}
                  <td className="px-2.5 py-2 text-right text-secondary">{role}</td>
                </tr>
              );
            })}

            {isLoadingMore && (
              <tr>
                <td colSpan={9} className="px-4 py-1.5 text-center text-muted text-[10px]">
                  Loading more trades...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Share / Trade Details Modal */}
      {activeShareTrade && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="w-full max-w-sm bg-secondary border border-color rounded-lg shadow-2xl p-5 relative text-primary">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-color">
              <div className="flex items-center gap-2">
                <Share2 size={16} className="text-brand" />
                <span className="font-semibold text-sm">Trade Fill Details</span>
              </div>
              <button
                onClick={() => setActiveShareTrade(null)}
                className="text-muted hover:text-primary p-1 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2.5 text-[11px]">
              <div className="flex justify-between py-1 border-b border-color">
                <span className="text-secondary">Trade ID</span>
                <span className="font-mono-tabular">{activeShareTrade.id}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-color">
                <span className="text-secondary">Order ID</span>
                <span className="font-mono-tabular">{activeShareTrade.orderId}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-color">
                <span className="text-secondary">Symbol</span>
                <span className="font-medium font-mono-tabular">
                  {parseSymbol(activeShareTrade.symbol).display}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-color">
                <span className="text-secondary">Side</span>
                <span
                  className={`font-medium ${
                    (activeShareTrade.side || '').toUpperCase() === 'BUY'
                      ? 'text-success'
                      : 'text-danger'
                  }`}
                >
                  {activeShareTrade.side}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-color">
                <span className="text-secondary">Execution Price</span>
                <span className="font-mono-tabular">{formatNum(activeShareTrade.price, 2, 4)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-color">
                <span className="text-secondary">Executed Amount</span>
                <span className="font-mono-tabular">
                  {formatNum(activeShareTrade.qty, 2, 4)}{' '}
                  {parseSymbol(activeShareTrade.symbol).base}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-color">
                <span className="text-secondary">Executed Value</span>
                <span className="font-mono-tabular">
                  {formatNum(activeShareTrade.quoteQty, 2, 2)}{' '}
                  {parseSymbol(activeShareTrade.symbol).quote}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-color">
                <span className="text-secondary">Fee</span>
                <span className="font-mono-tabular text-secondary">
                  {formatFee(
                    activeShareTrade.commission,
                    activeShareTrade.commissionAsset || 'ASTER'
                  )}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-color">
                <span className="text-secondary">Realized Profit</span>
                <span
                  className={`font-mono-tabular font-medium ${
                    parseFloat(activeShareTrade.realizedPnl || '0') > 0
                      ? 'text-success'
                      : parseFloat(activeShareTrade.realizedPnl || '0') < 0
                        ? 'text-danger'
                        : 'text-secondary'
                  }`}
                >
                  {parseFloat(activeShareTrade.realizedPnl || '0') > 0 ? '+' : ''}
                  {formatNum(activeShareTrade.realizedPnl, 2, 2)}{' '}
                  {activeShareTrade.marginAsset || 'USDT'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-color">
                <span className="text-secondary">Role</span>
                <span>{activeShareTrade.maker ? 'Maker' : 'Taker'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-color">
                <span className="text-secondary">Time</span>
                <span className="text-secondary">
                  {formatSplitDate(activeShareTrade.time).date}{' '}
                  {formatSplitDate(activeShareTrade.time).time}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-color">
                <span className="text-secondary">Explorer</span>
                <a
                  href={
                    userAddr ? `${asterExplorerBase}/address/${userAddr}` : `${asterExplorerBase}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand hover:underline flex items-center gap-1 font-mono-tabular"
                >
                  <span>View on Aster Explorer</span>
                  <ExternalLink size={10} />
                </a>
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setActiveShareTrade(null)}
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
