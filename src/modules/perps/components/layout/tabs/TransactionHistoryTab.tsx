import { ExternalLink, Loader2, Receipt } from 'lucide-react';
import React, { useCallback, useMemo, useRef } from 'react';

import { useTransactionHistory } from '../../../adapters/aster/hooks/useTransactionHistory';
import { useExchangeManager } from '../../../core/ExchangeManager';
import { getPerpExplorerAddressUrl } from '../../../utils/explorer';
import type { TimeRange } from './OrderHistoryTab';
import { TabEmptyState } from './TabEmptyState';

interface Props {
  signer: any;
  userAddr: string;
  timeRange?: TimeRange;
  hideOtherSymbols?: boolean;
  asterSymbol?: string;
}

const TIME_RANGES: { label: string; value: TimeRange; ms: number }[] = [
  { label: '1 day', value: '1d', ms: 24 * 60 * 60 * 1000 },
  { label: '1 week', value: '1w', ms: 7 * 24 * 60 * 60 * 1000 },
];

function formatDate(timestamp: number): string {
  if (!timestamp) return '--';
  const d = new Date(timestamp);
  const pad = (n: number) => n.toString().padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function formatIncomeType(type: string): string {
  if (!type) return '--';
  switch (type.toUpperCase()) {
    case 'REALIZED_PNL':
      return 'Realized PNL';
    case 'COMMISSION':
      return 'Commission';
    case 'FUNDING_FEE':
      return 'Funding Fee';
    case 'TRANSFER':
      return 'Transfer';
    case 'WELCOME_BONUS':
      return 'Welcome Bonus';
    case 'INSURANCE_CLEAR':
      return 'Insurance Clear';
    case 'AUTO_CONVERSION':
      return 'Auto-conversion';
    default:
      return type.replace(/_/g, ' ');
  }
}

export const TransactionHistoryTab: React.FC<Props> = ({
  signer,
  userAddr,
  timeRange = '1w',
  hideOtherSymbols = false,
  asterSymbol,
}) => {
  const currentExchange = useExchangeManager(state => state.currentExchange);
  const currentNetwork = useExchangeManager(state => state.currentNetwork);
  const isAster = currentExchange === 'aster';

  const querySymbol = hideOtherSymbols ? asterSymbol : null;

  const asterHook = useTransactionHistory(
    isAster ? signer : null,
    isAster ? userAddr : '',
    querySymbol,
    timeRange
  );
  const { income, isLoading, isLoadingMore, hasMore, loadMore } = isAster
    ? asterHook
    : { income: [], isLoading: false, isLoadingMore: false, hasMore: false, loadMore: () => {} };
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || isLoadingMore || !hasMore) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 120) {
      loadMore();
    }
  }, [loadMore, isLoadingMore, hasMore]);

  const filteredIncome = useMemo(() => {
    const rangeObj = TIME_RANGES.find(r => r.value === timeRange);
    const minTimestamp = rangeObj && rangeObj.ms !== Infinity ? Date.now() - rangeObj.ms : 0;

    return income.filter(inc => {
      const t = inc.time || 0;
      if (minTimestamp > 0 && t < minTimestamp) return false;

      if (hideOtherSymbols && asterSymbol) {
        const cleanInc = (inc.symbol || '').replace('-', '').toUpperCase();
        const cleanTarget = asterSymbol.replace('-', '').toUpperCase();
        if (cleanInc && cleanTarget && cleanInc !== cleanTarget) return false;
      }

      return true;
    });
  }, [income, timeRange, hideOtherSymbols, asterSymbol]);

  const explorerAddressUrl = getPerpExplorerAddressUrl(currentExchange, currentNetwork, userAddr);

  if (isLoading && filteredIncome.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 px-4 text-center w-full">
        <Loader2 size={18} className="animate-spin text-muted mb-2" />
        <span className="text-xs font-medium text-secondary">Loading transactions...</span>
      </div>
    );
  }

  if (filteredIncome.length === 0) {
    return (
      <div className="w-full h-full flex flex-col justify-between bg-secondary">
        <TabEmptyState
          icon={Receipt}
          title="No transaction history"
          description="Your transaction records will appear here."
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
          {filteredIncome.map((inc, index) => {
            const incVal = parseFloat(inc.income || '0');
            return (
              <div
                key={`${inc.tranId || ''}-${inc.time || ''}-${index}`}
                className="bg-card/40 border border-white/[0.04] rounded-lg p-3 space-y-1.5 text-[11px]"
              >
                <div className="flex items-center justify-between">
                  <span className="text-primary font-medium">
                    {formatIncomeType(inc.incomeType)}
                  </span>
                  <span className="text-muted text-[10px]">{formatDate(inc.time)}</span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-white/[0.04] text-[10px]">
                  <span className="text-secondary">{inc.symbol || 'Account'}</span>
                  <span
                    className={`font-mono-tabular font-semibold text-[11px] ${
                      incVal > 0 ? 'text-success' : incVal < 0 ? 'text-danger' : 'text-primary'
                    }`}
                  >
                    {incVal > 0 ? '+' : ''}
                    {inc.income} {inc.asset}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="hidden md:block">
          <table className="w-full text-[11px] text-left whitespace-nowrap">
            <thead className="text-secondary border-b border-white/[0.04] sticky top-0 bg-secondary z-10">
              <tr>
                <th className="px-2.5 py-1.5 font-medium">Time</th>
                <th className="px-2.5 py-1.5 font-medium">Type</th>
                <th className="px-2.5 py-1.5 font-medium">Amount</th>
                <th className="px-2.5 py-1.5 font-medium">Symbol</th>
              </tr>
            </thead>
            <tbody>
              {filteredIncome.map((inc, index) => {
                const incVal = parseFloat(inc.income || '0');
                return (
                  <tr
                    key={`${inc.tranId || ''}-${inc.time || ''}-${index}`}
                    className="border-b border-white/[0.03] hover:bg-hover/60 transition-colors"
                  >
                    <td className="px-2.5 py-1.5 text-secondary">{formatDate(inc.time)}</td>
                    <td className="px-2.5 py-1.5 text-primary font-medium">
                      {formatIncomeType(inc.incomeType)}
                    </td>
                    <td
                      className={`px-2.5 py-1.5 font-mono-tabular ${
                        incVal > 0 ? 'text-success' : incVal < 0 ? 'text-danger' : 'text-primary'
                      }`}
                    >
                      {inc.income} {inc.asset}
                    </td>
                    <td className="px-2.5 py-1.5 text-primary font-medium">{inc.symbol || '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {isLoadingMore && (
          <div className="py-2.5 text-center text-muted text-[10px] flex items-center justify-center gap-1.5">
            <div className="w-3.5 h-3.5 border border-brand border-t-transparent rounded-full animate-spin" />
            <span>Loading more transactions...</span>
          </div>
        )}
      </div>

      <div className="px-3 py-2 flex items-center justify-between text-[11px] text-secondary shrink-0 bg-secondary">
        <span className="text-muted text-[10px]">Showing {filteredIncome.length} records</span>
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
};
