import { ArrowUpDown, ExternalLink, Share2, X } from 'lucide-react';
import React, { useCallback, useMemo, useRef, useState } from 'react';

import { useTradeHistory as useAsterTradeHistory } from '../../../adapters/aster/hooks/useTradeHistory';
import type { AsterUserTrade } from '../../../adapters/aster/types/account';
import { useHyperliquidTradeHistory } from '../../../adapters/hyperliquid/hooks/useHyperliquidTradeHistory';
import { useExchangeManager } from '../../../core/ExchangeManager';
import { safeFormatNumber } from '../../../utils/precision';
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

function formatFee(feeVal: string | number, asset: string = 'ASTER'): string {
  const num = typeof feeVal === 'string' ? parseFloat(feeVal) : feeVal;
  if (!Number.isFinite(num) || num === 0) return `0.00 ${asset}`;
  const absNum = Math.abs(num);
  const formatted = safeFormatNumber(absNum, 2, 8, '0.00');
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

  const asterHook = useAsterTradeHistory(
    currentExchange === 'aster' ? signer : null,
    currentExchange === 'aster' ? userAddr : null,
    querySymbol,
    timeRange
  );
  const hlHook = useHyperliquidTradeHistory(
    currentExchange === 'hyperliquid' ? userAddr : null,
    querySymbol
  );

  const { trades, isLoading, isLoadingMore, hasMore, loadMore } =
    currentExchange === 'hyperliquid' ? hlHook : asterHook;

  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || isLoadingMore || !hasMore) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 120) {
      loadMore();
    }
  }, [loadMore, isLoadingMore, hasMore]);

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
      <div className="w-full h-full flex flex-col justify-between">
        <TabEmptyState
          icon={ArrowUpDown}
          title="No trade history"
          description="Your executed trades and fills will appear here."
        />
        <div className="px-3 py-2 flex items-center justify-end text-[11px] text-secondary shrink-0 bg-secondary">
          <a
            href={userAddr ? `${asterExplorerBase}/address/${userAddr}` : asterExplorerBase}
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
              <div
                key={t.id}
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
                    <span className="text-secondary text-[10px]">{role}</span>
                  </div>
                  <span className="text-muted text-[10px]">
                    {dateInfo.date} {dateInfo.time}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 py-1.5 border-y border-white/[0.04] text-[10px]">
                  <div>
                    <span className="text-secondary block">Price</span>
                    <span className="text-primary font-mono-tabular">
                      {formatNum(priceNum, 2, 4)}
                    </span>
                  </div>
                  <div>
                    <span className="text-secondary block">Amount</span>
                    <span className="text-primary font-mono-tabular">
                      {formatNum(qtyNum, 2, 4)} {symInfo.base}
                    </span>
                  </div>
                  <div>
                    <span className="text-secondary block">Value</span>
                    <span className="text-primary font-mono-tabular">
                      {formatNum(quoteQtyNum, 2, 2)} {symInfo.quote}
                    </span>
                  </div>
                  <div>
                    <span className="text-secondary block">Fee</span>
                    <span className="text-secondary font-mono-tabular">
                      {formatFee(t.commission, t.commissionAsset || 'ASTER')}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-secondary text-[10px]">PnL:</span>
                    <span
                      className={`font-mono-tabular font-medium text-[10px] ${
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
                  </div>
                  <button
                    onClick={() => setActiveShareTrade(t)}
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
            <tbody className="text-[11px]">
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
                  <tr
                    key={t.id}
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

                    <td className="px-2.5 py-2 text-primary font-medium">{symInfo.display}</td>

                    <td
                      className={`px-2.5 py-2 font-medium ${isBuy ? 'text-success' : 'text-danger'}`}
                    >
                      {isBuy ? 'Buy' : 'Sell'}
                    </td>

                    <td className="px-2.5 py-2 text-primary font-mono-tabular">
                      {formatNum(priceNum, 2, 4)}
                    </td>

                    <td className="px-2.5 py-2 text-primary font-mono-tabular">
                      {formatNum(qtyNum, 2, 4)} {symInfo.base}
                    </td>

                    <td className="px-2.5 py-2 text-primary font-mono-tabular">
                      {formatNum(quoteQtyNum, 2, 2)} {symInfo.quote}
                    </td>

                    <td className="px-2.5 py-2 text-secondary font-mono-tabular">
                      {formatFee(t.commission, t.commissionAsset || 'ASTER')}
                    </td>

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

                    <td className="px-2.5 py-2 text-right text-secondary">{role}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {isLoadingMore && (
          <div className="py-2.5 text-center text-muted text-[10px] flex items-center justify-center gap-1.5">
            <div className="w-3.5 h-3.5 border border-brand border-t-transparent rounded-full animate-spin" />
            <span>Loading more trades...</span>
          </div>
        )}
      </div>

      <div className="px-3 py-2 flex items-center justify-between text-[11px] text-secondary shrink-0 bg-secondary">
        <span className="text-muted text-[10px]">Showing {filteredTrades.length} records</span>
        <a
          href={userAddr ? `${asterExplorerBase}/address/${userAddr}` : asterExplorerBase}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand hover:underline inline-flex items-center gap-1 font-medium text-[11px]"
        >
          <span>Export more historical data</span>
          <ExternalLink size={11} />
        </a>
      </div>

      {/* Share / Trade Details Modal */}
      {activeShareTrade && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="w-full max-w-sm bg-secondary border border-white/[0.08] rounded-lg shadow-2xl p-5 relative text-primary">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-white/[0.08]">
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
              <div className="flex justify-between py-1 border-b border-white/[0.04]">
                <span className="text-secondary">Trade ID</span>
                <span className="font-mono-tabular">{activeShareTrade.id}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/[0.04]">
                <span className="text-secondary">Order ID</span>
                <span className="font-mono-tabular">{activeShareTrade.orderId}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/[0.04]">
                <span className="text-secondary">Symbol</span>
                <span className="font-medium font-mono-tabular">
                  {parseSymbol(activeShareTrade.symbol).display}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/[0.04]">
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
              <div className="flex justify-between py-1 border-b border-white/[0.04]">
                <span className="text-secondary">Execution Price</span>
                <span className="font-mono-tabular">{formatNum(activeShareTrade.price, 2, 4)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/[0.04]">
                <span className="text-secondary">Executed Amount</span>
                <span className="font-mono-tabular">
                  {formatNum(activeShareTrade.qty, 2, 4)}{' '}
                  {parseSymbol(activeShareTrade.symbol).base}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/[0.04]">
                <span className="text-secondary">Executed Value</span>
                <span className="font-mono-tabular">
                  {formatNum(activeShareTrade.quoteQty, 2, 2)}{' '}
                  {parseSymbol(activeShareTrade.symbol).quote}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/[0.04]">
                <span className="text-secondary">Fee</span>
                <span className="font-mono-tabular text-secondary">
                  {formatFee(
                    activeShareTrade.commission,
                    activeShareTrade.commissionAsset || 'ASTER'
                  )}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/[0.04]">
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
              <div className="flex justify-between py-1 border-b border-white/[0.04]">
                <span className="text-secondary">Role</span>
                <span>{activeShareTrade.maker ? 'Maker' : 'Taker'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/[0.04]">
                <span className="text-secondary">Time</span>
                <span className="text-secondary">
                  {formatSplitDate(activeShareTrade.time).date}{' '}
                  {formatSplitDate(activeShareTrade.time).time}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/[0.04]">
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
