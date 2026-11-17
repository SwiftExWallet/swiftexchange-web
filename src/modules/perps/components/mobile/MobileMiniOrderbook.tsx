import React, { useMemo } from 'react';

import { useOrderbook } from '../../hooks/useOrderbook';

interface MobileMiniOrderbookProps {
  currentPrice: number;
  tickSize?: number;
  onSelectPrice: (price: string) => void;
}

function formatPriceByTick(px: number, tickSize?: number): string {
  if (!px || isNaN(px)) return '--';
  if (tickSize && tickSize > 0) {
    const dec = Math.max(0, -Math.floor(Math.log10(tickSize)));
    return px.toFixed(dec);
  }
  if (px < 0.1) return px.toFixed(5);
  if (px < 1) return px.toFixed(4);
  if (px < 10) return px.toFixed(3);
  if (px < 1000) return px.toFixed(2);
  return px.toFixed(1);
}

function formatCompact(val: number): string {
  if (!val || isNaN(val)) return '0.00';
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(2)}K`;
  return val.toFixed(2);
}

export const MobileMiniOrderbook: React.FC<MobileMiniOrderbookProps> = ({
  currentPrice,
  tickSize,
  onSelectPrice,
}) => {
  const { bids, asks } = useOrderbook();

  const { displayAsks, displayBids, bidRatio, askRatio, maxTotalVol } = useMemo(() => {
    // Top 22 asks reversed (lowest ask at bottom near mid price) to cover full mobile height
    const topAsks = asks.slice(0, 22).reverse();
    // Top 22 bids (highest bid at top near mid price) to cover full mobile height
    const topBids = bids.slice(0, 22);

    const askVol = topAsks.reduce((sum, a) => sum + parseFloat(a.size || '0'), 0);
    const bidVol = topBids.reduce((sum, b) => sum + parseFloat(b.size || '0'), 0);
    const total = askVol + bidVol;

    const bRatio = total > 0 ? Math.round((bidVol / total) * 100) : 50;
    const aRatio = 100 - bRatio;

    let maxVol = 0;
    topAsks.forEach(a => {
      const sz = parseFloat(a.size || '0');
      if (sz > maxVol) maxVol = sz;
    });
    topBids.forEach(b => {
      const sz = parseFloat(b.size || '0');
      if (sz > maxVol) maxVol = sz;
    });

    return {
      displayAsks: topAsks,
      displayBids: topBids,
      bidRatio: bRatio,
      askRatio: aRatio,
      maxTotalVol: maxVol || 1,
    };
  }, [bids, asks]);

  return (
    <div className="flex flex-col w-full h-full select-none font-mono-tabular overflow-hidden justify-between">
      {/* 1. Ratio Bar */}
      <div className="mb-2 shrink-0">
        <div className="flex justify-between items-center text-[10px] font-bold px-0.5 mb-1">
          <span className="text-success">{bidRatio}%</span>
          <span className="text-danger">{askRatio}%</span>
        </div>
        <div className="flex h-[3px] w-full rounded-full overflow-hidden bg-tertiary gap-0.5">
          <div
            className="bg-success rounded-l-full transition-all duration-300"
            style={{ width: `${bidRatio}%` }}
          />
          <div
            className="bg-danger rounded-r-full transition-all duration-300"
            style={{ width: `${askRatio}%` }}
          />
        </div>
      </div>

      {/* 2. Column Titles */}
      <div className="flex justify-between text-[10px] text-muted font-medium mb-1 px-1 shrink-0">
        <span>Price</span>
        <span>Size (USD)</span>
      </div>

      {/* 3. Asks (Red) - Ultra Thin & Clickable */}
      <div className="flex flex-col justify-end flex-1 space-y-[1px] overflow-hidden min-h-0">
        {displayAsks.map((ask, idx) => {
          const px = parseFloat(ask.price);
          const rawSize = parseFloat(ask.size) || 0;
          const szUSD = rawSize * (px || currentPrice || 1);
          const depthPct = Math.min(100, Math.round((rawSize / maxTotalVol) * 100));

          return (
            <button
              key={`ask-${idx}`}
              type="button"
              onClick={() => onSelectPrice(ask.price)}
              className="relative flex justify-between items-center h-[16px] px-1 text-[10px] cursor-pointer group text-left w-full hover:bg-danger/10 transition-colors shrink-0"
            >
              {/* Depth bar */}
              <div
                className="absolute right-0 top-0 bottom-0 bg-danger/10 pointer-events-none transition-all duration-150"
                style={{ width: `${depthPct}%` }}
              />
              <span className="relative z-10 text-danger font-medium leading-none">
                {formatPriceByTick(px, tickSize)}
              </span>
              <span className="relative z-10 text-danger/80 text-[9.5px] leading-none">
                {formatCompact(szUSD)}
              </span>
            </button>
          );
        })}
      </div>

      {/* 4. Mid Price - Clean, centered, bold, theme-aware */}
      <div className="py-1 text-center font-bold text-primary text-[12px] font-mono leading-tight shrink-0">
        {formatPriceByTick(currentPrice, tickSize)}
      </div>

      {/* 5. Bids (Green) - Ultra Thin & Clickable */}
      <div className="flex flex-col justify-start flex-1 space-y-[1px] overflow-hidden min-h-0">
        {displayBids.map((bid, idx) => {
          const px = parseFloat(bid.price);
          const rawSize = parseFloat(bid.size) || 0;
          const szUSD = rawSize * (px || currentPrice || 1);
          const depthPct = Math.min(100, Math.round((rawSize / maxTotalVol) * 100));

          return (
            <button
              key={`bid-${idx}`}
              type="button"
              onClick={() => onSelectPrice(bid.price)}
              className="relative flex justify-between items-center h-[16px] px-1 text-[10px] cursor-pointer group text-left w-full hover:bg-success/10 transition-colors"
            >
              {/* Depth bar */}
              <div
                className="absolute right-0 top-0 bottom-0 bg-success/10 pointer-events-none transition-all duration-150"
                style={{ width: `${depthPct}%` }}
              />
              <span className="relative z-10 text-success font-medium leading-none">
                {formatPriceByTick(px, tickSize)}
              </span>
              <span className="relative z-10 text-success/80 text-[9.5px] leading-none">
                {formatCompact(szUSD)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
