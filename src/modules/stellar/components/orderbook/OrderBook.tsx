import {
  ArrowDown,
  ArrowUp,
  Layers,
  LayoutList,
  Loader2,
  PanelBottom,
  PanelTop,
} from 'lucide-react';
import React, { memo, useEffect, useMemo, useRef, useState } from 'react';

interface OrderBookProps {
  orderBook: any;
  setPrice: (price: string) => void;
  isWalletConnected?: boolean;
  isLoading?: boolean;
  baseSymbol?: string;
  counterSymbol?: string;
}

const fmtPrice = (p: number) => {
  if (p <= 0) return '0.00';
  if (p < 0.0001) return p.toFixed(7);
  if (p < 1) return p.toFixed(5);
  return p.toFixed(4);
};

const fmtAmt = (a: number) => {
  if (a >= 1e6) return (a / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return (a / 1e3).toFixed(2) + 'K';
  return a.toFixed(2);
};

const OrderBook: React.FC<OrderBookProps> = ({
  orderBook,
  setPrice,
  isWalletConnected = true,
  isLoading = false,
  baseSymbol = 'XLM',
  counterSymbol = 'USDC',
}) => {
  const [viewMode, setViewMode] = useState<'both' | 'asks' | 'bids'>('both');
  const [highlightedPrice, setHighlightedPrice] = useState<string | null>(null);
  const [updatedPrices, setUpdatedPrices] = useState<{ [price: string]: 'up' | 'down' | 'new' }>(
    {}
  );
  const prevAsksRef = useRef<{ [price: string]: string }>({});
  const prevBidsRef = useRef<{ [price: string]: string }>({});

  const hasAsks = orderBook?.asks && orderBook.asks.length > 0;
  const hasBids = orderBook?.bids && orderBook.bids.length > 0;
  const isEmpty = !hasAsks && !hasBids;

  useEffect(() => {
    if (!orderBook) return;

    const nextUpdated: { [price: string]: 'up' | 'down' | 'new' } = {};

    if (orderBook.asks) {
      orderBook.asks.forEach((a: any) => {
        const prev = prevAsksRef.current[a.price];
        if (prev === undefined) nextUpdated[a.price] = 'new';
        else if (parseFloat(a.amount) > parseFloat(prev)) nextUpdated[a.price] = 'up';
        else if (parseFloat(a.amount) < parseFloat(prev)) nextUpdated[a.price] = 'down';
      });
      const m: { [p: string]: string } = {};
      orderBook.asks.forEach((a: any) => {
        m[a.price] = a.amount;
      });
      prevAsksRef.current = m;
    }

    if (orderBook.bids) {
      orderBook.bids.forEach((b: any) => {
        const prev = prevBidsRef.current[b.price];
        if (prev === undefined) nextUpdated[b.price] = 'new';
        else if (parseFloat(b.amount) > parseFloat(prev)) nextUpdated[b.price] = 'up';
        else if (parseFloat(b.amount) < parseFloat(prev)) nextUpdated[b.price] = 'down';
      });
      const m: { [p: string]: string } = {};
      orderBook.bids.forEach((b: any) => {
        m[b.price] = b.amount;
      });
      prevBidsRef.current = m;
    }

    if (Object.keys(nextUpdated).length > 0) {
      setUpdatedPrices(nextUpdated);
      const t = setTimeout(() => setUpdatedPrices({}), 600);
      return () => clearTimeout(t);
    }
  }, [orderBook]);

  const handlePriceClick = (price: string) => {
    setPrice(price);
    setHighlightedPrice(price);
    setTimeout(() => setHighlightedPrice(null), 400);
  };

  const maxRows = viewMode === 'both' ? 8 : 16;

  const topAsks = useMemo(() => {
    if (!hasAsks) return [];
    return [...orderBook.asks].slice(0, maxRows);
  }, [orderBook?.asks, hasAsks, maxRows]);

  let cumAsk = 0;
  const asksWithTotal = topAsks.map((a: any) => {
    cumAsk += parseFloat(a.amount);
    return { ...a, cumulativeAmount: cumAsk };
  });

  const topBids = useMemo(() => {
    if (!hasBids) return [];
    return [...orderBook.bids].slice(0, maxRows);
  }, [orderBook?.bids, hasBids, maxRows]);

  let cumBid = 0;
  const bidsWithTotal = topBids.map((b: any) => {
    cumBid += parseFloat(b.amount);
    return { ...b, cumulativeAmount: cumBid };
  });

  const maxTotal = useMemo(() => {
    const askMax =
      asksWithTotal.length > 0 ? asksWithTotal[asksWithTotal.length - 1].cumulativeAmount : 0;
    const bidMax =
      bidsWithTotal.length > 0 ? bidsWithTotal[bidsWithTotal.length - 1].cumulativeAmount : 0;
    return Math.max(askMax, bidMax, 1);
  }, [asksWithTotal, bidsWithTotal]);

  // Best prices and spread
  const bestAsk = hasAsks ? parseFloat(topAsks[0].price) : 0;
  const bestBid = hasBids ? parseFloat(topBids[0].price) : 0;
  const midPrice = bestAsk && bestBid ? (bestAsk + bestBid) / 2 : bestAsk || bestBid || 0;
  const spreadRaw = bestAsk && bestBid ? Math.max(0, bestAsk - bestBid) : 0;
  const spreadPercent = bestAsk > 0 ? ((spreadRaw / bestAsk) * 100).toFixed(3) : '0.000';

  if (isEmpty && isLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center py-16 px-4 bg-[var(--color-bg-secondary)]">
        <div className="w-10 h-10 rounded-2xl bg-brand/10 border border-brand/20 flex items-center justify-center mb-3">
          <Loader2 className="w-5 h-5 animate-spin text-brand" />
        </div>
        <p className="text-xs font-semibold text-primary/90">Syncing Stellar Orderbook...</p>
        <p className="text-[10px] text-muted mt-0.5">Fetching live bids and asks from Horizon</p>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="h-full flex flex-col overflow-hidden select-none bg-[var(--color-bg-secondary)] text-xs font-sans">
        {/* Sub-header */}
        <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-white/5 bg-[var(--color-bg-tertiary)]/30 shrink-0">
          <div className="flex items-center gap-1 text-[10px] text-muted font-mono">
            <span>Market Depth</span>
          </div>
          <div className="text-[10px] text-muted font-mono">0.0001</div>
        </div>

        <div className="grid grid-cols-3 text-[10px] font-semibold text-muted uppercase tracking-wider px-3 py-1.5 border-b border-white/5 shrink-0">
          <span>Price ({counterSymbol})</span>
          <span className="text-right">Size ({baseSymbol})</span>
          <span className="text-right">Total ({counterSymbol})</span>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center mb-3 text-muted/60">
            <Layers size={22} className="text-muted/70" />
          </div>
          <p className="text-xs font-bold text-primary mb-1">No Orders in Book</p>
          <p className="text-[11px] text-muted max-w-[220px] leading-relaxed">
            {isWalletConnected
              ? `No active offers found on SDEX for ${baseSymbol}/${counterSymbol}. Place a limit order to start liquidity.`
              : 'Connect your Stellar wallet to view depth or place limit offers.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden select-none bg-[var(--color-bg-secondary)] text-xs font-sans">
      <style>{`
        @keyframes ob-flash-up {
          0% { background-color: rgba(34, 197, 94, 0.25); }
          100% { background-color: transparent; }
        }
        @keyframes ob-flash-down {
          0% { background-color: rgba(239, 68, 68, 0.25); }
          100% { background-color: transparent; }
        }
        .flash-up { animation: ob-flash-up 0.8s ease-out forwards; }
        .flash-down { animation: ob-flash-down 0.8s ease-out forwards; }
      `}</style>

      {/* Sub-header: View Mode Toggles & Column Headers */}
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-white/5 bg-[var(--color-bg-tertiary)]/30 shrink-0">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setViewMode('both')}
            className={`p-1 rounded transition-colors cursor-pointer ${
              viewMode === 'both' ? 'bg-white/10 text-primary' : 'text-muted hover:text-primary'
            }`}
            title="Show Bids and Asks"
          >
            <LayoutList size={13} />
          </button>
          <button
            onClick={() => setViewMode('asks')}
            className={`p-1 rounded transition-colors cursor-pointer ${
              viewMode === 'asks' ? 'bg-white/10 text-red-400' : 'text-muted hover:text-primary'
            }`}
            title="Show Asks only"
          >
            <PanelTop size={13} />
          </button>
          <button
            onClick={() => setViewMode('bids')}
            className={`p-1 rounded transition-colors cursor-pointer ${
              viewMode === 'bids' ? 'bg-white/10 text-green-400' : 'text-muted hover:text-primary'
            }`}
            title="Show Bids only"
          >
            <PanelBottom size={13} />
          </button>
        </div>

        <div className="text-[10px] text-muted font-mono">0.0001</div>
      </div>

      <div className="grid grid-cols-3 text-[10px] font-semibold text-muted uppercase tracking-wider px-3 py-1.5 border-b border-white/5 shrink-0">
        <span>Price ({counterSymbol})</span>
        <span className="text-right">Size ({baseSymbol})</span>
        <span className="text-right">Total ({counterSymbol})</span>
      </div>

      {/* Orders List */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Asks (Sell Orders) */}
        {(viewMode === 'both' || viewMode === 'asks') && (
          <div className="flex-1 overflow-y-auto scrollbar-hide min-h-0 flex flex-col justify-end">
            <div className="w-full">
              {hasAsks ? (
                asksWithTotal
                  .slice()
                  .reverse()
                  .map((ask: any, idx: number) => {
                    const amount = parseFloat(ask.amount);
                    const price = parseFloat(ask.price);
                    const total = amount * price;
                    const depth = Math.min((ask.cumulativeAmount / maxTotal) * 100, 100);

                    return (
                      <div
                        key={`a-${idx}`}
                        onClick={() => handlePriceClick(ask.price)}
                        className={`relative grid grid-cols-3 text-[11px] py-0.5 px-3 cursor-pointer hover:bg-white/[0.04] transition-colors leading-relaxed ${
                          highlightedPrice === ask.price ? '!bg-red-500/20' : ''
                        } ${updatedPrices[ask.price] === 'up' ? 'flash-up' : updatedPrices[ask.price] === 'down' ? 'flash-down' : ''}`}
                      >
                        <div
                          className="absolute right-0 inset-y-0 bg-red-500/10 pointer-events-none transition-all duration-150"
                          style={{ width: `${depth}%` }}
                        />
                        <span className="relative z-10 text-red-400 font-mono font-medium">
                          {fmtPrice(price)}
                        </span>
                        <span className="relative z-10 text-right font-mono text-primary/90">
                          {fmtAmt(amount)}
                        </span>
                        <span className="relative z-10 text-right font-mono text-muted text-[10px]">
                          {fmtAmt(total)}
                        </span>
                      </div>
                    );
                  })
              ) : (
                <div className="text-center py-4 text-[10px] text-muted">No asks</div>
              )}
            </div>
          </div>
        )}

        {/* Mid-Market Price & Spread Ticker Strip */}
        <div className="flex items-center justify-between px-3 py-1.5 bg-white/[0.02] border-y border-white/5 shrink-0 my-0.5">
          <div className="flex items-center gap-1.5">
            <span
              className={`text-xs font-mono font-bold ${
                bestAsk >= bestBid ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {fmtPrice(midPrice)}
            </span>
            {bestAsk >= bestBid ? (
              <ArrowUp size={11} className="text-green-400" />
            ) : (
              <ArrowDown size={11} className="text-red-400" />
            )}
          </div>
          <div className="flex items-center gap-1 text-[10px] font-mono text-muted">
            <span>Spread</span>
            <span className="font-semibold text-primary">{spreadPercent}%</span>
          </div>
        </div>

        {/* Bids (Buy Orders) */}
        {(viewMode === 'both' || viewMode === 'bids') && (
          <div className="flex-1 overflow-y-auto scrollbar-hide min-h-0">
            {hasBids ? (
              bidsWithTotal.map((bid: any, idx: number) => {
                const amount = parseFloat(bid.amount);
                const price = parseFloat(bid.price);
                const total = amount * price;
                const depth = Math.min((bid.cumulativeAmount / maxTotal) * 100, 100);

                return (
                  <div
                    key={`b-${idx}`}
                    onClick={() => handlePriceClick(bid.price)}
                    className={`relative grid grid-cols-3 text-[11px] py-0.5 px-3 cursor-pointer hover:bg-white/[0.04] transition-colors leading-relaxed ${
                      highlightedPrice === bid.price ? '!bg-green-500/20' : ''
                    } ${updatedPrices[bid.price] === 'up' ? 'flash-up' : updatedPrices[bid.price] === 'down' ? 'flash-down' : ''}`}
                  >
                    <div
                      className="absolute right-0 inset-y-0 bg-green-500/10 pointer-events-none transition-all duration-150"
                      style={{ width: `${depth}%` }}
                    />
                    <span className="relative z-10 text-green-400 font-mono font-medium">
                      {fmtPrice(price)}
                    </span>
                    <span className="relative z-10 text-right font-mono text-primary/90">
                      {fmtAmt(amount)}
                    </span>
                    <span className="relative z-10 text-right font-mono text-muted text-[10px]">
                      {fmtAmt(total)}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-4 text-[10px] text-muted">No bids</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(OrderBook);
