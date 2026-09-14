import { RefreshCw } from 'lucide-react';
import React from 'react';

import { useQuoteTimerStore } from '../store/quoteTimerStore';

interface SwapMiddleProgressRingProps {
  isQuoteLoading: boolean;
}

export const SwapMiddleProgressRing: React.FC<SwapMiddleProgressRingProps> = React.memo(
  ({ isQuoteLoading }) => {
    const timeLeft = useQuoteTimerStore(s => s.timeLeft);
    const radius = 24;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = isQuoteLoading
      ? circumference * 0.75
      : circumference * (1 - timeLeft / 30);

    return (
      <div
        className={`absolute inset-0 w-full h-full select-none pointer-events-none ${
          isQuoteLoading ? 'animate-spin' : ''
        }`}
      >
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 56 56">
          <circle
            cx="28"
            cy="28"
            r={radius}
            className="stroke-white/5"
            strokeWidth="2.5"
            fill="transparent"
          />
          <circle
            cx="28"
            cy="28"
            r={radius}
            className="stroke-brand transition-all duration-1000 origin-center"
            strokeWidth="2.5"
            fill="transparent"
            strokeDasharray={`${circumference}`}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }
);

SwapMiddleProgressRing.displayName = 'SwapMiddleProgressRing';

interface QuoteCountdownBadgeProps {
  isQuoteLoading: boolean;
  onRefresh?: () => void;
}

export const QuoteCountdownBadge: React.FC<QuoteCountdownBadgeProps> = React.memo(
  ({ isQuoteLoading, onRefresh }) => {
    const timeLeft = useQuoteTimerStore(s => s.timeLeft);

    return (
      <div
        onClick={onRefresh}
        className={`text-[9px] sm:text-[10px] font-extrabold uppercase tracking-widest mt-1 flex items-center justify-end gap-1.5 transition-all select-none ${
          onRefresh ? 'cursor-pointer hover:opacity-80 active:scale-95' : ''
        } ${isQuoteLoading ? 'text-brand/80' : 'text-emerald-500'}`}
        title={onRefresh ? 'Click to refresh quote' : undefined}
      >
        <div
          className={`flex items-center justify-center w-3.5 h-3.5 rounded-full ${
            isQuoteLoading
              ? 'bg-brand/10 text-brand animate-spin'
              : 'bg-emerald-500/10 text-emerald-500'
          }`}
        >
          <RefreshCw size={9} className={isQuoteLoading ? 'animate-spin' : ''} />
        </div>
        <span>{isQuoteLoading ? 'Updating Quote...' : `Refreshing in ${timeLeft}s`}</span>
      </div>
    );
  }
);

QuoteCountdownBadge.displayName = 'QuoteCountdownBadge';
