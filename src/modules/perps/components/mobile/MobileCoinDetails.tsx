import { Activity, Clock, Coins, Layers, ShieldAlert } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import {
  getBrackets,
  getRealTimeFundingRate,
  getSymbolAthl,
  getSymbolDetail,
} from '../../adapters/aster/api/funding';
import { useMarketStore } from '../../core/stores/marketStore';
import { useTickerStore } from '../../core/stores/tickerStore';
import { CoinIcon } from '../ui/CoinIcon';

function formatLargeNum(val: number): string {
  if (!val || isNaN(val)) return '0.00';
  if (val >= 1e9) return `${(val / 1e9).toFixed(2)}B`;
  if (val >= 1e6) return `${(val / 1e6).toFixed(2)}M`;
  if (val >= 1e3) return `${(val / 1e3).toFixed(2)}K`;
  return val.toFixed(2);
}

function formatPrice(val: number, tickSize?: number): string {
  if (!val || isNaN(val)) return '--';
  if (tickSize && tickSize < 0.001) return val.toFixed(4);
  if (val < 1) return val.toFixed(4);
  if (val < 10) return val.toFixed(3);
  return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type DetailsSubTab = 'overview' | 'funding' | 'brackets' | 'token';

export const MobileCoinDetails: React.FC = () => {
  const selectedSymbol = useMarketStore(state => state.selectedSymbol);
  const markets = useMarketStore(state => state.markets);
  const asterSymbol = selectedSymbol.replace('-', '');
  const baseAsset = selectedSymbol.split('-')[0] || 'BTC';
  const quoteAsset = selectedSymbol.split('-')[1] || 'USDT';

  const currentMarket = markets[selectedSymbol] || markets[asterSymbol];
  const maxLeverage = currentMarket?.maxLeverage || 100;

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

  const [activeSubTab, setActiveSubTab] = useState<DetailsSubTab>('overview');

  // Real Funding Info
  const [fundingData, setFundingData] = useState<any>(null);
  const [fundingCountdown, setFundingCountdown] = useState<string>('--:--:--');

  // Brackets Info
  const [brackets, setBrackets] = useState<any[]>([]);
  const [loadingBrackets, setLoadingBrackets] = useState(false);

  // Token Profile Info
  const [tokenDetail, setTokenDetail] = useState<any>(null);
  const [athlData, setAthlData] = useState<any>(null);
  const [loadingToken, setLoadingToken] = useState(false);

  // Fetch Funding Info
  useEffect(() => {
    let mounted = true;
    const fetchFunding = async () => {
      try {
        const info = await getRealTimeFundingRate(asterSymbol);
        if (info && mounted) {
          setFundingData(info);
        }
      } catch (e) {
        console.warn('Funding fetch notice:', e);
      }
    };
    fetchFunding();
    return () => {
      mounted = false;
    };
  }, [asterSymbol]);

  // Live Funding Countdown
  useEffect(() => {
    if (!fundingData?.nextFundingTime) return;
    const interval = setInterval(() => {
      const diff = Math.max(0, fundingData.nextFundingTime - Date.now());
      const hrs = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setFundingCountdown(
        `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
      );
    }, 1000);
    return () => clearInterval(interval);
  }, [fundingData?.nextFundingTime]);

  // Fetch Brackets
  useEffect(() => {
    let mounted = true;
    const fetchRiskBrackets = async () => {
      setLoadingBrackets(true);
      try {
        const data = await getBrackets();
        const symbolBrackets = data.find((d: any) => d.symbol === asterSymbol);
        if (mounted && symbolBrackets?.riskBrackets) {
          setBrackets(symbolBrackets.riskBrackets);
        }
      } catch (e) {
        console.warn('Brackets fetch notice:', e);
      } finally {
        if (mounted) setLoadingBrackets(false);
      }
    };
    fetchRiskBrackets();
    return () => {
      mounted = false;
    };
  }, [asterSymbol]);

  // Fetch Token Profile
  useEffect(() => {
    let mounted = true;
    const fetchTokenInfo = async () => {
      setLoadingToken(true);
      try {
        const [detail, athl] = await Promise.all([
          getSymbolDetail(baseAsset),
          getSymbolAthl(baseAsset),
        ]);
        if (mounted) {
          setTokenDetail(detail);
          setAthlData(athl);
        }
      } catch (e) {
        console.warn('Token details fetch notice:', e);
      } finally {
        if (mounted) setLoadingToken(false);
      }
    };
    fetchTokenInfo();
    return () => {
      mounted = false;
    };
  }, [baseAsset]);

  const liveRate = fundingData ? parseFloat(fundingData.lastFundingRate) : 0;
  const annualizedRate = liveRate * 3 * 365 * 100;

  const quote = tokenDetail?.metrics?.quote?.USD || {};
  const hasTokenDetail = Boolean(tokenDetail && (quote.market_cap || tokenDetail.name));

  return (
    <div className="w-full bg-secondary text-primary font-body pb-6">
      {/* 1. Header Coin Summary Card */}
      <div className="p-3 bg-tertiary/30 border-b border-color flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <CoinIcon symbol={selectedSymbol} size={32} />
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-primary">{baseAsset}</span>
              <span className="text-[10px] font-medium text-muted bg-secondary px-1.5 py-0.2 rounded border border-color">
                {quoteAsset}
              </span>
              <span className="text-[10px] font-semibold text-brand bg-brand/10 px-1.5 py-0.2 rounded">
                Max {maxLeverage}x
              </span>
            </div>
            <span className="text-[10px] text-muted">Perpetual Linear Contract</span>
          </div>
        </div>

        <div className="flex flex-col items-end leading-tight font-mono-tabular">
          <span className="text-sm font-bold text-primary">
            ${formatPrice(markPrice, currentMarket?.tickSize)}
          </span>
          <span
            className={`text-[10px] font-semibold ${isPositive ? 'text-success' : 'text-danger'}`}
          >
            {isPositive ? '+' : ''}
            {changePct.toFixed(2)}%
          </span>
        </div>
      </div>

      {/* 2. Sleek Segment Switcher */}
      <div className="flex items-center gap-1.5 p-2 border-b border-color overflow-x-auto scrollbar-none bg-secondary text-[11px]">
        <button
          onClick={() => setActiveSubTab('overview')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium transition-all whitespace-nowrap cursor-pointer ${
            activeSubTab === 'overview'
              ? 'bg-primary text-primary font-bold shadow-xs border border-color'
              : 'text-muted hover:text-primary hover:bg-tertiary/50'
          }`}
        >
          <Activity size={13} className={activeSubTab === 'overview' ? 'text-brand' : ''} />
          <span>Specifications</span>
        </button>

        <button
          onClick={() => setActiveSubTab('funding')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium transition-all whitespace-nowrap cursor-pointer ${
            activeSubTab === 'funding'
              ? 'bg-primary text-primary font-bold shadow-xs border border-color'
              : 'text-muted hover:text-primary hover:bg-tertiary/50'
          }`}
        >
          <Clock size={13} className={activeSubTab === 'funding' ? 'text-brand' : ''} />
          <span>Funding & Rates</span>
        </button>

        <button
          onClick={() => setActiveSubTab('brackets')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium transition-all whitespace-nowrap cursor-pointer ${
            activeSubTab === 'brackets'
              ? 'bg-primary text-primary font-bold shadow-xs border border-color'
              : 'text-muted hover:text-primary hover:bg-tertiary/50'
          }`}
        >
          <Layers size={13} className={activeSubTab === 'brackets' ? 'text-brand' : ''} />
          <span>Leverage Tiers</span>
        </button>

        <button
          onClick={() => setActiveSubTab('token')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium transition-all whitespace-nowrap cursor-pointer ${
            activeSubTab === 'token'
              ? 'bg-primary text-primary font-bold shadow-xs border border-color'
              : 'text-muted hover:text-primary hover:bg-tertiary/50'
          }`}
        >
          <Coins size={13} className={activeSubTab === 'token' ? 'text-brand' : ''} />
          <span>Token Info</span>
        </button>
      </div>

      {/* 3. Subtab Content */}
      <div className="p-3">
        {/* OVERVIEW / SPECIFICATIONS */}
        {activeSubTab === 'overview' && (
          <div className="space-y-3">
            {/* Market Liquidity Overview */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 rounded-xl bg-tertiary/20 border border-color flex flex-col">
                <span className="text-[10px] text-muted font-sans">24h Turnover</span>
                <span className="text-xs font-bold text-primary font-mono-tabular mt-0.5">
                  ${formatLargeNum(dayVolume)}
                </span>
                <span className="text-[9px] text-muted font-sans mt-0.5">USD Notional</span>
              </div>

              <div className="p-2.5 rounded-xl bg-tertiary/20 border border-color flex flex-col">
                <span className="text-[10px] text-muted font-sans">Open Interest</span>
                <span className="text-xs font-bold text-primary font-mono-tabular mt-0.5">
                  ${formatLargeNum(openInterest)}
                </span>
                <span className="text-[9px] text-muted font-sans mt-0.5">Active Contracts</span>
              </div>

              <div className="p-2.5 rounded-xl bg-tertiary/20 border border-color flex flex-col">
                <span className="text-[10px] text-muted font-sans">Index Price</span>
                <span className="text-xs font-bold text-primary font-mono-tabular mt-0.5">
                  ${formatPrice(oraclePrice, currentMarket?.tickSize)}
                </span>
                <span className="text-[9px] text-muted font-sans mt-0.5">Composite Index</span>
              </div>

              <div className="p-2.5 rounded-xl bg-tertiary/20 border border-color flex flex-col">
                <span className="text-[10px] text-muted font-sans">Mark Price</span>
                <span className="text-xs font-bold text-primary font-mono-tabular mt-0.5">
                  ${formatPrice(markPrice, currentMarket?.tickSize)}
                </span>
                <span className="text-[9px] text-muted font-sans mt-0.5">Liquidation Basis</span>
              </div>
            </div>

            {/* Detailed Parameters List */}
            <div className="rounded-xl bg-tertiary/20 border border-color p-3 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">Contract Type</span>
                <span className="font-semibold text-primary">USDⓈ-M Perpetual</span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">Settlement Asset</span>
                <span className="font-semibold text-primary">{quoteAsset}</span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">Max Leverage</span>
                <span className="font-semibold text-primary">{maxLeverage}x</span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">Tick Size (Min Price Step)</span>
                <span className="font-mono-tabular font-semibold text-primary">
                  {currentMarket?.tickSize || '0.0001'} {quoteAsset}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">Min Order Size</span>
                <span className="font-mono-tabular font-semibold text-primary">
                  {currentMarket?.minOrderSize || currentMarket?.stepSize || '0.001'} {baseAsset}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">Min Notional</span>
                <span className="font-mono-tabular font-semibold text-primary">
                  {currentMarket?.minNotional || 5} {quoteAsset}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">Margin Modes</span>
                <span className="font-semibold text-primary">Cross / Isolated</span>
              </div>
            </div>
          </div>
        )}

        {/* FUNDING & RATES */}
        {activeSubTab === 'funding' && (
          <div className="space-y-3">
            {/* Real-time Hero Card */}
            <div className="p-3.5 rounded-2xl bg-gradient-to-br from-tertiary/50 to-tertiary/20 border border-color flex flex-col space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Clock size={14} className="text-brand" />
                  <span className="text-xs font-bold text-primary">Real-Time Funding</span>
                </div>
                <span className="text-[10px] font-mono-tabular px-2 py-0.5 rounded-full bg-secondary border border-color text-muted">
                  Every {fundingData?.fundingIntervalHours || 8}h
                </span>
              </div>

              <div className="flex items-baseline justify-between pt-1">
                <div className="flex flex-col">
                  <span className="text-[10px] text-muted font-sans">Current Rate</span>
                  <span
                    className={`text-xl font-extrabold font-mono-tabular ${
                      liveRate >= 0 ? 'text-success' : 'text-danger'
                    }`}
                  >
                    {liveRate >= 0 ? '+' : ''}
                    {(liveRate * 100).toFixed(4)}%
                  </span>
                </div>

                <div className="flex flex-col items-end">
                  <span className="text-[10px] text-muted font-sans">Next Funding In</span>
                  <span className="text-sm font-bold font-mono-tabular text-primary">
                    {fundingCountdown}
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-color/40 flex items-center justify-between text-[11px]">
                <span className="text-muted">Annualized Est.</span>
                <span
                  className={`font-semibold font-mono-tabular ${
                    annualizedRate >= 0 ? 'text-success' : 'text-danger'
                  }`}
                >
                  {annualizedRate >= 0 ? '+' : ''}
                  {annualizedRate.toFixed(2)}% APR
                </span>
              </div>
            </div>

            {/* Protocol Caps & Details */}
            <div className="rounded-xl bg-tertiary/20 border border-color p-3 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">Funding Cap / Floor</span>
                <span className="font-mono-tabular font-semibold text-primary">
                  {fundingData?.fundingFeeCap
                    ? `+${(fundingData.fundingFeeCap * 100).toFixed(2)}% / ${(fundingData.fundingFeeFloor * 100).toFixed(2)}%`
                    : '+0.375% / -0.375%'}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">Interest Rate</span>
                <span className="font-mono-tabular font-semibold text-primary">
                  {fundingData?.interestRate
                    ? `${(parseFloat(fundingData.interestRate) * 100).toFixed(4)}%`
                    : '0.0100%'}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">Settlement Direction</span>
                <span className="font-semibold text-muted text-[11px]">
                  {liveRate >= 0 ? 'Longs pay Shorts' : 'Shorts pay Longs'}
                </span>
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-secondary border border-color/60 text-[10px] text-muted leading-relaxed">
              Funding rate maintains equilibrium between perpetual contract price and spot index
              price. SwiftEx collects no platform fee from funding payments.
            </div>
          </div>
        )}

        {/* LEVERAGE BRACKETS */}
        {activeSubTab === 'brackets' && (
          <div className="space-y-2.5">
            {loadingBrackets ? (
              <div className="py-8 text-center text-xs text-muted">Loading tier brackets...</div>
            ) : brackets.length === 0 ? (
              <div className="p-4 rounded-xl bg-tertiary/20 border border-color text-center space-y-1">
                <ShieldAlert size={20} className="mx-auto text-muted" />
                <p className="text-xs font-semibold text-primary">
                  Default Leverage: {maxLeverage}x
                </p>
                <p className="text-[10px] text-muted">
                  Max position brackets scale dynamically with market liquidity.
                </p>
              </div>
            ) : (
              brackets.map((b: any) => (
                <div
                  key={b.bracketSeq}
                  className="p-2.5 rounded-xl bg-tertiary/25 border border-color flex flex-col space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-tertiary flex items-center justify-center text-[10px] font-bold text-muted">
                        {b.bracketSeq}
                      </span>
                      <span className="text-xs font-bold text-primary">Tier {b.bracketSeq}</span>
                    </div>

                    <span className="text-xs font-bold text-brand px-2 py-0.5 rounded-md bg-brand/10">
                      {b.maxOpenPosLeverage}x Max
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                    <div className="flex flex-col">
                      <span className="text-[9px] text-muted">Notional Bracket</span>
                      <span className="font-mono-tabular font-medium text-primary">
                        ${b.bracketNotionalFloor.toLocaleString()} - $
                        {b.bracketNotionalCap.toLocaleString()}
                      </span>
                    </div>

                    <div className="flex flex-col items-end">
                      <span className="text-[9px] text-muted">Maintenance Margin</span>
                      <span className="font-mono-tabular font-medium text-primary">
                        {(b.bracketMaintenanceMarginRate * 100).toFixed(2)}%
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TOKEN PROFILE */}
        {activeSubTab === 'token' && (
          <div className="space-y-3">
            {loadingToken ? (
              <div className="py-8 text-center text-xs text-muted">Loading token profile...</div>
            ) : hasTokenDetail ? (
              <div className="space-y-3">
                {/* Token Description */}
                {tokenDetail.description && (
                  <div className="p-3 rounded-xl bg-tertiary/20 border border-color text-xs text-secondary leading-relaxed">
                    {tokenDetail.description}
                  </div>
                )}

                {/* Market Cap & Supply Stats */}
                <div className="rounded-xl bg-tertiary/20 border border-color p-3 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted">Market Cap</span>
                    <span className="font-mono-tabular font-semibold text-primary">
                      {quote.market_cap ? `$${formatLargeNum(quote.market_cap)}` : '--'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted">Fully Diluted Valuation (FDV)</span>
                    <span className="font-mono-tabular font-semibold text-primary">
                      {quote.fully_diluted_market_cap
                        ? `$${formatLargeNum(quote.fully_diluted_market_cap)}`
                        : '--'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted">Circulating Supply</span>
                    <span className="font-mono-tabular font-semibold text-primary">
                      {tokenDetail.metrics?.circulating_supply
                        ? `${formatLargeNum(tokenDetail.metrics.circulating_supply)} ${baseAsset}`
                        : '--'}
                    </span>
                  </div>

                  {athlData?.ath && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted">All-Time High (ATH)</span>
                      <span className="font-mono-tabular font-semibold text-success">
                        ${athlData.ath.toLocaleString()}
                      </span>
                    </div>
                  )}

                  {athlData?.atl && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted">All-Time Low (ATL)</span>
                      <span className="font-mono-tabular font-semibold text-danger">
                        ${athlData.atl.toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-tertiary/20 border border-color space-y-3">
                <div className="flex items-center gap-2">
                  <CoinIcon symbol={selectedSymbol} size={28} />
                  <div>
                    <h4 className="text-xs font-bold text-primary">{baseAsset} Token</h4>
                    <p className="text-[10px] text-muted">SwiftEx Perp DEX Listed Asset</p>
                  </div>
                </div>

                <div className="text-xs text-muted leading-relaxed">
                  {baseAsset} is an active perpetual market settled in {quoteAsset} with up to{' '}
                  {maxLeverage}x leverage. Real-time index price feeds and liquidity are synced from
                  Aster DEX.
                </div>

                <div className="pt-2 border-t border-color/40 flex items-center justify-between text-[11px]">
                  <span className="text-muted">Exchange Network</span>
                  <span className="font-semibold text-primary">Aster Testnet (1666)</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
