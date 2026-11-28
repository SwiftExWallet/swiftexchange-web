import React, { useState } from 'react';

import { getAsterOpenInterest, getRealTimeFundingRate } from '../../adapters/aster/api/funding';
import { getHyperliquidFundingRate } from '../../adapters/hyperliquid/api/funding';
import { AlertsBellButton } from '../../alerts/components/AlertsBellButton';
import { useExchangeManager } from '../../core/ExchangeManager';
import { useLeverageStore } from '../../core/stores/leverageStore';
import { useMarketStore } from '../../core/stores/marketStore';
import { useOrderbookStore } from '../../core/stores/orderbookStore';
import { useTickerStore } from '../../core/stores/tickerStore';
import { safeFormatNumber } from '../../utils/precision';
import { CoinIcon } from '../ui/CoinIcon';
import { ExchangeNetworkSelector } from './ExchangeNetworkSelector';
import { MarketSelectorModal } from './MarketSelectorModal';

function formatExactNumber(num: number): string {
  if (!Number.isFinite(num) || num <= 0) return '0.00';
  return safeFormatNumber(num, 2, 2, '0.00');
}

function formatPrice(px: number): string {
  if (!Number.isFinite(px) || px <= 0) return '—';
  const dec = px < 10 ? (px < 0.001 ? 6 : 4) : 2;
  return safeFormatNumber(px, dec, dec, '—');
}

