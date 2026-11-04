import {
  Calendar,
  ChevronRight,
  Compass,
  Download,
  RefreshCw,
  Sliders,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X as XIcon,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';

import { portfolioUtils } from '../../../modules/walletconnect/utils/portfolioUtils';

interface StellarPerformanceCardProps {
  stellarTotal: number;
  stellarPnlData: any;
  loadingStellarPnl: boolean;
  stellarPnlError: string | null;
  stellarTimeframe: '1w' | '1m' | '2m' | '3m';
  setStellarTimeframe: (tf: '1w' | '1m' | '2m' | '3m') => void;
  stellarSubTab: 'overview' | 'highlights' | 'stats';
  setStellarSubTab: (tab: 'overview' | 'highlights' | 'stats') => void;

  // Timeframe and date range
  fromDate: string | null;
  toDate: string | null;
  setFromDate: (date: string | null) => void;
  setToDate: (date: string | null) => void;
  clearRange: () => void;
  isDateRangeActive: boolean;
  minFromDate: string;
  maxFromDate: string;
  minToDate: string;
  maxToDate: string;

  // Wallet & Cost basis actions
  isSwiftExUser: boolean;
  connectedWallets: any;
  openModal: () => void;
  handleOpenCostBasis: () => void;
  loadingCostBasisDetails: boolean;
  totalOpeningCostBasis: number;
  adjustedStellarPnl: number;
  onExportReport: () => void;
}

export const StellarPerformanceCard: React.FC<StellarPerformanceCardProps> = ({
  stellarTotal,
  stellarPnlData,
  loadingStellarPnl,
  stellarPnlError,
  stellarTimeframe,
  setStellarTimeframe,
  stellarSubTab,
  setStellarSubTab,
  fromDate,
  toDate,
  setFromDate,
  setToDate,
  clearRange,
  isDateRangeActive,
  minFromDate,
  maxFromDate,
  minToDate,
  maxToDate,
  isSwiftExUser,
  connectedWallets,
  openModal,
  handleOpenCostBasis,
  loadingCostBasisDetails,
  totalOpeningCostBasis,
  adjustedStellarPnl,
  onExportReport,
}) => {
  const [isStellarCollapsed, setIsStellarCollapsed] = useState<boolean>(false);

  // Normalized safe fallback data so all metrics, cards, and charts render smoothly with meaningful zero values
  const pnlData = useMemo(() => {
    return (
      stellarPnlData || {
        totalPnL: 0,
        winRate: 0,
        tradeCount: 0,
        disposalCount: 0,
        positionCount: 0,
        totalRealized: 0,
        totalUnrealized: 0,
        usdcReceived: 0,
        usdcSpent: 0,
        netUSDCFlow: 0,
        activeDays: 0,
        mostTradedAsset: '—',
        bestTrade: null,
        worstTrade: null,
        largestPosition: null,
        firstTradeDate: null,
        lastTradeDate: null,
        hasPriceWarnings: false,
      }
    );
  }, [stellarPnlData]);

  return (
    <div className="bg-(--color-bg-secondary) border border-(--color-border) rounded-2xl p-4 shadow-md flex flex-col space-y-3">
      <div
        onClick={() => setIsStellarCollapsed(!isStellarCollapsed)}
        className="flex items-center justify-between cursor-pointer py-1 select-none"
      >
        <div className="flex items-center gap-2">
          <Compass size={18} className="text-purple-400" />
          <h4 className="font-bold text-sm text-(--color-text-primary)">Stellar Performance</h4>
          {!connectedWallets.stellar?.address ? (
            <button
              onClick={e => {
                e.stopPropagation();
                openModal();
              }}
              className="text-[10px] bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded-full font-semibold cursor-pointer transition"
            >
              Connect Wallet
            </button>
          ) : stellarTotal === 0 ? (
            <span className="text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded-full font-semibold">
              $0.00 Balance
            </span>
          ) : null}
        </div>
        <ChevronRight
          size={16}
          className={`text-(--color-text-secondary) transition-transform duration-300 ${!isStellarCollapsed ? 'rotate-90' : ''}`}
        />
      </div>

      {!isStellarCollapsed && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <span className="text-xs font-semibold text-(--color-text-secondary)">
                Stellar Wallet Valuation
              </span>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-2xl font-black text-(--color-text-primary)">
                  {portfolioUtils.formatUSD(stellarTotal)}
                </span>
                <span
                  className={`text-xs font-bold flex items-center ${
                    (pnlData.totalPnL || 0) > 0
                      ? 'text-green-400'
                      : (pnlData.totalPnL || 0) < 0
                        ? 'text-red-400'
                        : 'text-(--color-text-secondary)'
                  }`}
                >
                  {(pnlData.totalPnL || 0) >= 0 ? '▲' : '▼'}{' '}
                  {portfolioUtils.formatUSD(Math.abs(pnlData.totalPnL || 0))}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 flex-wrap sm:justify-end">
                <div className="flex items-center bg-(--color-bg-tertiary) border border-(--color-border) rounded-xl px-3 py-1.5 shadow-sm gap-2">
                  <Calendar size={13} className="text-(--color-text-secondary) shrink-0" />
                  <input
                    type="date"
                    value={fromDate || ''}
                    min={minFromDate}
                    max={maxFromDate}
                    onKeyDown={e => e.preventDefault()}
                    onChange={e => setFromDate(e.target.value || null)}
                    className="bg-transparent text-[11.5px] font-semibold text-(--color-text-primary) outline-none w-[105px] cursor-pointer"
                    placeholder="From"
                  />
                  <span className="text-(--color-text-secondary) text-[10px] font-bold px-0.5 select-none">
                    TO
                  </span>
                  <input
                    type="date"
                    value={toDate || ''}
                    min={minToDate}
                    max={maxToDate}
                    onKeyDown={e => e.preventDefault()}
                    onChange={e => setToDate(e.target.value || null)}
                    className="bg-transparent text-[11.5px] font-semibold text-(--color-text-primary) outline-none w-[105px] cursor-pointer"
                    placeholder="To"
                  />
                </div>
                {isDateRangeActive && (
                  <button
                    onClick={clearRange}
                    className="p-1.5 rounded-lg bg-(--color-bg-tertiary) border border-(--color-border) text-(--color-text-secondary) hover:text-red-400 transition cursor-pointer"
                  >
                    <XIcon size={12} />
                  </button>
                )}
                <button
                  onClick={handleOpenCostBasis}
                  disabled={loadingCostBasisDetails}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm border border-purple-500/30 text-purple-600 dark:text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {loadingCostBasisDetails ? (
                    <RefreshCw size={13} className="animate-spin shrink-0" />
                  ) : (
                    <Sliders size={13} className="shrink-0" />
                  )}
                  Stellar Cost Basis
                </button>
                <button
                  onClick={onExportReport}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 active:scale-95 cursor-pointer"
                >
                  <Download size={13} className="shrink-0" />
                  Stellar Report
                </button>
              </div>

              <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto sm:justify-end">
                {!isDateRangeActive ? (
                  <div className="flex gap-1 bg-(--color-bg-tertiary) p-1 rounded-xl border border-(--color-border)">
                    {(
                      [
                        { id: '1w', label: '1w' },
                        { id: '1m', label: '1m' },
                        { id: '2m', label: '2m' },
                        { id: '3m', label: '3m' },
                      ] as const
                    ).map(tf => (
                      <button
                        key={tf.id}
                        onClick={() => setStellarTimeframe(tf.id)}
                        className={`px-2.5 py-1 rounded-lg text-[10.5px] font-bold transition-all cursor-pointer ${
                          stellarTimeframe === tf.id
                            ? 'bg-brand text-white shadow-sm'
                            : 'text-(--color-text-secondary) hover:text-(--color-text-primary)'
                        }`}
                      >
                        {tf.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-[10.5px] text-brand-primary font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-primary animate-pulse" />
                    Custom range
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="min-h-[160px] w-full flex flex-col md:flex-row items-center justify-between bg-gradient-to-r from-purple-950/20 to-pink-950/10 border border-purple-500/20 rounded-2xl overflow-hidden p-4 gap-4">
            {loadingStellarPnl ? (
              <div className="flex flex-col items-center justify-center h-full w-full py-8 gap-2 text-xs text-(--color-text-secondary)">
                <RefreshCw size={18} className="animate-spin text-brand-primary" />
                <span>Loading Stellar metrics…</span>
              </div>
            ) : (
              <>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                      <Compass size={16} />
                    </span>
                    <div>
                      <h4 className="text-sm font-bold text-(--color-text-primary)">
                        Stellar Overview
                      </h4>
                      <p className="text-[11px] text-(--color-text-secondary)">
                        {isSwiftExUser ? 'SwiftEx Member Analytics' : 'Valuation & outcomes'}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-0.5 pt-1">
                    <span className="text-[10px] uppercase font-bold text-(--color-text-secondary) tracking-wider">
                      Wallet Balance
                    </span>
                    <div className="text-2xl font-black text-(--color-text-primary) tracking-tight">
                      {portfolioUtils.formatUSD(stellarTotal)}
                    </div>
                    <span className="text-[10.5px] text-(--color-text-secondary) flex items-center gap-1.5">
                      Address:
                      {connectedWallets.stellar?.address ? (
                        <span className="font-mono text-purple-400/90 text-[10px] bg-purple-500/5 px-2 py-0.5 rounded-lg border border-purple-500/10">
                          {`${connectedWallets.stellar.address.slice(0, 8)}…${connectedWallets.stellar.address.slice(-8)}`}
                        </span>
                      ) : (
                        <button
                          onClick={openModal}
                          className="font-mono text-purple-400 text-[10px] bg-purple-500/10 hover:bg-purple-500/20 px-2 py-0.5 rounded-lg border border-purple-500/20 hover:underline cursor-pointer transition"
                        >
                          Connect Wallet
                        </button>
                      )}
                    </span>
                  </div>
                </div>

                <div className="flex-1 w-full md:w-auto h-full flex flex-col justify-center bg-purple-950/10 border border-purple-500/10 rounded-xl p-3 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-(--color-text-secondary) font-semibold">
                      Net Outcomes
                    </span>
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        (pnlData?.totalPnL ?? 0) > 0
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : (pnlData?.totalPnL ?? 0) < 0
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            : 'bg-(--color-bg-tertiary) text-(--color-text-secondary) border border-(--color-border)'
                      }`}
                    >
                      {(pnlData?.totalPnL ?? 0) > 0
                        ? 'Profit'
                        : (pnlData?.totalPnL ?? 0) < 0
                          ? 'Loss'
                          : 'Neutral'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-(--color-text-secondary) tracking-wider">
                      Trading Net PnL
                    </span>
                    <div className="flex items-baseline gap-2 mt-0.5">
                      <span
                        className={`text-2xl font-black ${
                          (pnlData?.totalPnL ?? 0) > 0
                            ? 'text-green-400'
                            : (pnlData?.totalPnL ?? 0) < 0
                              ? 'text-red-400'
                              : 'text-(--color-text-secondary)'
                        }`}
                      >
                        {(pnlData?.totalPnL ?? 0) > 0 ? '+' : ''}
                        {portfolioUtils.formatUSD(pnlData?.totalPnL ?? 0)}
                      </span>
                      {totalOpeningCostBasis > 0 && (
                        <span
                          className={`text-sm font-bold ${adjustedStellarPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}
                        >
                          (adj. {adjustedStellarPnl >= 0 ? '+' : ''}
                          {portfolioUtils.formatUSD(adjustedStellarPnl)})
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="w-full bg-(--color-bg-tertiary) h-1.5 rounded-full overflow-hidden flex">
                    {pnlData.usdcSpent > 0 || pnlData.usdcReceived > 0 ? (
                      <>
                        <div
                          style={{
                            width: `${(pnlData.usdcReceived / (pnlData.usdcReceived + pnlData.usdcSpent || 1)) * 100}%`,
                          }}
                          className="bg-emerald-500 h-full"
                        />
                        <div
                          style={{
                            width: `${(pnlData.usdcSpent / (pnlData.usdcReceived + pnlData.usdcSpent || 1)) * 100}%`,
                          }}
                          className="bg-rose-500 h-full"
                        />
                      </>
                    ) : (
                      <div className="bg-(--color-border)/60 w-full h-full" />
                    )}
                  </div>
                  <div className="flex justify-between text-[9.5px] text-(--color-text-secondary) font-bold uppercase">
                    <span className="text-emerald-400">
                      Inflow (
                      {(
                        (pnlData.usdcReceived / (pnlData.usdcReceived + pnlData.usdcSpent || 1)) *
                          100 || 0
                      ).toFixed(0)}
                      %)
                    </span>
                    <span className="text-rose-400">
                      Outflow (
                      {(
                        (pnlData.usdcSpent / (pnlData.usdcReceived + pnlData.usdcSpent || 1)) *
                          100 || 0
                      ).toFixed(0)}
                      %)
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>

          {stellarPnlError && (
            <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs">
              <span className="shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-purple-500/20 text-purple-400 font-bold select-none text-[11px]">
                ℹ
              </span>
              <div>{stellarPnlError}</div>
            </div>
          )}

          <div className="flex border-b border-(--color-border)/50 pb-px mt-1 justify-start overflow-x-auto hide-scrollbar select-none gap-4">
            {(
              [
                { id: 'overview', label: 'Overview' },
                { id: 'highlights', label: 'Trading Highlights' },
                { id: 'stats', label: 'Detailed Metrics' },
              ] as const
            ).map(({ id, label }) => {
              const isActive = stellarSubTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setStellarSubTab(id)}
                  className={`pb-2 px-1 text-xs font-bold transition-all relative shrink-0 cursor-pointer ${
                    isActive
                      ? 'text-purple-400 font-extrabold'
                      : 'text-(--color-text-secondary) hover:text-(--color-text-primary)'
                  }`}
                >
                  {label}
                  {isActive && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-purple-400" />
                  )}
                </button>
              );
            })}
          </div>

          {pnlData.hasPriceWarnings && (
            <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
              <span className="shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/10 text-amber-500 font-bold select-none text-[11px]">
                !
              </span>
              <div>
                <span className="font-bold">Cost Basis Warning:</span> Some asset prices were
                estimated or missing. Metrics might not be fully accurate.
              </div>
            </div>
          )}

          {stellarSubTab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
              <div className="p-4 bg-gradient-to-br from-purple-950/5 to-pink-950/5 border border-purple-500/10 rounded-2xl flex flex-col sm:flex-row items-center gap-4">
                <div className="relative flex items-center justify-center">
                  <svg
                    className="w-20 h-20 transform -rotate-90 select-none shrink-0"
                    viewBox="0 0 36 36"
                  >
                    <path
                      className="text-purple-500/10"
                      strokeWidth="3"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path
                      className="text-purple-400"
                      strokeWidth="3.2"
                      strokeDasharray={`${pnlData.winRate ?? 0}, 100`}
                      strokeLinecap="round"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                  <div className="absolute flex flex-col items-center justify-center">
                    <span className="text-lg font-black text-(--color-text-primary)">
                      {pnlData.winRate ?? 0}%
                    </span>
                    <span className="text-[9px] uppercase font-bold text-(--color-text-secondary) tracking-wider">
                      Win Rate
                    </span>
                  </div>
                </div>
                <div className="flex-1 text-center sm:text-left space-y-1">
                  <h5 className="text-xs font-black text-(--color-text-primary) uppercase tracking-wider text-purple-400">
                    Trade Outcome Analysis
                  </h5>
                  <p className="text-[11.5px] text-(--color-text-secondary) leading-relaxed">
                    Out of{' '}
                    <span className="text-(--color-text-primary) font-bold">
                      {pnlData.tradeCount ?? 0}
                    </span>{' '}
                    trades, win rate{' '}
                    <span className="text-(--color-text-primary) font-bold">
                      {pnlData.winRate ?? 0}%
                    </span>
                    . Disposals:{' '}
                    <span className="text-(--color-text-primary) font-bold">
                      {pnlData.disposalCount ?? 0}
                    </span>
                    .
                  </p>
                </div>
              </div>

              <div className="p-4 bg-gradient-to-br from-purple-950/5 to-pink-950/5 border border-purple-500/10 rounded-2xl flex flex-col justify-between">
                <div className="space-y-2">
                  <h5 className="text-xs font-black text-(--color-text-primary) uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                    <Calendar size={13} />
                    Trading Timeline
                  </h5>
                  <div className="relative pl-6 border-l-2 border-purple-500/10 space-y-3 py-1">
                    <div className="relative">
                      <span className="absolute -left-[30px] top-0.5 w-2 h-2 rounded-full bg-purple-400 border-4 border-secondary box-content" />
                      <span className="text-[9.5px] uppercase font-bold text-(--color-text-secondary) block tracking-wider">
                        First Trade
                      </span>
                      <span className="text-xs font-bold text-(--color-text-primary) mt-0.5 block">
                        {pnlData.firstTradeDate
                          ? new Date(pnlData.firstTradeDate).toLocaleDateString(undefined, {
                              dateStyle: 'medium',
                            })
                          : '—'}
                      </span>
                    </div>
                    <div className="relative">
                      <span className="absolute -left-[30px] top-0.5 w-2 h-2 rounded-full bg-pink-400 border-4 border-secondary box-content" />
                      <span className="text-[9.5px] uppercase font-bold text-(--color-text-secondary) block tracking-wider">
                        Last Trade
                      </span>
                      <span className="text-xs font-bold text-(--color-text-primary) mt-0.5 block">
                        {pnlData.lastTradeDate
                          ? new Date(pnlData.lastTradeDate).toLocaleDateString(undefined, {
                              dateStyle: 'medium',
                            })
                          : '—'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-(--color-border)/30 text-[11px] text-(--color-text-secondary)">
                  <span>
                    Active Days:{' '}
                    <span className="font-bold text-(--color-text-primary)">
                      {pnlData.activeDays ?? 0}
                    </span>
                  </span>
                  <span>
                    Most Traded:{' '}
                    <span className="font-bold text-(--color-text-primary)">
                      {pnlData.mostTradedAsset ?? '—'}
                    </span>
                  </span>
                </div>
              </div>
            </div>
          )}

          {stellarSubTab === 'highlights' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-2">
              <div className="p-4 bg-gradient-to-br from-emerald-500/5 to-teal-500/5 border border-emerald-500/10 hover:border-emerald-500/20 rounded-2xl transition duration-300 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/5 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none group-hover:bg-emerald-500/10 transition" />
                <div className="flex items-center justify-between pb-2 border-b border-emerald-500/10">
                  <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">
                    Best Trade
                  </span>
                  <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                    <TrendingUp size={14} />
                  </span>
                </div>
                <div className="pt-3 space-y-1">
                  <div className="text-2xl font-black text-emerald-400">
                    {pnlData.bestTrade
                      ? `+${portfolioUtils.formatUSD(pnlData.bestTrade.pnl ?? 0)}`
                      : '+$0.00'}
                  </div>
                  <div className="space-y-0.5 text-xs">
                    <div className="text-(--color-text-secondary)">
                      Asset:{' '}
                      <span className="font-bold text-(--color-text-primary)">
                        {pnlData.bestTrade?.asset ?? '—'}
                      </span>
                    </div>
                    <div className="text-(--color-text-secondary)">
                      Date:{' '}
                      <span className="font-bold text-(--color-text-primary)">
                        {pnlData.bestTrade?.date
                          ? new Date(pnlData.bestTrade.date).toLocaleDateString(undefined, {
                              dateStyle: 'medium',
                            })
                          : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-gradient-to-br from-rose-500/5 to-red-500/5 border border-rose-500/10 hover:border-rose-500/20 rounded-2xl transition duration-300 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-20 h-20 bg-rose-500/5 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none group-hover:bg-rose-500/10 transition" />
                <div className="flex items-center justify-between pb-2 border-b border-rose-500/10">
                  <span className="text-[10px] uppercase font-bold text-rose-400 tracking-wider">
                    Worst Trade
                  </span>
                  <span className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400">
                    <TrendingDown size={14} />
                  </span>
                </div>
                <div className="pt-3 space-y-1">
                  <div className="text-2xl font-black text-rose-400">
                    {pnlData.worstTrade
                      ? portfolioUtils.formatUSD(pnlData.worstTrade.pnl ?? 0)
                      : '$0.00'}
                  </div>
                  <div className="space-y-0.5 text-xs">
                    <div className="text-(--color-text-secondary)">
                      Asset:{' '}
                      <span className="font-bold text-(--color-text-primary)">
                        {pnlData.worstTrade?.asset ?? '—'}
                      </span>
                    </div>
                    <div className="text-(--color-text-secondary)">
                      Date:{' '}
                      <span className="font-bold text-(--color-text-primary)">
                        {pnlData.worstTrade?.date
                          ? new Date(pnlData.worstTrade.date).toLocaleDateString(undefined, {
                              dateStyle: 'medium',
                            })
                          : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-gradient-to-br from-purple-500/5 to-indigo-500/5 border border-purple-500/10 hover:border-purple-500/20 rounded-2xl transition duration-300 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-20 h-20 bg-purple-500/5 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none group-hover:bg-purple-500/10 transition" />
                <div className="flex items-center justify-between pb-2 border-b border-purple-500/10">
                  <span className="text-[10px] uppercase font-bold text-purple-400 tracking-wider">
                    Largest Position
                  </span>
                  <span className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400">
                    <Sparkles size={14} />
                  </span>
                </div>
                <div className="pt-3 space-y-1">
                  <div className="text-2xl font-black text-(--color-text-primary)">
                    {portfolioUtils.formatUSD(pnlData.largestPosition?.currentValue ?? 0)}
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="text-(--color-text-secondary)">
                      Holding:{' '}
                      <span className="font-bold text-(--color-text-primary)">
                        {pnlData.largestPosition
                          ? `${(pnlData.largestPosition.remaining ?? 0).toFixed(4)} ${pnlData.largestPosition.asset ?? '—'}`
                          : '0.0000 —'}
                      </span>
                    </div>
                    <div className="space-y-1 pt-1">
                      <div className="flex justify-between text-[10px] font-bold text-(--color-text-secondary)">
                        <span>PORTFOLIO SHARE</span>
                        <span>
                          {pnlData.largestPosition && pnlData.totalPortfolioValue
                            ? `${((pnlData.largestPosition.currentValue / (pnlData.totalPortfolioValue || 1)) * 100).toFixed(1)}%`
                            : '0.0%'}
                        </span>
                      </div>
                      <div className="w-full bg-(--color-bg-tertiary) h-1 rounded-full overflow-hidden">
                        <div
                          className="bg-purple-400 h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${
                              pnlData.largestPosition && pnlData.totalPortfolioValue
                                ? Math.min(
                                    100,
                                    (pnlData.largestPosition.currentValue /
                                      (pnlData.totalPortfolioValue || 1)) *
                                      100
                                  )
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {stellarSubTab === 'stats' && (
            <div className="space-y-3 mt-2">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 text-xs">
                <div className="p-2.5 bg-(--color-bg-tertiary)/50 border border-(--color-border)/40 rounded-xl flex flex-col justify-between min-h-[65px]">
                  <span className="text-(--color-text-secondary) block text-[10px] uppercase font-bold tracking-wider">
                    Total Trades
                  </span>
                  <span className="font-black text-sm text-(--color-text-primary) mt-1 block">
                    {pnlData.tradeCount ?? 0}
                  </span>
                </div>
                <div className="p-2.5 bg-(--color-bg-tertiary)/50 border border-(--color-border)/40 rounded-xl flex flex-col justify-between min-h-[65px]">
                  <span className="text-(--color-text-secondary) block text-[10px] uppercase font-bold tracking-wider">
                    Open Positions
                  </span>
                  <span className="font-black text-sm text-(--color-text-primary) mt-1 block">
                    {pnlData.positionCount ?? 0}
                  </span>
                </div>
                <div className="p-2.5 bg-(--color-bg-tertiary)/50 border border-(--color-border)/40 rounded-xl flex flex-col justify-between min-h-[65px]">
                  <span className="text-(--color-text-secondary) block text-[10px] uppercase font-bold tracking-wider">
                    Disposals
                  </span>
                  <span className="font-black text-sm text-(--color-text-primary) mt-1 block">
                    {pnlData.disposalCount ?? 0}
                  </span>
                </div>
                <div className="p-2.5 bg-(--color-bg-tertiary)/50 border border-(--color-border)/40 rounded-xl flex flex-col justify-between min-h-[65px]">
                  <span className="text-(--color-text-secondary) block text-[10px] uppercase font-bold tracking-wider">
                    Realized PnL
                  </span>
                  <span
                    className={`font-black text-sm mt-1 block ${(pnlData.totalRealized ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}
                  >
                    {portfolioUtils.formatUSD(pnlData.totalRealized ?? 0)}
                  </span>
                </div>
                <div className="p-2.5 bg-(--color-bg-tertiary)/50 border border-(--color-border)/40 rounded-xl flex flex-col justify-between min-h-[65px]">
                  <span className="text-(--color-text-secondary) block text-[10px] uppercase font-bold tracking-wider">
                    Unrealized PnL
                  </span>
                  <span
                    className={`font-black text-sm mt-1 block ${(pnlData.totalUnrealized ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}
                  >
                    {portfolioUtils.formatUSD(pnlData.totalUnrealized ?? 0)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs bg-(--color-bg-tertiary)/25 p-3 rounded-2xl border border-(--color-border)/40">
                <div className="space-y-0.5">
                  <span className="text-(--color-text-secondary) block text-[9.5px] uppercase font-bold tracking-wider">
                    USDC Received
                  </span>
                  <span className="font-bold text-xs text-(--color-text-primary) block">
                    {portfolioUtils.formatUSD(pnlData.usdcReceived ?? 0)}
                  </span>
                </div>
                <div className="space-y-0.5">
                  <span className="text-(--color-text-secondary) block text-[9.5px] uppercase font-bold tracking-wider">
                    USDC Spent
                  </span>
                  <span className="font-bold text-xs text-(--color-text-primary) block">
                    {portfolioUtils.formatUSD(pnlData.usdcSpent ?? 0)}
                  </span>
                </div>
                <div className="space-y-0.5">
                  <span className="text-(--color-text-secondary) block text-[9.5px] uppercase font-bold tracking-wider">
                    Net USDC Flow
                  </span>
                  <span
                    className={`font-bold text-xs block ${(pnlData.netUSDCFlow ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}
                  >
                    {portfolioUtils.formatUSD(pnlData.netUSDCFlow ?? 0)}
                  </span>
                </div>
                <div className="space-y-0.5">
                  <span className="text-(--color-text-secondary) block text-[9.5px] uppercase font-bold tracking-wider">
                    Net Period PnL
                  </span>
                  <span
                    className={`font-black text-xs block ${(pnlData.totalPnL ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}
                  >
                    {(pnlData.totalPnL ?? 0) >= 0 ? '+' : ''}
                    {portfolioUtils.formatUSD(pnlData.totalPnL ?? 0)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
