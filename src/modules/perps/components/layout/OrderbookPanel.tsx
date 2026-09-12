import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  LayoutList,
  PanelBottom,
  PanelTop,
} from 'lucide-react';
import React, { memo, useEffect, useMemo, useRef, useState } from 'react';

import { useMarketStore } from '../../core/stores/marketStore';
import { useOrderEntryStore } from '../../core/stores/orderEntryStore';
import { useOnClickOutside } from '../../hooks/useOnClickOutside';
import { useOrderbook } from '../../hooks/useOrderbook';
import { useTrades } from '../../hooks/useTrades';

interface OrderbookRowProps {
  price: number;
  displaySize: number;
  displayCumTotal: number;
  isAsk: boolean;
  isUsdtUnit: boolean;
  formatPrice: (v: number) => string;
  formatVal: (v: number, isUsdt: boolean) => string;
}

const OrderbookRow = memo(function OrderbookRow({
  price,
  displaySize,
  displayCumTotal,
  isAsk,
  isUsdtUnit,
  formatPrice,
  formatVal,
}: OrderbookRowProps) {
  const prevSizeRef = useRef(displaySize);
  const [flash, setFlash] = useState<'ob-flash-green' | 'ob-flash-red' | null>(null);

  useEffect(() => {
    if (prevSizeRef.current !== displaySize) {
      setFlash(isAsk ? 'ob-flash-red' : 'ob-flash-green');
      prevSizeRef.current = displaySize;
      const timer = setTimeout(() => setFlash(null), 350);
      return () => clearTimeout(timer);
    }
  }, [displaySize, isAsk]);

  return (
    <div
      className={`flex justify-between items-center px-2 py-0.5 my-[0.5px] hover:bg-hover/80 cursor-pointer relative leading-none shrink-0 group select-none transition-colors duration-100 ${
        flash || ''
      }`}
      onClick={() => useOrderEntryStore.getState().applyOrderbookPrice(price.toString())}
    >
      <div
        className={`absolute inset-y-0 right-0 pointer-events-none ob-depth-bar ${
          isAsk ? 'ob-depth-bar--ask-soft' : 'ob-depth-bar--bid-soft'
        }`}
        style={{ width: `calc((var(--cum-total) / var(--max-cum)) * 100%)` }}
      />
      <div
        className={`absolute inset-y-0 right-0 pointer-events-none ob-depth-bar ${
          isAsk ? 'ob-depth-bar--ask-strong' : 'ob-depth-bar--bid-strong'
        }`}
        style={{ width: `calc((var(--row-size) / var(--max-size)) * 100%)` }}
      />
      <span
        className={`font-mono-tabular text-[11px] font-medium z-10 ${
          isAsk ? 'text-danger' : 'text-success'
        }`}
      >
        {formatPrice(price)}
      </span>
      <div className="flex items-center z-10">
        <span className="font-mono-tabular text-[11px] text-primary opacity-85 w-[68px] text-right">
          {formatVal(displaySize, isUsdtUnit)}
        </span>
        <span className="font-mono-tabular text-[11px] text-secondary w-[68px] text-right">
          {formatVal(displayCumTotal, isUsdtUnit)}
        </span>
      </div>
    </div>
  );
});

function formatPrice(val: number): string {
  return val.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 4 });
}

function formatVal(val: number, isUsdt: boolean): string {
  if (isUsdt) {
    if (val >= 1000000) return `${(val / 1000000).toFixed(2)}M`;
    if (val >= 10000) return `${(val / 1000).toFixed(2)}K`;
    if (val >= 1000)
      return val.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
    if (val >= 1)
      return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return val.toFixed(3);
  }
  if (val >= 10000) return `${(val / 1000).toFixed(2)}K`;
  if (val >= 1000) return val.toLocaleString('en-US', { maximumFractionDigits: 1 });
  if (val >= 1)
    return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
  return val.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 5 });
}

