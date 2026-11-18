import { History, Loader2 } from 'lucide-react';
import React, { memo } from 'react';

import { useRecentTrades } from '../../hook/useRecentTrades';

interface LastTradesProps {
  baseAsset?: { code: string; issuer?: string };
  counterAsset?: { code: string; issuer?: string };
}

const LastTrades: React.FC<LastTradesProps> = ({ baseAsset, counterAsset }) => {
  const { trades, isLoading, newTradeIds } = useRecentTrades({
    baseAsset,
    counterAsset,
  });

  const formatTime = (timeStr: string) => {
    const date = new Date(timeStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const baseCode = baseAsset?.code || 'XLM';
  const counterCode = counterAsset?.code || 'USDC';

  return (
    <div className="h-full flex flex-col overflow-hidden select-none bg-[var(--color-bg-secondary)] text-xs font-sans">
      <style>{`
        @keyframes trade-slide-in-buy {
          from { opacity: 0; background-color: rgba(34,197,94,0.25); transform: translateX(-2px); }
          to   { opacity: 1; background-color: transparent; transform: translateX(0); }
        }
        @keyframes trade-slide-in-sell {
          from { opacity: 0; background-color: rgba(239,68,68,0.25); transform: translateX(-2px); }
          to   { opacity: 1; background-color: transparent; transform: translateX(0); }
        }
        .trade-flash-buy { animation: trade-slide-in-buy 0.8s ease-out forwards; }
        .trade-flash-sell { animation: trade-slide-in-sell 0.8s ease-out forwards; }
      `}</style>

      {/* Column Headers */}
      <div className="grid grid-cols-3 text-[10px] font-semibold text-muted uppercase tracking-wider px-3 py-2 border-b border-white/5 bg-[var(--color-bg-tertiary)]/30 shrink-0">
        <span>Price ({counterCode})</span>
        <span className="text-right">Size ({baseCode})</span>
        <span className="text-right">Time</span>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide min-h-0">
        {trades.length === 0 && isLoading ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-muted text-xs gap-2 py-16">
            <div className="w-10 h-10 rounded-2xl bg-brand/10 border border-brand/20 flex items-center justify-center mb-1">
              <Loader2 className="w-5 h-5 animate-spin text-brand" />
            </div>
            <span className="font-semibold text-primary/90">Syncing Trade Tape...</span>
          </div>
        ) : trades.length === 0 ? (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center mb-3 text-muted/60">
              <History size={22} className="text-muted/70" />
            </div>
            <p className="text-xs font-bold text-primary mb-1">No Recent Trades</p>
            <p className="text-[11px] text-muted max-w-[220px] leading-relaxed">
              No executed matches on Stellar DEX yet for {baseCode}/{counterCode}.
            </p>
          </div>
        ) : (
          trades.map(trade => (
            <div
              key={trade.id}
              className={`grid grid-cols-3 px-3 py-1 text-[11px] hover:bg-white/[0.04] transition-colors leading-relaxed ${
                newTradeIds.has(trade.id)
                  ? trade.isBuy
                    ? 'trade-flash-buy'
                    : 'trade-flash-sell'
                  : ''
              }`}
            >
              <span
                className={`font-mono font-medium ${trade.isBuy ? 'text-green-400' : 'text-red-400'}`}
              >
                {trade.price}
              </span>
              <span className="text-right font-mono text-primary/90">
                {parseFloat(trade.amount).toFixed(4)}
              </span>
              <span className="text-right text-muted font-mono text-[10px]">
                {formatTime(trade.time)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default memo(LastTrades);