export const ExchangeTopBar: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const symbol = useMarketStore(state => state.selectedSymbol);
  const market = useMarketStore(state => state.markets[symbol]);
  const bracketsBySymbol = useLeverageStore(state => state.bracketsBySymbol);
  const maxLeverage = React.useMemo(() => {
    const brackets = bracketsBySymbol[symbol] || bracketsBySymbol[symbol.replace('-', '')];
    if (brackets && brackets.length > 0) {
      return Math.max(...brackets.map((b: any) => b.initialLeverage || 0));
    }
    return market?.maxLeverage && market.maxLeverage > 0 ? market.maxLeverage : 100;
  }, [bracketsBySymbol, symbol, market]);

  const cleanSymbol = symbol.replace(/[-_/]/g, '');
  const baseSymbol = symbol.split('-')[0];
  const assetCtx = useTickerStore(
    state =>
      state.assetCtxByMarket[symbol] ||
      state.assetCtxByMarket[cleanSymbol] ||
      state.assetCtxByMarket[`${baseSymbol}-USDC`] ||
      state.assetCtxByMarket[`${baseSymbol}-USDT`] ||
      state.assetCtxByMarket[baseSymbol]
  );
  const currentExchange = useExchangeManager(state => state.currentExchange);

  const markPxFromTicker = parseFloat(assetCtx?.markPx || '0');
  const orderbook = useOrderbookStore(state => state.books[symbol]);
  const midPrice =
    orderbook?.bids?.[0] && orderbook?.asks?.[0]
      ? (parseFloat(orderbook.bids[0].price) + parseFloat(orderbook.asks[0].price)) / 2
      : 0;
  const markPrice = markPxFromTicker > 0 ? markPxFromTicker : midPrice;

  const oraclePx = parseFloat(assetCtx?.oraclePx || '0');
  const prevDayPx = parseFloat(assetCtx?.prevDayPx || '0');
  const dayNtlVlm = parseFloat(assetCtx?.dayNtlVlm || '0');
  const openInterest = parseFloat(assetCtx?.openInterest || '0');

  const [liveFundingRate, setLiveFundingRate] = useState<number>(0);
  const [fundingIntervalHours, setFundingIntervalHours] = useState<number>(
    currentExchange === 'hyperliquid' ? 1 : 8
  );
  const [nextFundingTime, setNextFundingTime] = useState<number | null>(
    currentExchange === 'hyperliquid' ? Math.ceil(Date.now() / 3600000) * 3600000 : null
  );
  const [countdown, setCountdown] = useState<string>('--:--:--');
  const [liveOpenInterest, setLiveOpenInterest] = useState<number>(0);

  const fetchFundingInfo = React.useCallback(async () => {
    try {
      if (currentExchange === 'hyperliquid') {
        setFundingIntervalHours(1);
        const nextTime = Math.ceil(Date.now() / 3600000) * 3600000;
        setNextFundingTime(nextTime);
        const hlInfo = await getHyperliquidFundingRate(symbol);
        if (hlInfo) {
          const rate = parseFloat(hlInfo.lastFundingRate);
          if (!isNaN(rate)) setLiveFundingRate(rate);
          setFundingIntervalHours(hlInfo.fundingIntervalHours);
          setNextFundingTime(hlInfo.nextFundingTime);
          const oiVal = parseFloat(hlInfo.openInterest);
          if (!isNaN(oiVal) && oiVal > 0) setLiveOpenInterest(oiVal);
        }
        return;
      }

      if (currentExchange === 'aster') {
        const asterSymbol = symbol.replace('-', '');
        const [info, oiResult] = await Promise.allSettled([
          getRealTimeFundingRate(asterSymbol),
          getAsterOpenInterest(asterSymbol),
        ]);

        if (info.status === 'fulfilled' && info.value) {
          setLiveFundingRate(parseFloat(info.value.lastFundingRate));
          setFundingIntervalHours(info.value.fundingIntervalHours);
          setNextFundingTime(info.value.nextFundingTime);
        }

        if (oiResult.status === 'fulfilled') {
          const oiVal = parseFloat(oiResult.value);
          if (!isNaN(oiVal) && oiVal > 0) {
            setLiveOpenInterest(oiVal);
            const currentCtx = useTickerStore.getState().getAssetCtx(symbol);
            if (currentCtx) {
              useTickerStore.getState().setAssetCtx(symbol, {
                ...currentCtx,
                openInterest: String(oiVal),
              });
            }
          }
        }
      }
    } catch (e) {
      console.error('Failed to fetch funding/openInterest info', e);
    }
  }, [symbol, currentExchange]);

  React.useEffect(() => {
    fetchFundingInfo();
  }, [fetchFundingInfo]);

  React.useEffect(() => {
    if (currentExchange === 'hyperliquid') {
      setFundingIntervalHours(1);
      const nextTime = Math.ceil(Date.now() / 3600000) * 3600000;
      setNextFundingTime(nextTime);
      if (assetCtx?.funding) {
        const rate = parseFloat(assetCtx.funding);
        if (!isNaN(rate)) {
          setLiveFundingRate(rate);
        }
      }
      if (assetCtx?.openInterest) {
        const oiVal = parseFloat(assetCtx.openInterest);
        if (!isNaN(oiVal) && oiVal > 0) {
          setLiveOpenInterest(oiVal);
        }
      }
    }
  }, [currentExchange, assetCtx?.funding, assetCtx?.openInterest]);

  React.useEffect(() => {
    if (!nextFundingTime && currentExchange === 'hyperliquid') {
      const hlNext = Math.ceil(Date.now() / 3600000) * 3600000;
      setNextFundingTime(hlNext);
    }

    if (!nextFundingTime && currentExchange !== 'hyperliquid') {
      setCountdown('--:--:--');
      return;
    }

    const updateCountdown = () => {
      const now = Date.now();
      const targetTime =
        currentExchange === 'hyperliquid' && (!nextFundingTime || nextFundingTime <= now)
          ? Math.ceil(now / 3600000) * 3600000
          : nextFundingTime!;

      const diff = targetTime - now;
      if (diff <= 0) {
        setCountdown('00:00:00');
        if (currentExchange === 'hyperliquid') {
          setNextFundingTime(Math.ceil((now + 1000) / 3600000) * 3600000);
        }
        fetchFundingInfo();
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setCountdown(
          `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
        );
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [nextFundingTime, fetchFundingInfo, currentExchange]);

  const changePct = prevDayPx > 0 ? ((markPrice - prevDayPx) / prevDayPx) * 100 : 0;
  const isChangePositive = changePct >= 0;
  const changePctDisplay =
    !isNaN(changePct) && isFinite(changePct)
      ? `${isChangePositive ? '+' : ''}${changePct.toFixed(2)}%`
      : '--';

  const isFundingPositive = liveFundingRate >= 0;
  const formattedFundingRate = React.useMemo(() => {
    if (isNaN(liveFundingRate) || !isFinite(liveFundingRate)) return '--';
    const pct = liveFundingRate * 100;
    const absPct = Math.abs(pct);
    const decimals = absPct > 0 && absPct < 0.001 ? 5 : 4;
    return `${pct >= 0 ? '+' : ''}${pct.toFixed(decimals)}%`;
  }, [liveFundingRate]);

  const quoteAsset = market?.quoteAsset || (currentExchange === 'hyperliquid' ? 'USDC' : 'USDT');

  const rawOiBase = liveOpenInterest > 0 ? liveOpenInterest : openInterest;
  const oiQuoteValue = rawOiBase > 0 && markPrice > 0 ? rawOiBase * markPrice : 0;

  return (
    <>
      <div className="flex items-center pl-2 pr-1 h-[48px] border-b border-color bg-secondary shrink-0 w-full relative min-w-0">
        <div className="flex items-center shrink-0 z-10 bg-secondary">
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 hover:bg-hover px-1.5 py-1 rounded-lg transition-colors cursor-pointer"
          >
            <div className="relative shrink-0 flex flex-col items-center">
              <CoinIcon symbol={symbol} size={28} />
            </div>

            <div className="flex flex-col items-start gap-0.5">
              <div className="flex items-center gap-1.5 leading-none">
                <span className="text-primary font-bold text-[13px] tracking-tight">
                  {symbol.replace('-', '')}
                </span>
                <span className="text-muted text-[9.5px] font-mono-tabular bg-tertiary border border-color px-1.5 py-0.5 rounded font-medium">
                  {maxLeverage}x
                </span>
              </div>
              <div className="flex items-center gap-1.5 leading-none font-mono-tabular">
                <span
                  className={`text-[11px] font-semibold ${isChangePositive ? 'text-success' : 'text-danger'}`}
                >
                  {formatPrice(markPrice)}
                </span>
                <span
                  className={`text-[9.5px] font-medium ${isChangePositive ? 'text-success' : 'text-danger'}`}
                >
                  {changePctDisplay}
                </span>
              </div>
            </div>
            <svg
              className="text-muted ml-0.5"
              xmlns="http://www.w3.org/2000/svg"
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>

          <div className="h-5 w-px bg-border-color mx-2" />
        </div>

        <div className="flex items-center gap-5 sm:gap-6 md:gap-7 overflow-x-auto [&::-webkit-scrollbar]:hidden whitespace-nowrap flex-1 min-w-0 h-full px-1 mask-edges">
          <div className="flex flex-col gap-0.5">
            <span className="text-muted text-[10px] tracking-tight font-medium">Mark</span>
            <span className="text-primary text-[12px] font-semibold font-mono-tabular">
              {formatPrice(markPrice)}
              {markPxFromTicker === 0 && midPrice > 0 && (
                <span className="text-muted text-[9px] ml-1 font-normal">(mid)</span>
              )}
            </span>
          </div>

          <div className="flex flex-col gap-0.5">
            <span className="text-muted text-[10px] tracking-tight font-medium">Index</span>
            <span className="text-secondary text-[12px] font-semibold font-mono-tabular">
              {formatPrice(oraclePx > 0 ? oraclePx : markPrice)}
            </span>
          </div>

          <div className="flex flex-col gap-0.5">
            <span className="text-muted text-[10px] tracking-tight font-medium">24h Change</span>
            <span
              className={`text-[12px] font-semibold font-mono-tabular ${isChangePositive ? 'text-success' : 'text-danger'}`}
            >
              {changePctDisplay}
            </span>
          </div>

          <div className="flex flex-col gap-0.5">
            <span className="text-muted text-[10px] tracking-tight font-medium">
              Funding({fundingIntervalHours}h)/Countdown
            </span>
            <div className="flex items-center gap-1 font-mono-tabular">
              <span
                className={`text-[12px] font-semibold ${isFundingPositive ? 'text-success' : 'text-danger'}`}
              >
                {formattedFundingRate}
              </span>
              <span className="text-muted text-[12px] font-medium">/ {countdown}</span>
            </div>
          </div>

          <div className="flex flex-col gap-0.5">
            <span className="text-muted text-[10px] tracking-tight font-medium">
              24h Volume ({quoteAsset})
            </span>
            <span className="text-primary text-[12px] font-semibold font-mono-tabular">
              {formatExactNumber(dayNtlVlm)}
            </span>
          </div>

          <div className="flex flex-col gap-0.5 pr-2">
            <span className="text-muted text-[10px] tracking-tight font-medium">
              Open Interest ({quoteAsset})
            </span>
            <span className="text-primary text-[12px] font-semibold font-mono-tabular">
              {formatExactNumber(oiQuoteValue > 0 ? oiQuoteValue : rawOiBase)}
            </span>
          </div>
        </div>

        <div className="flex items-center pl-1.5 shrink-0 z-20 bg-secondary h-full ml-auto gap-1">
          <AlertsBellButton />
          <div className="flex items-center pl-1.5 border-l border-color h-full">
            <ExchangeNetworkSelector />
          </div>
        </div>
      </div>

      <MarketSelectorModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
};