/** Aggregate orderbook levels by tick precision */
function aggregateLevels(
  levels: { price: string; size: string }[],
  precision: number,
  isAsk: boolean
): { price: string; size: string }[] {
  if (!levels || levels.length === 0 || !precision || precision <= 0) return levels;
  const grouped = new Map<number, number>();
  for (const lvl of levels) {
    const px = parseFloat(lvl.price);
    const sz = parseFloat(lvl.size);
    if (isNaN(px) || isNaN(sz) || px <= 0) continue;
    const bucket = isAsk
      ? Math.ceil(px / precision) * precision
      : Math.floor(px / precision) * precision;
    const key = Number(bucket.toPrecision(10));
    grouped.set(key, (grouped.get(key) || 0) + sz);
  }
  const result: { price: string; size: string }[] = [];
  for (const [px, sz] of grouped.entries()) {
    result.push({ price: px.toString(), size: sz.toString() });
  }
  result.sort((a, b) =>
    isAsk ? parseFloat(a.price) - parseFloat(b.price) : parseFloat(b.price) - parseFloat(a.price)
  );
  return result;
}

function buildCumulative(levels: { price: string; size: string }[]) {
  let runningBase = 0;
  let runningQuote = 0;
  return levels.map(l => {
    const px = parseFloat(l.price);
    const sz = parseFloat(l.size);
    runningBase += sz;
    runningQuote += sz * px;
    return {
      price: px,
      size: sz,
      cumTotalBase: runningBase,
      quoteSize: sz * px,
      cumTotalQuote: runningQuote,
    };
  });
}

