import {
  AlertCircle,
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  CandlestickChart,
  ChevronDown,
  LineChart,
  Loader2,
  Wallet,
  Zap,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';

import { useWalletStore } from '../../../walletconnect/store/walletConnectStore';
import { getSymbolDetail } from '../../adapters/aster/api/funding';
import { useAsterAgent } from '../../adapters/aster/hooks/useAsterAgent';
import { useHyperliquidAgent } from '../../adapters/hyperliquid/hooks/useHyperliquidAgent';
import { AlertsBellButton } from '../../alerts/components/AlertsBellButton';
import { useExchangeManager } from '../../core/ExchangeManager';
import { useAccountStore } from '../../core/stores/accountStore';
import { useLeverageStore } from '../../core/stores/leverageStore';
import { useMarketStore } from '../../core/stores/marketStore';
import { useOrderStore } from '../../core/stores/orderStore';
import { usePositionStore } from '../../core/stores/positionStore';
import { useTickerStore } from '../../core/stores/tickerStore';
import { safeFormatNumber } from '../../utils/precision';
import { MarketSelectorModal } from '../layout/MarketSelectorModal';
import { FundingHistoryTab } from '../layout/tabs/FundingHistoryTab';
import { OpenOrdersTab } from '../layout/tabs/OpenOrdersTab';
import { OrderHistoryTab } from '../layout/tabs/OrderHistoryTab';
import { PositionsTab } from '../layout/tabs/PositionsTab';
import { TradeHistoryTab } from '../layout/tabs/TradeHistoryTab';
import { TransactionHistoryTab } from '../layout/tabs/TransactionHistoryTab';
import { AccountModal } from '../trade/AccountModal';
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

  const isEvmConnected = useWalletStore(state => !!state.connectedWallets.evm?.address);
  const openWalletModal = useWalletStore(state => state.openModal);

  const asterAgent = useAsterAgent();
  const hyperliquidAgent = useHyperliquidAgent();
  const currentExchange = useExchangeManager(s => s.currentExchange);
  const currentNetwork = useExchangeManager(s => s.currentNetwork);
  const activeAgent = currentExchange === 'hyperliquid' ? hyperliquidAgent : asterAgent;
  const { isReady: isAgentReady, deriveAgentKey, deriveState, error: deriveError } = activeAgent;

  const isDepositError =
    deriveState === 'error' &&
    (deriveError?.message?.includes('Must deposit') ||
      deriveError?.message?.includes('after deposit') ||
      deriveError?.message?.includes('-5050'));

  const availableBalance = useAccountStore(state => state.availableBalance);
  const totalWalletBalance = useAccountStore(state => state.totalWalletBalance);
  const totalMarginBalance = useAccountStore(state => state.totalMarginBalance);
  const balances = useAccountStore(state => state.balances);
  const isAccountLoading = useAccountStore(state => state.isLoading);

  const walletBalance = useMemo(() => {
    if (availableBalance && parseFloat(availableBalance) > 0) {
      return parseFloat(availableBalance);
    }
    if (totalWalletBalance && parseFloat(totalWalletBalance) > 0) {
      return parseFloat(totalWalletBalance);
    }
    if (totalMarginBalance && parseFloat(totalMarginBalance) > 0) {
      return parseFloat(totalMarginBalance);
    }
    const qBal = balances[quoteAsset] || balances['USDT'] || balances['USDC'] || balances['USD'];
    if (qBal) {
      const val = parseFloat(qBal.available || qBal.total || '0');
      if (val > 0) return val;
    }
    return Object.values(balances).reduce((acc, b) => {
      const val = parseFloat(b.usdValue || b.available || b.total || '0');
      return isNaN(val) ? acc : acc + val;
    }, 0);
  }, [availableBalance, totalWalletBalance, totalMarginBalance, balances, quoteAsset]);

  const positionsCount = Object.keys(positions).length;
  const hasFunds = walletBalance > 0 || positionsCount > 0;
  const [showDepositModal, setShowDepositModal] = useState(false);

  const openOrdersCount = Object.values(orders).filter(
    o => o.status === 'new' || o.status === 'partially_filled'
  ).length;

  // Local UI States
  const [timeframe, setTimeframe] = useState('1d');
  const [chartType, setChartType] = useState<'candle' | 'line'>('candle');
  const [isIntervalSheetOpen, setIsIntervalSheetOpen] = useState(false);
  const [isMarketSelectorOpen, setIsMarketSelectorOpen] = useState(false);
  const [isExpandedAbout, setIsExpandedAbout] = useState(false);
  const [activeBottomTab, setActiveBottomTab] = useState<
    | 'positions'
    | 'orders'
    | 'orderHistory'
    | 'tradeHistory'
    | 'transactionHistory'
    | 'fundingHistory'
  >('positions');
  const [mobileTimeRange, setMobileTimeRange] = useState<'1d' | '1w'>('1w');

  return (
    <div className="flex flex-col h-full w-full bg-secondary text-primary font-body select-none overflow-hidden relative">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.04] shrink-0 bg-secondary z-30">
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
              {/* <span className="absolute -bottom-2 text-yellow-950 bg-gradient-to-r from-yellow-400 to-amber-500 text-[8px] leading-tight px-1 py-[0.5px] rounded-[3px] font-bold uppercase tracking-widest shadow-sm z-10 pointer-events-none border border-yellow-200/50">
                BETA
              </span> */}
            </div>
            <div className="flex flex-col leading-tight ml-0.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[15px] font-bold text-primary">{baseAsset}</span>
                <span className="px-1.5 py-[1px] rounded text-[9px] font-bold bg-tertiary border border-white/[0.08] text-muted">
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

        <div className="flex items-center gap-2">
          <div className="flex flex-col items-end justify-center leading-tight font-mono-tabular">
            <span className="text-base font-extrabold text-primary tracking-tight">
              $
              {markPrice
                ? safeFormatNumber(markPrice, markPrice < 10 ? 4 : 2, markPrice < 10 ? 4 : 2, '--')
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
          <AlertsBellButton />
        </div>
      </div>

      <div className="shrink-0 bg-secondary border-b border-white/[0.06] z-10 flex flex-col">
        <div className="w-full h-[225px] relative bg-secondary overflow-hidden">
          <MobileCleanChart symbol={selectedSymbol} timeframe={timeframe} chartType={chartType} />
        </div>

        <div className="flex items-center justify-between px-3 py-1.5 border-t border-white/[0.06] shrink-0 bg-secondary">
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

            <button
              onClick={() => setIsIntervalSheetOpen(true)}
              className="flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-medium text-secondary hover:text-primary hover:bg-tertiary transition-colors cursor-pointer"
            >
              <span>{timeframe}</span>
              <ChevronDown size={11} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-none pb-28 relative">
        <div className="px-4 py-3 border-b border-white/[0.04] bg-secondary">
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

        <div className="px-4 py-3 border-b border-white/[0.04] bg-secondary">
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

        <div className="flex flex-col min-h-[360px]">
          <div className="sticky top-0 z-20 flex items-center border-b border-white/[0.04] px-3 bg-secondary text-xs overflow-x-auto scrollbar-none shrink-0 gap-3 shadow-sm">
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

            {currentExchange === 'hyperliquid' ? (
              <button
                onClick={() => setActiveBottomTab('fundingHistory')}
                className={`py-2.5 px-1 transition-colors cursor-pointer whitespace-nowrap ${
                  activeBottomTab === 'fundingHistory'
                    ? 'text-primary font-bold border-b-2 border-brand'
                    : 'text-secondary hover:text-primary'
                }`}
              >
                Funding
              </button>
            ) : (
              <button
                onClick={() => setActiveBottomTab('transactionHistory')}
                className={`py-2.5 px-1 transition-colors cursor-pointer whitespace-nowrap ${
                  activeBottomTab === 'transactionHistory'
                    ? 'text-primary font-bold border-b-2 border-brand'
                    : 'text-secondary hover:text-primary'
                }`}
              >
                Transactions
              </button>
            )}

            {(activeBottomTab === 'orderHistory' ||
              activeBottomTab === 'tradeHistory' ||
              activeBottomTab === 'transactionHistory' ||
              activeBottomTab === 'fundingHistory') && (
              <div className="relative inline-flex items-center ml-auto shrink-0">
                <select
                  value={mobileTimeRange}
                  onChange={e => setMobileTimeRange(e.target.value as any)}
                  className="bg-tertiary text-secondary hover:text-primary border border-white/[0.08] rounded px-2 py-0.5 text-[10px] outline-none cursor-pointer pr-4 appearance-none transition-colors"
                >
                  <option value="1d">1d</option>
                  <option value="1w">1w</option>
                </select>
                <ChevronDown
                  size={9}
                  className="absolute right-1 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
                />
              </div>
            )}
          </div>

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
                timeRange={mobileTimeRange}
                hideOtherSymbols={false}
                hideCanceled={false}
              />
            )}

            {activeBottomTab === 'tradeHistory' && (
              <TradeHistoryTab
                signer={asterSigner}
                userAddr={userAddr || ''}
                asterSymbol={asterSymbol}
                timeRange={mobileTimeRange}
                hideOtherSymbols={false}
              />
            )}

            {activeBottomTab === 'transactionHistory' && (
              <TransactionHistoryTab
                signer={asterSigner}
                userAddr={userAddr || ''}
                asterSymbol={asterSymbol}
                timeRange={mobileTimeRange}
                hideOtherSymbols={false}
              />
            )}

            {activeBottomTab === 'fundingHistory' && (
              <FundingHistoryTab
                userAddr={userAddr || ''}
                asterSymbol={asterSymbol}
                timeRange={mobileTimeRange}
                hideOtherSymbols={false}
              />
            )}
          </div>
        </div>
      </div>

      <div className="fixed sm:absolute bottom-0 left-0 right-0 p-3 bg-secondary/85 backdrop-blur-xl flex flex-col gap-2 z-40 shadow-[0_-8px_30px_rgba(0,0,0,0.5)] pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-white/[0.04]">
        {isEvmConnected && isAgentReady && (
          <div className="flex items-center justify-between text-xs px-1 text-secondary">
            <div className="flex items-center gap-1.5 font-medium">
              <span className="text-muted">Avbl:</span>
              <span className="font-bold text-primary font-mono-tabular">
                {isAccountLoading && !walletBalance && positionsCount === 0 ? (
                  <span className="animate-pulse">Loading...</span>
                ) : (
                  `${safeFormatNumber(parseFloat(availableBalance || '0') > 0 ? parseFloat(availableBalance!) : walletBalance, 2, 2, '0.00')} ${quoteAsset}`
                )}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowDepositModal(true)}
              className="text-brand hover:text-brand-hover font-semibold text-xs flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Wallet size={13} />
              <span>{currentNetwork === 'testnet' ? 'Faucet / Deposit' : 'Deposit'}</span>
            </button>
          </div>
        )}

        {!isEvmConnected ? (
          <button
            type="button"
            onClick={openWalletModal}
            className="w-full h-12 rounded-2xl bg-brand hover:bg-brand-hover font-bold text-[15px] text-white transition-all shadow-lg active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2 tracking-wide"
          >
            <Wallet size={18} />
            <span>Connect Wallet</span>
          </button>
        ) : !isAgentReady ? (
          <div className="w-full space-y-1.5">
            <button
              type="button"
              onClick={() => {
                if (isDepositError) {
                  setShowDepositModal(true);
                } else {
                  deriveAgentKey();
                }
              }}
              disabled={deriveState === 'signing'}
              className={`w-full h-12 rounded-2xl font-bold text-[15px] text-white transition-all shadow-lg active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2 tracking-wide ${
                deriveState === 'signing'
                  ? 'bg-brand/80 cursor-wait'
                  : deriveState === 'error'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30'
                    : 'bg-brand hover:bg-brand-hover'
              }`}
            >
              {deriveState === 'signing' ? (
                <>
                  <Loader2 size={18} className="animate-spin text-white" />
                  <span>Waiting for Signature...</span>
                </>
              ) : deriveState === 'error' ? (
                <>
                  <AlertCircle size={18} className="text-rose-400" />
                  <span>
                    {isDepositError
                      ? currentNetwork === 'testnet'
                        ? 'Claim Faucet to Activate'
                        : 'Deposit to Activate'
                      : 'Signature Rejected — Try Again'}
                  </span>
                </>
              ) : (
                <>
                  <Zap size={18} className="text-white fill-white" />
                  <span>Enable 1-Click Trading</span>
                </>
              )}
            </button>
            <p className="text-[10.5px] text-center text-muted leading-tight">
              {deriveState === 'signing'
                ? 'Confirm the signature request in your wallet'
                : isDepositError
                  ? `Account requires initial deposit to activate ${currentExchange === 'hyperliquid' ? 'Hyperliquid' : 'Aster'}`
                  : `One-time signature to activate 1-click trading on ${currentExchange === 'hyperliquid' ? 'Hyperliquid' : 'Aster'}`}
            </p>
          </div>
        ) : isAccountLoading && !walletBalance && positionsCount === 0 ? (
          <button
            type="button"
            disabled
            className="w-full h-12 rounded-2xl bg-tertiary border border-white/[0.08] font-bold text-[15px] text-muted transition-all shadow-md flex items-center justify-center gap-2 cursor-wait"
          >
            <Loader2 size={18} className="animate-spin text-brand" />
            <span>Loading Account...</span>
          </button>
        ) : hasFunds ? (
          <div className="flex items-center gap-3 w-full">
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
        ) : (
          <button
            type="button"
            onClick={() => setShowDepositModal(true)}
            className="w-full h-12 rounded-2xl bg-brand hover:bg-brand-hover font-bold text-[15px] text-white transition-all shadow-lg active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2 tracking-wide"
          >
            <Wallet size={18} />
            <span>
              {currentNetwork === 'testnet' ? 'Claim Testnet Faucet / Deposit' : 'Deposit Funds'}
            </span>
          </button>
        )}
      </div>

      <AccountModal
        isOpen={showDepositModal}
        onClose={() => setShowDepositModal(false)}
        initialTab="deposit"
      />

      <MobileIntervalSheet
        isOpen={isIntervalSheetOpen}
        onClose={() => setIsIntervalSheetOpen(false)}
        selectedInterval={timeframe}
        onSelectInterval={setTimeframe}
      />

      <MarketSelectorModal
        isOpen={isMarketSelectorOpen}
        onClose={() => setIsMarketSelectorOpen(false)}
      />
    </div>
  );
};
