import {
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  CandlestickChart,
  ChevronDown,
  LineChart,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { getSymbolDetail } from '../../adapters/aster/api/funding';
import { useAsterAgent } from '../../adapters/aster/hooks/useAsterAgent';
import { useLeverageStore } from '../../core/stores/leverageStore';
import { useMarketStore } from '../../core/stores/marketStore';
import { useOrderStore } from '../../core/stores/orderStore';
import { usePositionStore } from '../../core/stores/positionStore';
import { useTickerStore } from '../../core/stores/tickerStore';
import { MarketSelectorModal } from '../layout/MarketSelectorModal';
import { OpenOrdersTab } from '../layout/tabs/OpenOrdersTab';
import { OrderHistoryTab } from '../layout/tabs/OrderHistoryTab';
import { PositionsTab } from '../layout/tabs/PositionsTab';
import { TradeHistoryTab } from '../layout/tabs/TradeHistoryTab';
import { CoinIcon } from '../ui/CoinIcon';
import { MobileCleanChart } from './MobileCleanChart';
import { MobileIntervalSheet } from './MobileIntervalSheet';

interface MobileChartScreenProps {
  onOpenTrade: (side: 'BUY' | 'SELL') => void;
}

const QUICK_TIMEFRAMES = [
  { label: '15m', value: '15m' },
  { label: '1H', value: '1h' },
  { label: '4H', value: '4h' },
  { label: '1D', value: '1d' },
  { label: '1W', value: '1w' },
];

function formatLargeNum(val: number): string {
  if (!val || isNaN(val)) return '0.00';
  if (val >= 1e9) return `${(val / 1e9).toFixed(2)}B`;
  if (val >= 1e6) return `${(val / 1e6).toFixed(2)}M`;
  if (val >= 1e3) return `${(val / 1e3).toFixed(2)}K`;
  return val.toFixed(2);
}

export const MobileChartScreen: React.FC<MobileChartScreenProps> = ({ onOpenTrade }) => {
  const selectedSymbol = useMarketStore(state => state.selectedSymbol);
  const markets = useMarketStore(state => state.markets);
  const currentMarket = markets[selectedSymbol] || markets[selectedSymbol.replace('-', '')];

  const baseAsset = selectedSymbol.split('-')[0] || 'BTC';
  const quoteAsset = selectedSymbol.split('-')[1] || 'USDT';
  const asterSymbol = selectedSymbol.replace('-', '');

  const assetCtx = useTickerStore(
    state =>
      state.assetCtxByMarket[asterSymbol] ||
      state.assetCtxByMarket[`${asterSymbol}USDT`] ||
      state.assetCtxByMarket[selectedSymbol]
  );

  const markPrice = parseFloat(assetCtx?.markPx || '0');
  const oraclePrice = parseFloat(assetCtx?.oraclePx || '0');
  const prevDayPx = parseFloat(assetCtx?.prevDayPx || '0');
  const dayVolume = parseFloat(assetCtx?.dayNtlVlm || '0');
  const openInterest = parseFloat(assetCtx?.openInterest || '0');

  const changeDiff = prevDayPx > 0 ? markPrice - prevDayPx : 0;
  const changePct = prevDayPx > 0 ? (changeDiff / prevDayPx) * 100 : 0;
  const isPositive = changePct >= 0;

  // Exact leverage matching the Market Selector Modal (brackets by symbol)
  const maxLeverage = useLeverageStore(state => {
    const brackets = state.bracketsBySymbol[asterSymbol] || state.bracketsBySymbol[selectedSymbol];
    if (!brackets || brackets.length === 0) {
      return currentMarket?.maxLeverage && currentMarket.maxLeverage > 0
        ? currentMarket.maxLeverage
        : 20;
    }
    return Math.max(...brackets.map(b => b.initialLeverage));
  });

  // Dynamic Coin Details from Aster API (No hardcoded dictionaries)
  const [coinDetail, setCoinDetail] = useState<{
    name?: string;
    description?: string;
  } | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  useEffect(() => {
    let mounted = true;
    setIsLoadingDetail(true);
    getSymbolDetail(baseAsset)
      .then(data => {
        if (mounted) {
          setCoinDetail(data);
          setIsLoadingDetail(false);
        }
      })
      .catch(() => {
        if (mounted) {
          setCoinDetail(null);
          setIsLoadingDetail(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [baseAsset]);

  // User Positions & Orders
  const positions = usePositionStore(state => state.positions);
  const orders = useOrderStore(state => state.orders);
  const { asterSigner, userAddr } = useAsterAgent();

  const openOrdersCount = Object.values(orders).filter(
    o => o.status === 'new' || o.status === 'partially_filled'
  ).length;
  const positionsCount = Object.keys(positions).length;

  // Local UI States
  const [timeframe, setTimeframe] = useState('1d');
  const [chartType, setChartType] = useState<'candle' | 'line'>('candle');
  const [isIntervalSheetOpen, setIsIntervalSheetOpen] = useState(false);
  const [isMarketSelectorOpen, setIsMarketSelectorOpen] = useState(false);
  const [isExpandedAbout, setIsExpandedAbout] = useState(false);
  const [activeBottomTab, setActiveBottomTab] = useState<
    'positions' | 'orders' | 'orderHistory' | 'tradeHistory'
  >('positions');

  return (
    <div className="flex flex-col h-full w-full bg-secondary text-primary font-body select-none overflow-hidden relative">
      {/* 1. Top Header Bar: Clean Mobile Reference Layout */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-color shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.history.back()}
            className="w-8 h-8 rounded-full bg-tertiary flex items-center justify-center text-secondary hover:text-primary transition-colors cursor-pointer"
          >
            <ArrowLeft size={16} />
          </button>

          <button
            onClick={() => setIsMarketSelectorOpen(true)}
            className="flex items-center gap-2.5 hover:bg-hover px-1.5 py-1 rounded-xl transition-colors cursor-pointer text-left"
          >
            <div className="relative shrink-0 flex flex-col items-center">
              <CoinIcon symbol={selectedSymbol} size={30} />
              <span className="absolute -bottom-2 text-yellow-950 bg-gradient-to-r from-yellow-400 to-amber-500 text-[8px] leading-tight px-1 py-[0.5px] rounded-[3px] font-bold uppercase tracking-widest shadow-sm z-10 pointer-events-none border border-yellow-200/50">
                BETA
              </span>
            </div>
            <div className="flex flex-col leading-tight ml-0.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[15px] font-bold text-primary">{baseAsset}</span>
                {/* Max leverage matching Market Modal */}
                <span className="px-1.5 py-[1px] rounded text-[9px] font-bold bg-tertiary border border-color text-muted">
                  {maxLeverage}x
                </span>
                <ChevronDown size={12} className="text-muted" />
              </div>
              <span className="text-[11px] text-muted">
                {coinDetail?.name || `${baseAsset} Perp`}
              </span>
            </div>
          </button>
        </div>

        {/* Right Header: Live Price Display */}
        <div className="flex flex-col items-end justify-center leading-tight font-mono-tabular">
          <span className="text-base font-extrabold text-primary tracking-tight">
            $
            {markPrice
              ? markPrice.toLocaleString('en-US', { minimumFractionDigits: markPrice < 10 ? 4 : 2 })
              : '--'}
          </span>
          <span
            className={`text-[11px] font-semibold mt-0.5 ${
              isPositive ? 'text-success' : 'text-danger'
            }`}
          >
            {isPositive ? '+' : ''}
            {changeDiff.toFixed(2)} ({isPositive ? '+' : ''}
            {changePct.toFixed(2)}%)
          </span>
        </div>
      </div>

      {/* 2. Scrollable Body: Chart + About + Stats + Positions & Order History (No visible scrollbar) */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-none pb-28">
        {/* Clean Chart Container */}
        <div className="w-full h-[270px] shrink-0 relative bg-secondary">
          <MobileCleanChart symbol={selectedSymbol} timeframe={timeframe} chartType={chartType} />
        </div>

        {/* Timeframe Selector Bar */}
        <div className="flex items-center justify-between px-3 py-1.5 border-y border-color shrink-0 bg-secondary/80">
          {/* Chart Type Toggle (Line vs Candle) */}
          <button
            onClick={() => setChartType(prev => (prev === 'candle' ? 'line' : 'candle'))}
            className="w-7 h-7 rounded-lg bg-tertiary hover:bg-hover flex items-center justify-center text-secondary hover:text-primary transition-colors cursor-pointer"
            title="Toggle Line / Candle chart"
          >
            {chartType === 'candle' ? (
              <CandlestickChart size={15} className="text-primary" />
            ) : (
              <LineChart size={15} className="text-success" />
            )}
          </button>

          {/* Timeframe Pills */}
          <div className="flex items-center gap-1">
            {QUICK_TIMEFRAMES.map(tf => {
              const isActive = timeframe === tf.value;
              return (
                <button
                  key={tf.value}
                  onClick={() => setTimeframe(tf.value)}
                  className={`px-2 py-0.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-brand/20 text-brand font-bold'
                      : 'text-secondary hover:text-primary hover:bg-tertiary'
                  }`}
                >
                  {tf.label}
                </button>
              );
            })}

            {/* Candle Intervals Sheet Opener */}
            <button
              onClick={() => setIsIntervalSheetOpen(true)}
              className="flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-medium text-secondary hover:text-primary hover:bg-tertiary transition-colors cursor-pointer"
            >
              <span>{timeframe}</span>
              <ChevronDown size={11} />
            </button>
          </div>
        </div>

        {/* 3. About Section (100% Dynamic from Aster API) */}
        <div className="px-4 py-3 border-b border-color">
          <h3 className="text-sm font-bold text-primary mb-1.5">
            About {coinDetail?.name || baseAsset}
          </h3>
          {isLoadingDetail ? (
            <p className="text-xs text-muted">Loading project details...</p>
          ) : coinDetail?.description ? (
            <p className="text-xs text-secondary leading-relaxed">
              {isExpandedAbout
                ? coinDetail.description
                : coinDetail.description.length > 120
                  ? `${coinDetail.description.slice(0, 120)}...`
                  : coinDetail.description}
              {coinDetail.description.length > 120 && (
                <button
                  onClick={() => setIsExpandedAbout(!isExpandedAbout)}
                  className="text-brand ml-1.5 font-medium hover:underline cursor-pointer"
                >
                  {isExpandedAbout ? 'View less' : 'View more'}
                </button>
              )}
            </p>
          ) : (
            <p className="text-xs text-muted leading-relaxed">
              On testnet network, project details are currently not available for {baseAsset}.
            </p>
          )}
        </div>

        {/* 4. Stats Section (Matching Mobile App Reference) */}
        <div className="px-4 py-3 border-b border-color">
          <h3 className="text-sm font-bold text-primary mb-2.5">Stats</h3>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-secondary">24h volume</span>
              <span className="font-bold text-primary font-mono-tabular">
                ${formatLargeNum(dayVolume)} {quoteAsset}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-secondary">Open Interest</span>
              <span className="font-medium text-primary font-mono-tabular">
                ${formatLargeNum(openInterest)} {quoteAsset}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-secondary">Oracle Price</span>
              <span className="font-medium text-primary font-mono-tabular">
                ${oraclePrice > 0 ? oraclePrice.toFixed(2) : '--'}
              </span>
            </div>
          </div>
        </div>

        {/* 5. Positions & Orders Directly Below (Clean Native Mobile Tabs) */}
        <div className="mt-1 flex flex-col">
          {/* Tab Headers */}
          <div className="flex items-center border-b border-color px-3 bg-secondary text-xs overflow-x-auto scrollbar-none shrink-0 gap-4">
            <button
              onClick={() => setActiveBottomTab('positions')}
              className={`py-2.5 px-1 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                activeBottomTab === 'positions'
                  ? 'text-primary font-bold border-b-2 border-brand'
                  : 'text-secondary hover:text-primary'
              }`}
            >
              <span>Positions</span>
              {positionsCount > 0 && (
                <span className="bg-brand/20 text-brand text-[9px] font-bold px-1.5 py-0.2 rounded-full">
                  {positionsCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveBottomTab('orders')}
              className={`py-2.5 px-1 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                activeBottomTab === 'orders'
                  ? 'text-primary font-bold border-b-2 border-brand'
                  : 'text-secondary hover:text-primary'
              }`}
            >
              <span>Open Orders</span>
              {openOrdersCount > 0 && (
                <span className="bg-tertiary text-secondary text-[9px] font-bold px-1.5 py-0.2 rounded-full">
                  {openOrdersCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveBottomTab('orderHistory')}
              className={`py-2.5 px-1 transition-colors cursor-pointer whitespace-nowrap ${
                activeBottomTab === 'orderHistory'
                  ? 'text-primary font-bold border-b-2 border-brand'
                  : 'text-secondary hover:text-primary'
              }`}
            >
              Order History
            </button>

            <button
              onClick={() => setActiveBottomTab('tradeHistory')}
              className={`py-2.5 px-1 transition-colors cursor-pointer whitespace-nowrap ${
                activeBottomTab === 'tradeHistory'
                  ? 'text-primary font-bold border-b-2 border-brand'
                  : 'text-secondary hover:text-primary'
              }`}
            >
              Trade History
            </button>
          </div>

          {/* Tab Content with generous bottom padding for sticky bar */}
          <div className="p-3 min-h-[160px] pb-16">
            {activeBottomTab === 'positions' && (
              <PositionsTab signer={asterSigner} userAddr={userAddr || undefined} />
            )}

            {activeBottomTab === 'orders' && (
              <OpenOrdersTab
                signer={asterSigner}
                userAddr={userAddr || undefined}
                hideOtherSymbols={false}
                currentSymbol={selectedSymbol}
              />
            )}

            {activeBottomTab === 'orderHistory' && (
              <OrderHistoryTab
                signer={asterSigner}
                userAddr={userAddr || ''}
                asterSymbol={asterSymbol}
                timeRange="1w"
                hideOtherSymbols={false}
                hideCanceled={false}
              />
            )}

            {activeBottomTab === 'tradeHistory' && (
              <TradeHistoryTab
                signer={asterSigner}
                userAddr={userAddr || ''}
                asterSymbol={asterSymbol}
                timeRange="1w"
                hideOtherSymbols={false}
              />
            )}
          </div>
        </div>
      </div>

      {/* 6. Bottom Fixed Action Bar: Seamless Borderless Native App Floating Dock */}
      <div className="fixed sm:absolute bottom-0 left-0 right-0 p-3 bg-secondary/85 backdrop-blur-xl flex items-center gap-3 z-40 shadow-[0_-8px_30px_rgba(0,0,0,0.5)] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => onOpenTrade('BUY')}
          className="flex-1 h-12 rounded-2xl bg-success hover:bg-success/90 font-bold text-[15px] text-white transition-all shadow-lg active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2 tracking-wide"
        >
          <span>Long</span>
          <ArrowUpRight size={18} strokeWidth={2.5} />
        </button>
        <button
          type="button"
          onClick={() => onOpenTrade('SELL')}
          className="flex-1 h-12 rounded-2xl bg-danger hover:bg-danger/90 font-bold text-[15px] text-white transition-all shadow-lg active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2 tracking-wide"
        >
          <span>Short</span>
          <ArrowDownRight size={18} strokeWidth={2.5} />
        </button>
      </div>

      {/* Interval Sheet */}
      <MobileIntervalSheet
        isOpen={isIntervalSheetOpen}
        onClose={() => setIsIntervalSheetOpen(false)}
        selectedInterval={timeframe}
        onSelectInterval={setTimeframe}
      />

      {/* Enhanced Native Mobile Market Selector Modal */}
      <MarketSelectorModal
        isOpen={isMarketSelectorOpen}
        onClose={() => setIsMarketSelectorOpen(false)}
      />
    </div>
  );
};