export const OrderbookPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'Book' | 'Trades'>('Book');
  const [viewMode, setViewMode] = useState<'both' | 'bids' | 'asks'>('both');
  const [unit, setUnit] = useState<'USDT' | 'BASE'>('USDT');
  const [isUnitOpen, setIsUnitOpen] = useState(false);
  const [isPrecisionOpen, setIsPrecisionOpen] = useState(false);

  const unitDropdownRef = useRef<HTMLDivElement>(null);
  const precisionDropdownRef = useRef<HTMLDivElement>(null);

  const orderbook = useOrderbook();
  const trades = useTrades();
  const market = useMarketStore(state => state.markets[state.selectedSymbol]);
  const symbol = useMarketStore(state => state.selectedSymbol);
  const [base, quote] = symbol.split('-');

  const tickSize = market?.tickSize || 0.1;
  const precisionOptions = useMemo(() => {
    return [tickSize, tickSize * 10, tickSize * 100, tickSize * 1000].map(v =>
      Number(v.toPrecision(6))
    );
  }, [tickSize]);

  const [selectedPrecision, setSelectedPrecision] = useState<number>(tickSize);

  useEffect(() => {
    setSelectedPrecision(tickSize);
  }, [tickSize]);

  useOnClickOutside(unitDropdownRef, () => setIsUnitOpen(false));
  useOnClickOutside(precisionDropdownRef, () => setIsPrecisionOpen(false));

  const rowsPerSide = viewMode === 'both' ? 14 : 35;

  const rawAsks = useMemo(() => {
    const sliced = (orderbook.asks || []).slice(0, viewMode === 'bids' ? 0 : rowsPerSide * 2);
    const aggregated = aggregateLevels(sliced, selectedPrecision, true);
    return aggregated.slice(0, viewMode === 'bids' ? 0 : rowsPerSide);
  }, [orderbook.asks, viewMode, rowsPerSide, selectedPrecision]);

  const rawBids = useMemo(() => {
    const sliced = (orderbook.bids || []).slice(0, viewMode === 'asks' ? 0 : rowsPerSide * 2);
    const aggregated = aggregateLevels(sliced, selectedPrecision, false);
    return aggregated.slice(0, viewMode === 'asks' ? 0 : rowsPerSide);
  }, [orderbook.bids, viewMode, rowsPerSide, selectedPrecision]);

  const askRows = useMemo(() => buildCumulative(rawAsks).reverse(), [rawAsks]);
  const bidRows = useMemo(() => buildCumulative(rawBids), [rawBids]);

  const isUsdtUnit = unit === 'USDT';

  const maxAskCum =
    askRows.length > 0 ? (isUsdtUnit ? askRows[0].cumTotalQuote : askRows[0].cumTotalBase) : 1;
  const maxBidCum =
    bidRows.length > 0
      ? isUsdtUnit
        ? bidRows[bidRows.length - 1].cumTotalQuote
        : bidRows[bidRows.length - 1].cumTotalBase
      : 1;
  const maxCumTotal = Math.max(maxAskCum, maxBidCum, 1);

  const maxRowSize = Math.max(
    ...askRows.map(r => (isUsdtUnit ? r.quoteSize : r.size)),
    ...bidRows.map(r => (isUsdtUnit ? r.quoteSize : r.size)),
    1
  );

  const lowestAsk = orderbook.asks?.[0] ? parseFloat(orderbook.asks[0].price) : 0;
  const highestBid = orderbook.bids?.[0] ? parseFloat(orderbook.bids[0].price) : 0;
  const spread = lowestAsk > 0 && highestBid > 0 ? lowestAsk - highestBid : 0;
  const spreadPct = lowestAsk > 0 ? (spread / lowestAsk) * 100 : 0;

  // Live Last Price & Direction from latest trade
  const latestTrade = trades[0];
  const prevTrade = trades[1];
  const lastPrice = latestTrade ? parseFloat(latestTrade.price) : lowestAsk || highestBid;
  const isPriceUp =
    latestTrade && prevTrade
      ? parseFloat(latestTrade.price) >= parseFloat(prevTrade.price)
      : latestTrade
        ? latestTrade.side === 'buy'
        : true;

  // Bid/Ask Imbalance calculation
  const totalBidVol = bidRows.length > 0 ? bidRows[bidRows.length - 1].cumTotalQuote : 0;
  const totalAskVol = askRows.length > 0 ? askRows[0].cumTotalQuote : 0;
  const totalVol = totalBidVol + totalAskVol;
  const bidPercent = totalVol > 0 ? Math.round((totalBidVol / totalVol) * 100) : 50;
  const askPercent = 100 - bidPercent;

  const TabBtn = ({ id, label }: { id: 'Book' | 'Trades'; label: string }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`flex-1 py-1.5 text-center text-[11px] font-medium transition-colors cursor-pointer ${
        activeTab === id
          ? 'text-primary border-b-2 border-brand font-semibold'
          : 'text-secondary hover:text-primary'
      }`}
    >
      {label}
    </button>
  );

  const ViewBtn = ({
    mode,
    title,
    icon,
    activeColor,
  }: {
    mode: 'both' | 'bids' | 'asks';
    title: string;
    icon: React.ReactNode;
    activeColor: string;
  }) => (
    <button
      onClick={() => setViewMode(mode)}
      title={title}
      className={`flex items-center justify-center w-[20px] h-[20px] rounded transition-colors cursor-pointer ${
        viewMode === mode ? activeColor : 'text-secondary hover:text-primary hover:bg-hover/60'
      }`}
    >
      {icon}
    </button>
  );

  return (
    <div className="w-full h-full min-h-0 bg-secondary border border-color rounded-lg overflow-hidden flex flex-col select-none">
      {/* Tab Header */}
      <div className="flex border-b border-color shrink-0 h-[32px]">
        <TabBtn id="Book" label="Order Book" />
        <TabBtn id="Trades" label="Trades" />
      </div>

      {activeTab === 'Book' ? (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* Controls Row (Order Book Only) */}
          <div className="flex items-center justify-between px-2 py-0.5 border-b border-color shrink-0 h-[28px]">
            <div className="flex items-center gap-0.5">
              <ViewBtn
                mode="both"
                title="Both"
                activeColor="text-brand bg-brand/15"
                icon={<LayoutList size={11} strokeWidth={2} />}
              />
              <ViewBtn
                mode="bids"
                title="Bids only"
                activeColor="text-success bg-success/15"
                icon={<PanelBottom size={11} strokeWidth={2} />}
              />
              <ViewBtn
                mode="asks"
                title="Asks only"
                activeColor="text-danger bg-danger/15"
                icon={<PanelTop size={11} strokeWidth={2} />}
              />
            </div>

            {/* Dropdowns for Precision and Unit */}
            <div className="flex items-center gap-2">
              {/* Precision Dropdown */}
              <div className="relative" ref={precisionDropdownRef}>
                <button
                  type="button"
                  onClick={() => {
                    setIsPrecisionOpen(!isPrecisionOpen);
                    setIsUnitOpen(false);
                  }}
                  className="flex items-center gap-0.5 text-[11px] text-secondary hover:text-primary transition-colors cursor-pointer px-1 py-0.5 rounded hover:bg-hover/60"
                >
                  <span>{selectedPrecision}</span>
                  <ChevronDown size={10} strokeWidth={2} className="opacity-70" />
                </button>

                {isPrecisionOpen && (
                  <div className="absolute right-0 top-full mt-1 bg-secondary border border-color rounded-md shadow-lg py-1 z-50 min-w-[70px]">
                    {precisionOptions.map(p => (
                      <button
                        key={p}
                        onClick={() => {
                          setSelectedPrecision(p);
                          setIsPrecisionOpen(false);
                        }}
                        className={`w-full text-left px-2 py-1 text-[11px] flex items-center justify-between hover:bg-hover transition-colors cursor-pointer ${
                          selectedPrecision === p ? 'text-brand font-semibold' : 'text-primary'
                        }`}
                      >
                        <span>{p}</span>
                        {selectedPrecision === p && <Check size={10} className="text-brand" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Unit Dropdown (USDT vs BASE) */}
              <div className="relative" ref={unitDropdownRef}>
                <button
                  type="button"
                  onClick={() => {
                    setIsUnitOpen(!isUnitOpen);
                    setIsPrecisionOpen(false);
                  }}
                  className="flex items-center gap-0.5 text-[11px] text-secondary hover:text-primary transition-colors cursor-pointer px-1 py-0.5 rounded hover:bg-hover/60"
                >
                  <span className="font-medium">{unit === 'USDT' ? quote : base}</span>
                  <ChevronDown size={10} strokeWidth={2} className="opacity-70" />
                </button>

                {isUnitOpen && (
                  <div className="absolute right-0 top-full mt-1 bg-secondary border border-color rounded-md shadow-lg py-1 z-50 min-w-[80px]">
                    <button
                      onClick={() => {
                        setUnit('BASE');
                        setIsUnitOpen(false);
                      }}
                      className={`w-full text-left px-2 py-1 text-[11px] flex items-center justify-between hover:bg-hover transition-colors cursor-pointer ${
                        unit === 'BASE' ? 'text-brand font-semibold' : 'text-primary'
                      }`}
                    >
                      <span>{base}</span>
                      {unit === 'BASE' && <Check size={10} className="text-brand" />}
                    </button>
                    <button
                      onClick={() => {
                        setUnit('USDT');
                        setIsUnitOpen(false);
                      }}
                      className={`w-full text-left px-2 py-1 text-[11px] flex items-center justify-between hover:bg-hover transition-colors cursor-pointer ${
                        unit === 'USDT' ? 'text-brand font-semibold' : 'text-primary'
                      }`}
                    >
                      <span>{quote}</span>
                      {unit === 'USDT' && <Check size={10} className="text-brand" />}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bid/Ask Imbalance Ratio Indicator */}
          <div className="flex h-[2px] w-full shrink-0">
            <div
              className="bg-danger/60 transition-all duration-300"
              style={{ width: `${askPercent}%` }}
              title={`Asks: ${askPercent}%`}
            />
            <div
              className="bg-success/60 transition-all duration-300"
              style={{ width: `${bidPercent}%` }}
              title={`Bids: ${bidPercent}%`}
            />
          </div>

          {/* Column Headers */}
          <div className="flex items-center justify-between px-2 py-1 text-[10px] text-secondary/70 font-medium shrink-0 h-[20px]">
            <span>Price({quote})</span>
            <div className="flex">
              <span className="w-[68px] text-right">Size({unit === 'USDT' ? quote : base})</span>
              <span className="w-[68px] text-right">Total({unit === 'USDT' ? quote : base})</span>
            </div>
          </div>

          {/* Orderbook Rows Container */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {viewMode !== 'bids' && (
              <div
                className={`flex flex-col ${viewMode === 'both' ? 'flex-1 min-h-0 justify-end overflow-hidden' : 'flex-1 min-h-0 ob-scroll overflow-y-auto'} pb-0.5`}
                style={
                  {
                    '--max-cum': maxCumTotal || 1,
                    '--max-size': maxRowSize || 1,
                  } as React.CSSProperties
                }
              >
                {askRows.length === 0 ? (
                  <div className="text-center text-muted py-6 text-[11px]">Waiting for data…</div>
                ) : (
                  askRows.map(row => (
                    <div
                      key={`ask-${row.price}`}
                      style={
                        {
                          '--cum-total': isUsdtUnit ? row.cumTotalQuote : row.cumTotalBase,
                          '--row-size': isUsdtUnit ? row.quoteSize : row.size,
                        } as React.CSSProperties
                      }
                    >
                      <OrderbookRow
                        price={row.price}
                        displaySize={isUsdtUnit ? row.quoteSize : row.size}
                        displayCumTotal={isUsdtUnit ? row.cumTotalQuote : row.cumTotalBase}
                        isAsk={true}
                        isUsdtUnit={isUsdtUnit}
                        formatPrice={formatPrice}
                        formatVal={formatVal}
                      />
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Dynamic Mid-Market Price & Spread Row */}
            <div className="flex items-center justify-between px-2 py-0.5 border-y border-color shrink-0 h-[26px] bg-tertiary/20">
              <div
                className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() =>
                  lastPrice > 0 &&
                  useOrderEntryStore.getState().applyOrderbookPrice(lastPrice.toString())
                }
                title="Click to fill price"
              >
                <span
                  className={`font-mono-tabular text-[12px] font-bold ${
                    isPriceUp ? 'text-success' : 'text-danger'
                  }`}
                >
                  {lastPrice > 0 ? formatPrice(lastPrice) : '—'}
                </span>
                {isPriceUp ? (
                  <ArrowUp size={11} strokeWidth={2.5} className="text-success" />
                ) : (
                  <ArrowDown size={11} strokeWidth={2.5} className="text-danger" />
                )}
              </div>

              <div className="flex items-center gap-1 text-[10px]">
                <span className="text-secondary/70">Spread</span>
                <span className="font-mono-tabular text-primary font-medium">
                  {spread > 0 ? formatPrice(spread) : '—'}
                </span>
                <span className="font-mono-tabular text-secondary/60">
                  ({spreadPct.toFixed(2)}%)
                </span>
              </div>
            </div>

            {viewMode !== 'asks' && (
              <div
                className={`flex flex-col ${viewMode === 'both' ? 'flex-1 min-h-0 overflow-hidden' : 'flex-1 min-h-0 ob-scroll overflow-y-auto'} pt-0.5`}
                style={
                  {
                    '--max-cum': maxCumTotal || 1,
                    '--max-size': maxRowSize || 1,
                  } as React.CSSProperties
                }
              >
                {bidRows.length === 0 ? (
                  <div className="text-center text-muted py-6 text-[11px]">Waiting for data…</div>
                ) : (
                  bidRows.map(row => (
                    <div
                      key={`bid-${row.price}`}
                      style={
                        {
                          '--cum-total': isUsdtUnit ? row.cumTotalQuote : row.cumTotalBase,
                          '--row-size': isUsdtUnit ? row.quoteSize : row.size,
                        } as React.CSSProperties
                      }
                    >
                      <OrderbookRow
                        price={row.price}
                        displaySize={isUsdtUnit ? row.quoteSize : row.size}
                        displayCumTotal={isUsdtUnit ? row.cumTotalQuote : row.cumTotalBase}
                        isAsk={false}
                        isUsdtUnit={isUsdtUnit}
                        formatPrice={formatPrice}
                        formatVal={formatVal}
                      />
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* Trades Column Headers */}
          <div className="flex items-center justify-between px-2 py-1 text-[10px] text-secondary/70 font-medium border-b border-color shrink-0 h-[24px]">
            <span>Price({quote})</span>
            <div className="flex">
              <span className="w-[75px] text-right">Size(USDT)</span>
              <span className="w-[65px] text-right">Time</span>
            </div>
          </div>

          <div className="flex-1 min-h-0 ob-scroll overflow-y-auto">
            {trades.length === 0 ? (
              <div className="text-center text-muted py-8 text-[11px]">Waiting for trades…</div>
            ) : (
              <div>
                {trades.map(trade => {
                  const px = parseFloat(trade.price);
                  const sz = parseFloat(trade.size);
                  const isBuy = trade.side === 'buy';
                  const d = new Date(trade.timestamp);
                  const t = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
                  const usdtVal = px * sz;

                  return (
                    <div
                      key={trade.id}
                      className="trade-row-enter flex justify-between items-center px-2 py-[2.5px] hover:bg-hover cursor-pointer leading-none"
                      onClick={() =>
                        useOrderEntryStore.getState().applyOrderbookPrice(px.toString())
                      }
                    >
                      <span
                        className={`font-mono-tabular text-[11px] font-medium ${
                          isBuy ? 'text-success' : 'text-danger'
                        }`}
                      >
                        {formatPrice(px)}
                      </span>
                      <div className="flex">
                        <span className="font-mono-tabular text-[11px] text-primary opacity-80 w-[75px] text-right">
                          {usdtVal >= 1000
                            ? usdtVal.toLocaleString('en-US', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })
                            : usdtVal.toFixed(4)}
                        </span>
                        <span className="font-mono-tabular text-[11px] text-secondary w-[65px] text-right">
                          {t}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
