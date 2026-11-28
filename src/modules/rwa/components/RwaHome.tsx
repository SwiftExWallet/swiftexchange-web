import { Clock, RefreshCw, Search, SearchX, Wallet } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AutoSizer } from 'react-virtualized-auto-sizer';
import { FixedSizeList, type ListChildComponentProps } from 'react-window';

import { getCachedPrice, loadPrices } from '../api/prices';
import { llamaKey } from '../data/assets';
import {
  CHIPS,
  CHIP_LABELS,
  type RwaChip,
  buildGroups,
  listRows,
  partitionGroups,
} from '../data/groups';
import type { RwaHoldingItem } from '../hooks/useRwaHoldings';
import { isFinal } from '../orders/orderState';
import type { RwaAsset, RwaGroup, RwaOrderRecord } from '../types/rwa.types';
import { fmtPct, fmtUsd } from '../utils/amounts';
import { assetMarketStatus } from '../utils/marketHours';
import { closedText, fmtHolding } from '../utils/swapForm';
import { RwaLogo } from './RwaLogo';

interface RwaHomeProps {
  assets: RwaAsset[];
  holdings: RwaHoldingItem[];
  holdingsLoading: boolean;
  orders: RwaOrderRecord[];
  onRefreshHoldings: () => void;
  onSelectGroup: (group: RwaGroup) => void;
  onSelectOrder: (order: RwaOrderRecord) => void;
}

const ROW_HEIGHT = 60;

