import { DollarSign, ExternalLink } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import {
  type HyperliquidFundingRecord,
  getHyperliquidFundingHistory,
} from '../../../adapters/hyperliquid/api/history';
import { useExchangeManager } from '../../../core/ExchangeManager';
import { getPerpExplorerAddressUrl } from '../../../utils/explorer';
import type { TimeRange } from './OrderHistoryTab';
import { TabEmptyState } from './TabEmptyState';

interface Props {
  userAddr?: string;
  timeRange?: TimeRange;
  hideOtherSymbols?: boolean;
  asterSymbol?: string;
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

export const FundingHistoryTab: React.FC<Props> = ({
  userAddr,
  timeRange = '1w',
  hideOtherSymbols = false,
  asterSymbol,
}) => {
  const currentExchange = useExchangeManager(state => state.currentExchange);
  const currentNetwork = useExchangeManager(state => state.currentNetwork);

  const [records, setRecords] = useState<HyperliquidFundingRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userAddr) {
      setRecords([]);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    const rangeObj = TIME_RANGES.find(r => r.value === timeRange);
    const startTime = rangeObj && rangeObj.ms !== Infinity ? Date.now() - rangeObj.ms : undefined;

    getHyperliquidFundingHistory(userAddr, { startTime })
      .then(res => {
        if (!isMounted) return;
        setRecords(res);
      })
      .catch(err => {
        console.error('Failed to load funding history:', err);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [userAddr, timeRange]);

  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      if (hideOtherSymbols && asterSymbol) {
        const cleanTarget = asterSymbol.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        const cleanCoin = (r.coin || '').toUpperCase();
        if (!cleanTarget.startsWith(cleanCoin)) return false;
      }
      return true;
    });
  }, [records, hideOtherSymbols, asterSymbol]);

  const explorerAddressUrl = getPerpExplorerAddressUrl(currentExchange, currentNetwork, userAddr);

  if (isLoading && filteredRecords.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 px-4 text-center w-full">
        <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin mb-2" />
        <span className="text-xs font-medium text-secondary">Loading funding history...</span>
      </div>
    );
  }

  if (filteredRecords.length === 0) {
    return (
      <div className="w-full h-full flex flex-col justify-between">
        <TabEmptyState
          icon={DollarSign}
          title="No funding history"
          description="Your funding fee payments and receipts will appear here."
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
      <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-auto relative">
        <div className="md:hidden space-y-2 p-2">
          {filteredRecords.map((r, idx) => {
            const dateInfo = formatSplitDate(r.time);
            const isPositivePayment = parseFloat(r.payment) > 0;
            const isNegativePayment = parseFloat(r.payment) < 0;
            const isLong = r.side === 'Long';

            return (
              <div
                key={`${r.time}_${r.coin}_${idx}`}
                className="bg-card/40 border border-white/[0.04] rounded-lg p-3 space-y-2 text-[11px]"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-primary">{r.coin}</span>
                    <span
                      className={`font-semibold px-1.5 py-0.5 rounded text-[10px] ${
                        isLong ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'
                      }`}
                    >
                      {r.side}
                    </span>
                  </div>
                  <span className="text-muted text-[10px]">
                    {dateInfo.date} {dateInfo.time}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 py-1.5 border-y border-white/[0.04] text-[10px]">
                  <div>
                    <span className="text-secondary block">Position Size</span>
                    <span className="text-primary font-mono-tabular">{r.size}</span>
                  </div>
                  <div>
                    <span className="text-secondary block">Rate</span>
                    <span className="text-primary font-mono-tabular">{r.rate}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-0.5">
                  <span className="text-secondary text-[10px]">Payment:</span>
                  <span
                    className={`font-mono-tabular font-semibold text-[11px] ${
                      isPositivePayment
                        ? 'text-success'
                        : isNegativePayment
                          ? 'text-danger'
                          : 'text-secondary'
                    }`}
                  >
                    {r.payment}
                  </span>
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
                <th className="px-2.5 py-1.5 font-medium">Market</th>
                <th className="px-2.5 py-1.5 font-medium">Size</th>
                <th className="px-2.5 py-1.5 font-medium">Side</th>
                <th className="px-2.5 py-1.5 font-medium">Payment</th>
                <th className="px-2.5 py-1.5 font-medium text-right">Rate</th>
              </tr>
            </thead>
            <tbody className="text-[11px]">
              {filteredRecords.map((r, idx) => {
                const dateInfo = formatSplitDate(r.time);
                const isPositivePayment = parseFloat(r.payment) > 0;
                const isNegativePayment = parseFloat(r.payment) < 0;
                const isLong = r.side === 'Long';

                return (
                  <tr
                    key={`${r.time}_${r.coin}_${idx}`}
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

                    <td className="px-2.5 py-2 text-primary font-medium">{r.coin}</td>

                    <td className="px-2.5 py-2 text-primary font-mono-tabular">{r.size}</td>

                    <td
                      className={`px-2.5 py-2 font-medium ${isLong ? 'text-success' : 'text-danger'}`}
                    >
                      {r.side}
                    </td>

                    <td
                      className={`px-2.5 py-2 font-mono-tabular font-medium ${
                        isPositivePayment
                          ? 'text-success'
                          : isNegativePayment
                            ? 'text-danger'
                            : 'text-secondary'
                      }`}
                    >
                      {r.payment}
                    </td>

                    <td className="px-2.5 py-2 text-right text-secondary font-mono-tabular">
                      {r.rate}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="px-3 py-2 flex items-center justify-between text-[11px] text-secondary shrink-0 bg-secondary">
        <span className="text-muted text-[10px]">Showing {filteredRecords.length} records</span>
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