export const RwaHome: React.FC<RwaHomeProps> = ({
  assets,
  holdings,
  holdingsLoading,
  orders,
  onRefreshHoldings,
  onSelectGroup,
  onSelectOrder,
}) => {
  const [chip, setChip] = useState<RwaChip>('all');
  const [query, setQuery] = useState('');
  const [priceTick, setPriceTick] = useState(0);

  const groups = useMemo(() => buildGroups(assets), [assets]);
  const parts = useMemo(() => partitionGroups(groups), [groups]);
  const rows = useMemo(() => listRows(parts, { chip, query }), [parts, chip, query]);
  const openOrders = useMemo(() => orders.filter(o => !isFinal(o.stage)), [orders]);

  useEffect(() => {
    const keys = rows
      .filter((r): r is Extract<typeof r, { type: 'asset' }> => r.type === 'asset')
      .slice(0, 60)
      .map(r => llamaKey(r.group.primary));
    if (!keys.length) return;
    let alive = true;
    loadPrices(keys).then(() => alive && setPriceTick(t => t + 1));
    return () => {
      alive = false;
    };
  }, [rows]);

  const RowRenderer = useCallback(
    ({ index, style }: ListChildComponentProps) => {
      const row = rows[index];
      if (!row) return null;

      if (row.type === 'header') {
        return (
          <div
            style={style}
            className="px-4 flex items-center text-[11px] font-bold uppercase tracking-wider text-muted bg-black/25 border-b border-divider/30"
          >
            {row.title}
          </div>
        );
      }

      const g = row.group;
      const px = priceTick >= 0 ? getCachedPrice(llamaKey(g.primary)) : null;
      const mStatus = assetMarketStatus(g);
      const closed = closedText(mStatus, new Date(), g.issuer === 'ondo');

      return (
        <div style={style} className="border-b border-divider/25">
          <button
            type="button"
            onClick={() => onSelectGroup(g)}
            className="w-full h-full px-4 flex items-center justify-between gap-3 hover:bg-white/5 transition-colors text-left"
          >
            <div className="flex items-center gap-3 min-w-0">
              <RwaLogo logo={g.logo} symbol={g.symbol} size={36} />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold text-primary truncate">{g.symbol}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-muted uppercase font-semibold">
                    {g.issuer}
                  </span>
                </div>
                <div className="text-xs text-muted truncate">{g.name}</div>
              </div>
            </div>

            <div className="text-right shrink-0">
              <div className="text-sm font-semibold text-primary">
                {px && px.price !== null ? fmtUsd(px.price) : '—'}
              </div>
              {closed ? (
                <div className="text-[11px] text-muted">{closed}</div>
              ) : px && px.change24h !== null ? (
                <div
                  className={`text-[11px] font-semibold ${
                    px.change24h >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {fmtPct(px.change24h)}
                </div>
              ) : (
                <div className="text-[11px] text-muted">{g.chains.join(' · ')}</div>
              )}
            </div>
          </button>
        </div>
      );
    },
    [rows, priceTick, onSelectGroup]
  );

  return (
    <div className="space-y-3.5">
      {openOrders.length > 0 && (
        <div className="rounded-xl bg-brand/10 border border-brand/30 p-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-primary">
            <Clock className="w-4 h-4 text-brand shrink-0" />
            <span>
              {openOrders.length} active RWA order{openOrders.length > 1 ? 's' : ''} in progress
            </span>
          </div>
          <button
            type="button"
            onClick={() => onSelectOrder(openOrders[0])}
            className="text-xs font-bold text-brand hover:underline shrink-0"
          >
            View Status
          </button>
        </div>
      )}

      {holdings.length > 0 && (
        <div className="rounded-2xl bg-tertiary border border-divider/50 p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-primary">
              <Wallet className="w-4 h-4 text-brand" />
              <span>Your RWA Holdings</span>
            </div>
            <button
              type="button"
              onClick={onRefreshHoldings}
              className="text-muted hover:text-primary transition-colors"
              title="Refresh balances"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${holdingsLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="divide-y divide-divider/30">
            {holdings.map(h => {
              const g = groups.find(gr => gr.key === `${h.asset.issuer}|${h.asset.symbol}`);
              return (
                <button
                  key={h.asset.id}
                  type="button"
                  onClick={() => g && onSelectGroup(g)}
                  className="w-full py-2 flex items-center justify-between text-left hover:bg-white/5 rounded-lg px-1.5 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <RwaLogo logo={h.asset.logo} symbol={h.asset.symbol} size={28} />
                    <div>
                      <div className="text-xs font-bold text-primary">
                        {h.asset.symbol}{' '}
                        <span className="text-[10px] font-medium text-muted">
                          ({h.asset.chain})
                        </span>
                      </div>
                      <div className="text-[11px] text-muted">{fmtHolding(h.amount)} tokens</div>
                    </div>
                  </div>
                  <div className="text-xs font-semibold text-primary">
                    {h.usdValue !== null ? fmtUsd(h.usdValue) : '—'}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="relative">
        <Search className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search stocks, ETFs, gold, treasuries (e.g. AAPL, TSLA, PAXG)…"
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-tertiary border border-divider/60 text-xs text-primary placeholder:text-muted focus:outline-none focus:border-brand transition-colors"
        />
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {CHIPS.map(c => (
          <button
            key={c}
            type="button"
            onClick={() => setChip(c)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              chip === c
                ? 'bg-brand text-white shadow-sm'
                : 'bg-tertiary text-muted hover:text-primary border border-divider/50'
            }`}
          >
            {CHIP_LABELS[c]}
          </button>
        ))}
      </div>

      <div className="rounded-2xl bg-tertiary border border-divider/50 h-[440px] overflow-hidden">
        {rows.length > 0 ? (
          <AutoSizer
            renderProp={({ height, width }) => (
              <FixedSizeList
                height={height || 440}
                width={width || 400}
                itemCount={rows.length}
                itemSize={ROW_HEIGHT}
              >
                {RowRenderer}
              </FixedSizeList>
            )}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <SearchX className="w-8 h-8 text-muted/40 mb-2" />
            <p className="text-xs font-semibold text-primary">No matching RWA assets</p>
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="mt-2 text-xs font-bold text-brand hover:underline"
              >
                Clear search
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
