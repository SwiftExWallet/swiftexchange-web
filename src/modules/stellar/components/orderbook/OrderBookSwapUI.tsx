import {
  AlertCircle,
  ArrowRightLeft,
  Check,
  CheckCircle,
  ChevronDown,
  Copy,
  RefreshCw,
} from 'lucide-react';
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useTransactionModalStore } from '../../../../store/transactionModalStore';
import { getTokenIcon } from '../../../evm/utils/ChainUrlHelpers';
import { getChainById } from '../../../evm/utils/Chainregistry';
import { useIsMobile } from '../../../perps/components/chart/hooks/useIsMobile';
import { WalletType } from '../../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../../walletconnect/hooks/useWalletConnect';
import { useWalletStore } from '../../../walletconnect/store/walletConnectStore';
import { portfolioUtils } from '../../../walletconnect/utils/portfolioUtils';
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from '../../constants/orderBookSwapConstants';
import { useLargeOrder } from '../../hook/useOrderBookSwap';
import { useStickySidebar } from '../../hook/useStickySidebar';
import { useAmmSwapStore } from '../../store/ammSwapStore';
import { useLargeOrderStore } from '../../store/orderBookSwapStore';
import { StellarAccountPanel } from '../account/StellarAccountPanel';
import StellarAssetSelectorModal from '../modals/StellarAssetSelectorModal';
import OrderBook from './OrderBook';

const StellarTradingChart = lazy(() => import('../chart/StellarTradingChart'));
const LastTrades = lazy(() => import('../tradescreen/LastTrades'));
const TradeTransactionUI = lazy(() => import('../TradeTransactionUI'));

const OrderBookSwapUI = () => {
  const isMobile = useIsMobile();
  const { sidebarRef, stickyStyle } = useStickySidebar();
  const [orderStatus, setOrderStatus] = useState<'pending' | 'success' | 'error' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'trade' | 'chart'>('trade');
  const [middleColumnTab, setMiddleColumnTab] = useState<'book' | 'trades'>('book');
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectingAssetFor, setSelectingAssetFor] = useState<'from' | 'to' | null>(null);
  const [orderRateType, setOrderRateType] = useState<'limit' | 'market'>('limit');
  const [copied, setCopied] = useState(false);

  const { connectedWallets, getProvider, openModal } = useWalletConnect();
  const currentNetwork = useWalletStore(state => state.network);
  const stellarWallet = connectedWallets[WalletType.STELLAR];
  const stellarAddress = stellarWallet?.address || '';

  const {
    isBuy,
    fromToken,
    toToken,
    amount,
    price,
    total,
    quote,
    isLoading,
    error,
    orderBook,
    availableTokens,
    setIsBuy,
    setFromToken,
    setToToken,
    setAmount,
    setPrice,
    setTotal,
    setAmountPercentage,
    setMaxAmount,
    buildTransaction,
    executeOrderWithWalletConnect,
    refreshOrderBook,
    reset,
    subentryCount,
    fetchBalances,
    isRefreshingBalances,
  } = useLargeOrder({ userAddress: stellarAddress });

  useEffect(() => {
    if (orderRateType === 'market' && orderBook) {
      const bestPrice = isBuy ? orderBook.asks?.[0]?.price || '' : orderBook.bids?.[0]?.price || '';
      if (bestPrice) setPrice(bestPrice);
    }
  }, [orderRateType, orderBook, isBuy, setPrice]);

  const handleRateTypeChange = (type: 'limit' | 'market') => {
    setOrderRateType(type);
    if (type === 'market') {
      const bestPrice = isBuy
        ? orderBook?.asks?.[0]?.price || ''
        : orderBook?.bids?.[0]?.price || '';
      if (bestPrice) setPrice(bestPrice);
    } else {
      setPrice('');
    }
  };

  const { addTransaction } = useLargeOrderStore();
  const { setSelectedChartPair } = useAmmSwapStore();
  const isMainnet = currentNetwork === 'mainnet';
  const stellarChainId = isMainnet ? 'pubnet' : 'testnet';
  const chainConfig = getChainById(stellarChainId);
  const lastChartPairRef = useRef<string>('');

  useEffect(() => {
    if (!fromToken || !toToken) return;
    const pairId = `${fromToken.code}:${fromToken.issuer}-${toToken.code}:${toToken.issuer}`;
    if (lastChartPairRef.current !== pairId) {
      lastChartPairRef.current = pairId;
      setSelectedChartPair({
        base: fromToken.code,
        counter: toToken.code,
        baseIssuer: fromToken.issuer,
        counterIssuer: toToken.issuer,
      });
    }
    const newParams = new URLSearchParams(searchParams);
    let needsUpdate = false;
    if (newParams.get('sellAsset') !== fromToken.code) {
      newParams.set('sellAsset', fromToken.code);
      needsUpdate = true;
    }
    if (newParams.get('buyAsset') !== toToken.code) {
      newParams.set('buyAsset', toToken.code);
      needsUpdate = true;
    }
    if (needsUpdate) setSearchParams(newParams, { replace: true });
  }, [fromToken?.code, fromToken?.issuer, toToken?.code, toToken?.issuer, setSelectedChartPair]);

  useEffect(() => {
    if (availableTokens.length === 0) return;
    const sellAsset = searchParams.get('sellAsset');
    const buyAsset = searchParams.get('buyAsset');
    if (sellAsset && sellAsset !== fromToken?.code) {
      const token = availableTokens.find(t => t.code === sellAsset);
      if (token) setFromToken(token);
    }
    if (buyAsset && buyAsset !== toToken?.code) {
      const token = availableTokens.find(t => t.code === buyAsset);
      if (token) setToToken(token);
    }
  }, [availableTokens, searchParams, fromToken?.code, toToken?.code]);

  const handlePlaceOrder = useCallback(async () => {
    if (!stellarWallet) {
      openModal();
      return;
    }
    if (!fromToken || !toToken || !amount || !price) {
      setErrorMessage('Please fill in all required fields');
      setOrderStatus('error');
      return;
    }
    if (parseFloat(amount) <= 0 || parseFloat(price) <= 0) {
      setErrorMessage('Amount and price must be greater than 0');
      setOrderStatus('error');
      return;
    }

    setOrderStatus('pending');
    setErrorMessage(null);

    try {
      const tx = await buildTransaction();
      const provider = getProvider(WalletType.STELLAR);
      if (!provider) throw new Error('Stellar wallet provider not available');
      const txHash = await executeOrderWithWalletConnect(tx, provider);

      useTransactionModalStore.getState().openModal({
        status: 'success',
        type: 'Order',
        hash: txHash,
        isStellar: true,
      });

      setOrderStatus('success');
      refreshOrderBook();
      setTimeout(() => {
        setOrderStatus(null);
        reset();
      }, 3000);
    } catch (err: any) {
      setOrderStatus('error');
      const message = err?.message || ERROR_MESSAGES.ORDER_FAILED;
      setErrorMessage(message);
      useTransactionModalStore.getState().openModal({
        status: 'error',
        type: 'Order',
        error: message,
        isStellar: true,
      });
    }
  }, [
    fromToken,
    toToken,
    amount,
    price,
    stellarWallet,
    buildTransaction,
    getProvider,
    executeOrderWithWalletConnect,
    addTransaction,
    refreshOrderBook,
    reset,
  ]);

  const canPlaceOrder =
    amount &&
    parseFloat(amount) > 0 &&
    price &&
    parseFloat(price) > 0 &&
    !isLoading &&
    quote &&
    stellarWallet;
  const toBalance = toToken?.balance ? parseFloat(toToken.balance).toFixed(4) : '0.00';

  const spendableAmount = fromToken?.balance
    ? portfolioUtils.formatBalance(
        fromToken.code === 'XLM'
          ? Math.max(0, parseFloat(fromToken.balance) - (1 + subentryCount * 0.5 + 0.05)).toString()
          : fromToken.balance
      )
    : '0.00';

  const renderOrderForm = () => {
    const baseCode = fromToken?.code || 'XLM';
    const quoteCode = toToken?.code || 'USDC';
    const activeBalance = isBuy ? toBalance : spendableAmount;
    const activeUnit = isBuy ? quoteCode : baseCode;

    const targetToken = !fromToken?.asset.isNative() ? fromToken : toToken;
    const hasIssuer = targetToken && !targetToken.asset.isNative() && targetToken.issuer;
    const domain =
      targetToken?.homeDomain ||
      targetToken?.domain ||
      (targetToken?.asset.isNative() ? 'stellar.org' : 'custom');
    const issuerShort = targetToken?.issuer
      ? `${targetToken.issuer.slice(0, 4)}...${targetToken.issuer.slice(-4)}`
      : null;

    const bestAsk = orderBook?.asks?.[0]?.price ? parseFloat(orderBook.asks[0].price) : 0;
    const bestBid = orderBook?.bids?.[0]?.price ? parseFloat(orderBook.bids[0].price) : 0;
    const spreadRaw = bestAsk && bestBid ? Math.max(0, bestAsk - bestBid) : 0;
    const spreadPercent =
      bestAsk > 0 && bestBid > 0 ? ((spreadRaw / bestAsk) * 100).toFixed(2) + '%' : '—';
    const isLowLiq =
      !isLoading &&
      orderBook &&
      ((orderBook.bids?.length || 0) < 3 || (orderBook.asks?.length || 0) < 3);

    return (
      <div className="bg-[var(--color-bg-secondary)] rounded-2xl border border-[var(--color-border)]/60 shadow-sm p-4 lg:p-4.5 flex flex-col justify-between">
        {/* Top Bar: Base Asset, Flip Button, Quote Asset & LMT/MKT Switcher */}
        <div className="flex items-center justify-between gap-1.5 mb-3 select-none">
          <div className="flex items-center gap-1 min-w-0">
            {/* Base Asset Pill */}
            <button
              onClick={() => setSelectingAssetFor('from')}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] active:scale-[0.98] border border-white/5 transition-all cursor-pointer min-w-0"
              title="Select Base Asset"
            >
              <img
                src={
                  fromToken?.icon ||
                  getTokenIcon(fromToken?.code || '', chainConfig, fromToken?.issuer) ||
                  `https://ui-avatars.com/api/?name=${baseCode}&background=random`
                }
                className="w-4 h-4 rounded-full bg-tertiary object-cover shrink-0"
                alt=""
              />
              <span className="font-bold text-xs text-primary truncate max-w-[55px]">
                {baseCode}
              </span>
              <ChevronDown size={10} className="text-muted shrink-0" />
            </button>

            {/* Swap / Flip Button */}
            <button
              onClick={() => {
                const temp = fromToken;
                setFromToken(toToken as any);
                setToToken(temp as any);
              }}
              className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center hover:scale-110 active:scale-95 text-muted hover:text-primary transition-all border border-white/10 shrink-0 cursor-pointer"
              title="Flip Base and Quote"
            >
              <ArrowRightLeft size={11} />
            </button>

            {/* Quote Asset Pill */}
            <button
              onClick={() => setSelectingAssetFor('to')}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] active:scale-[0.98] border border-white/5 transition-all cursor-pointer min-w-0"
              title="Select Quote / Pricing Asset"
            >
              <img
                src={
                  toToken?.icon ||
                  getTokenIcon(toToken?.code || '', chainConfig, toToken?.issuer) ||
                  `https://ui-avatars.com/api/?name=${quoteCode}&background=random`
                }
                className="w-4 h-4 rounded-full bg-tertiary object-cover shrink-0"
                alt=""
              />
              <span className="font-bold text-xs text-primary truncate max-w-[55px]">
                {quoteCode}
              </span>
              <ChevronDown size={10} className="text-muted shrink-0" />
            </button>
          </div>

          {/* LMT / MKT Switcher */}
          <div className="flex gap-0.5 bg-white/5 p-0.5 rounded-lg border border-white/5 shrink-0 ml-1">
            {(['limit', 'market'] as const).map(type => (
              <button
                key={type}
                onClick={() => handleRateTypeChange(type)}
                disabled={isLoading}
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  orderRateType === type
                    ? 'bg-brand text-white shadow-xs'
                    : 'text-muted hover:text-primary'
                }`}
              >
                {type === 'limit' ? 'LMT' : 'MKT'}
              </button>
            ))}
          </div>
        </div>

        {/* Asset Details, 24h Spread & Low Liquidity Warning */}
        <div className="mb-3 space-y-1.5 select-none">
          <div className="flex items-center justify-between px-2 py-1.5 rounded-xl bg-white/[0.02] border border-white/5 text-[10px]">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-muted">Asset:</span>
              <span className="font-semibold text-primary truncate max-w-[90px]">{domain}</span>
              {hasIssuer && (
                <button
                  onClick={() => {
                    if (targetToken?.issuer) {
                      navigator.clipboard.writeText(targetToken.issuer);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }
                  }}
                  className="inline-flex items-center gap-1 px-1 py-0.5 rounded bg-white/[0.04] hover:bg-white/[0.08] text-muted hover:text-primary transition-all cursor-pointer"
                  title={`Copy issuer address: ${targetToken.issuer}`}
                >
                  <span className="font-mono text-[9px]">{issuerShort}</span>
                  {copied ? <Check size={9} className="text-green-400" /> : <Copy size={9} />}
                </button>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <span className="text-muted">Spread:</span>
              <span className="font-mono font-medium text-primary">{spreadPercent}</span>
            </div>
          </div>

          {isLowLiq && (
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2 text-[11px] text-amber-300">
              <AlertCircle size={13} className="shrink-0 mt-0.5 text-amber-400" />
              <div className="leading-tight">
                <span className="font-semibold">Low Orderbook Depth:</span>
                <span className="text-amber-300/80 ml-1">
                  Limited active offers on Stellar DEX for this pair.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Side Tabs: Buy [Base] / Sell [Base] */}
        <div className="flex gap-1 bg-white/5 p-1 rounded-xl border border-white/5 mb-3">
          <button
            onClick={() => setIsBuy(true)}
            disabled={isLoading}
            className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all min-h-[34px] cursor-pointer ${
              isBuy ? 'bg-green-500 text-white shadow-sm' : 'text-muted hover:text-primary'
            }`}
          >
            Buy {baseCode}
          </button>
          <button
            onClick={() => setIsBuy(false)}
            disabled={isLoading}
            className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all min-h-[34px] cursor-pointer ${
              !isBuy ? 'bg-red-500 text-white shadow-sm' : 'text-muted hover:text-primary'
            }`}
          >
            Sell {baseCode}
          </button>
        </div>

        {/* Available Balance Header */}
        <div className="flex justify-between items-center px-0.5 mb-2.5 text-[11px] text-muted select-none">
          <span>Available:</span>
          <div className="flex items-center gap-1.5">
            <span className="text-primary font-bold font-mono tabular-nums">
              {activeBalance} {activeUnit}
            </span>
            <button
              onClick={() => fetchBalances(true)}
              className="p-0.5 hover:bg-white/5 rounded transition-colors text-muted hover:text-primary cursor-pointer"
              title="Refresh balance"
            >
              <RefreshCw size={10} className={isRefreshingBalances ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Price Input Field */}
        <div className="bg-tertiary rounded-xl p-2.5 border border-color mb-2">
          <div className="flex justify-between items-center mb-1">
            <label className="text-[9px] font-bold uppercase tracking-wider text-muted">
              Price
            </label>
            {orderRateType === 'market' ? (
              <span className="text-[8px] px-1.5 py-0.2 rounded bg-brand/10 text-brand font-bold uppercase tracking-wider">
                Market
              </span>
            ) : (
              <span className="text-[10px] text-muted font-mono">{quoteCode}</span>
            )}
          </div>
          <input
            type="text"
            inputMode="decimal"
            value={orderRateType === 'market' && !price ? 'Market Price' : price}
            onChange={e => {
              if (orderRateType === 'market') return;
              const v = e.target.value;
              if (v === '' || /^\d*\.?\d*$/.test(v)) setPrice(v);
            }}
            placeholder="0.00"
            className="w-full bg-transparent border-none p-0 text-right text-base font-bold tabular-nums focus:ring-0 focus:outline-none placeholder:text-muted/30 disabled:opacity-60 disabled:text-muted"
            disabled={isLoading || orderRateType === 'market'}
          />
        </div>

        {/* Amount Input Field with dynamic value equivalent */}
        <div className="bg-tertiary rounded-xl p-2.5 border border-color mb-2">
          <div className="flex justify-between items-center mb-1">
            <label className="text-[9px] font-bold uppercase tracking-wider text-muted">
              Amount ({baseCode})
            </label>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted font-mono">{baseCode}</span>
              <button
                onClick={setMaxAmount}
                className="text-[9px] font-bold text-brand hover:underline uppercase tracking-wider cursor-pointer"
              >
                Max
              </button>
            </div>
          </div>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={e => {
              const v = e.target.value;
              if (v === '' || /^\d*\.?\d*$/.test(v)) setAmount(v);
            }}
            placeholder="0.00"
            className="w-full bg-transparent border-none p-0 text-right text-base font-bold tabular-nums focus:ring-0 focus:outline-none placeholder:text-muted/30"
            disabled={isLoading}
          />
        </div>

        {/* Total (Quote) Input Field */}
        <div className="bg-tertiary rounded-xl p-2.5 border border-color mb-2">
          <div className="flex justify-between items-center mb-1">
            <label className="text-[9px] font-bold uppercase tracking-wider text-muted">
              Total ({quoteCode})
            </label>
            <span className="text-[10px] text-muted font-mono">{quoteCode}</span>
          </div>
          <input
            type="text"
            inputMode="decimal"
            value={total && parseFloat(total) > 0 ? total : ''}
            onChange={e => {
              const v = e.target.value;
              if (v === '' || /^\d*\.?\d*$/.test(v)) {
                setTotal(v);
                const numPrice = parseFloat(price);
                const numTotal = parseFloat(v);
                if (numPrice > 0 && numTotal > 0) {
                  setAmount((numTotal / numPrice).toFixed(7));
                } else if (!v) {
                  setAmount('');
                }
              }
            }}
            placeholder="0.00"
            className="w-full bg-transparent border-none p-0 text-right text-base font-bold tabular-nums focus:ring-0 focus:outline-none placeholder:text-muted/30"
            disabled={isLoading}
          />
        </div>

        {/* Quick Percentage Selectors (25%, 50%, 75%, 100%) */}
        <div className="grid grid-cols-4 gap-1.5 mb-2.5">
          {[25, 50, 75, 100].map(pct => (
            <button
              key={pct}
              type="button"
              onClick={() => setAmountPercentage(pct)}
              className="py-1 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] active:bg-brand/20 border border-white/5 text-[10px] font-bold text-muted hover:text-primary transition-all cursor-pointer"
            >
              {pct}%
            </button>
          ))}
        </div>

        {/* Execution Summary Strip */}
        <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 space-y-1 mb-3 select-none">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted">You Pay:</span>
            <span className="font-mono font-bold text-red-400 tabular-nums">
              {isBuy
                ? `${total && parseFloat(total) > 0 ? total : '0.00'} ${quoteCode}`
                : `${amount && parseFloat(amount) > 0 ? amount : '0.00'} ${baseCode}`}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted">You Receive:</span>
            <span className="font-mono font-bold text-green-400 tabular-nums">
              {isBuy
                ? `${amount && parseFloat(amount) > 0 ? amount : '0.00'} ${baseCode}`
                : `${total && parseFloat(total) > 0 ? total : '0.00'} ${quoteCode}`}
            </span>
          </div>
        </div>

        {(error || errorMessage) && (
          <div className="mb-3 p-2 bg-red-500/10 rounded-xl flex items-start gap-1.5 border border-red-500/20">
            <AlertCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
            <p className="text-[11px] text-red-500 leading-tight">{error || errorMessage}</p>
          </div>
        )}

        {/* Place Order CTA Button */}
        <div className="mt-2">
          <button
            onClick={handlePlaceOrder}
            disabled={stellarWallet ? !canPlaceOrder || orderStatus === 'pending' : false}
            className={`w-full py-3.5 rounded-xl font-bold text-xs uppercase tracking-[0.12em] transition-all min-h-[46px] cursor-pointer ${
              !stellarWallet
                ? 'btn btn-primary bg-brand hover:bg-brand-hover text-white'
                : orderStatus === 'pending'
                  ? 'bg-brand/50 text-white cursor-wait'
                  : isBuy
                    ? 'bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-500/20'
                    : 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20'
            }`}
          >
            {!stellarWallet ? (
              'Connect Wallet'
            ) : orderStatus === 'pending' ? (
              <span className="flex items-center justify-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Placing Order...
              </span>
            ) : orderStatus === 'success' ? (
              <span className="flex items-center justify-center gap-2">
                <CheckCircle className="w-3.5 h-3.5" />
                {SUCCESS_MESSAGES.ORDER_SUCCESS || 'ORDER PLACED'}
              </span>
            ) : !toToken?.hasTrustline && !toToken?.asset.isNative() ? (
              `ADD TRUSTLINE & ${isBuy ? 'BUY' : 'SELL'} ${baseCode}`
            ) : (
              `${isBuy ? 'BUY' : 'SELL'} ${baseCode}`
            )}
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      {isMobile ? (
        /* ============ MOBILE-OPTIMIZED 2-TAB DEFI LAYOUT ============ */
        <div className="flex flex-col gap-2 w-full">
          {/* Segmented Switcher: Trade vs Chart */}
          <div className="flex bg-[var(--color-bg-secondary)] border border-[var(--color-border)]/60 rounded-xl p-1 mb-1">
            <button
              onClick={() => setMobileTab('trade')}
              className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                mobileTab === 'trade'
                  ? 'bg-[var(--color-brand-primary)] text-white shadow-xs'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              Trade
            </button>
            <button
              onClick={() => setMobileTab('chart')}
              className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                mobileTab === 'chart'
                  ? 'bg-[var(--color-brand-primary)] text-white shadow-xs'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              Chart & Depth
            </button>
          </div>

          {mobileTab === 'trade' ? (
            <>
              {/* Order Trade Form */}
              <div className="w-full">{renderOrderForm()}</div>

              {/* Order Book & Trades Tabbed on Mobile */}
              <div className="bg-[var(--color-bg-secondary)] rounded-2xl border border-[var(--color-border)]/60 shadow-sm overflow-hidden flex flex-col h-[380px]">
                <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border)]/50 bg-[var(--color-bg-tertiary)]/40 shrink-0 select-none">
                  <div className="flex items-center gap-1 bg-[var(--color-bg-secondary)] p-0.5 rounded-xl border border-[var(--color-border)]/40">
                    <button
                      onClick={() => setMiddleColumnTab('book')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                        middleColumnTab === 'book'
                          ? 'bg-[var(--color-brand-primary)] text-white shadow-xs'
                          : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                      }`}
                    >
                      Order Book
                    </button>
                    <button
                      onClick={() => setMiddleColumnTab('trades')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                        middleColumnTab === 'trades'
                          ? 'bg-[var(--color-brand-primary)] text-white shadow-xs'
                          : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                      }`}
                    >
                      <span>Trades</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                    </button>
                  </div>
                  <button
                    onClick={refreshOrderBook}
                    className="p-1.5 rounded-lg hover:bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
                    disabled={isLoading}
                    title="Refresh"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
                <div className="flex-1 min-h-0 overflow-hidden">
                  {middleColumnTab === 'book' ? (
                    <OrderBook
                      orderBook={orderBook}
                      setPrice={setPrice}
                      isLoading={isLoading}
                      baseSymbol={fromToken?.code || 'XLM'}
                      counterSymbol={toToken?.code || 'USDC'}
                    />
                  ) : (
                    <Suspense
                      fallback={
                        <div className="w-full h-full flex items-center justify-center bg-secondary">
                          <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                        </div>
                      }
                    >
                      <LastTrades
                        baseAsset={fromToken || undefined}
                        counterAsset={toToken || undefined}
                      />
                    </Suspense>
                  )}
                </div>
              </div>

              {/* Stellar Account Overview Panel on Mobile */}
              <StellarAccountPanel
                xlmBalance={
                  fromToken?.code === 'XLM'
                    ? fromToken.balance
                    : toToken?.code === 'XLM'
                      ? toToken.balance
                      : '0.00'
                }
                spendableXlm={spendableAmount}
                subentryCount={subentryCount}
              />

              {/* Open Orders & Trade History directly below */}
              <div className="w-full bg-[var(--color-bg-secondary)] rounded-2xl border border-[var(--color-border)]/60 overflow-hidden shadow-sm min-h-[300px]">
                <Suspense
                  fallback={
                    <div className="w-full h-32 flex items-center justify-center bg-secondary">
                      <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                    </div>
                  }
                >
                  <TradeTransactionUI />
                </Suspense>
              </div>
            </>
          ) : (
            <>
              {/* Chart View on Mobile */}
              <div className="bg-[var(--color-bg-secondary)] rounded-2xl border border-[var(--color-border)]/60 overflow-hidden shadow-sm h-[380px]">
                <Suspense
                  fallback={
                    <div className="w-full h-full flex items-center justify-center bg-secondary">
                      <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                    </div>
                  }
                >
                  <StellarTradingChart />
                </Suspense>
              </div>

              {/* Recent Market Trades on Mobile */}
              <div className="bg-[var(--color-bg-secondary)] rounded-2xl border border-[var(--color-border)]/60 shadow-sm overflow-hidden flex flex-col h-[320px]">
                <div className="px-3 py-2 border-b border-[var(--color-border)]/50 bg-[var(--color-bg-tertiary)]/40 font-bold text-xs uppercase tracking-wider text-primary">
                  Recent Market Trades
                </div>
                <div className="flex-1 min-h-0 overflow-hidden">
                  <Suspense
                    fallback={
                      <div className="w-full h-full flex items-center justify-center bg-secondary">
                        <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                      </div>
                    }
                  >
                    <LastTrades
                      baseAsset={fromToken || undefined}
                      counterAsset={toToken || undefined}
                    />
                  </Suspense>
                </div>
              </div>
            </>
          )}
        </div>
      ) : (
        /* ============ DESKTOP PRO 3-COLUMN / 2-SECTION LAYOUT ============ */
        <div className="flex flex-col lg:flex-row gap-2 lg:gap-3 items-start w-full">
          {/* LEFT MAIN SECTION (FLEX-1): TOP ROW (CHART + ORDERBOOK) + BOTTOM ROW (TRANSACTIONS) */}
          <div className="flex-1 min-w-0 flex flex-col gap-2 w-full">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_290px] xl:grid-cols-[1fr_310px] 2xl:grid-cols-[1fr_330px] gap-2 items-stretch">
              {/* Candlestick Chart */}
              <div className="bg-[var(--color-bg-secondary)] rounded-2xl border border-[var(--color-border)]/60 overflow-hidden shadow-sm h-[460px] lg:h-[520px]">
                <Suspense
                  fallback={
                    <div className="w-full h-full flex items-center justify-center bg-secondary">
                      <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                    </div>
                  }
                >
                  <StellarTradingChart />
                </Suspense>
              </div>

              {/* Tabbed Order Book & Recent Trades */}
              <div className="bg-[var(--color-bg-secondary)] rounded-2xl border border-[var(--color-border)]/60 shadow-sm overflow-hidden flex flex-col h-[460px] lg:h-[520px]">
                <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border)]/50 bg-[var(--color-bg-tertiary)]/40 shrink-0 select-none">
                  <div className="flex items-center gap-1 bg-[var(--color-bg-secondary)] p-0.5 rounded-xl border border-[var(--color-border)]/40">
                    <button
                      onClick={() => setMiddleColumnTab('book')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                        middleColumnTab === 'book'
                          ? 'bg-[var(--color-brand-primary)] text-white shadow-xs'
                          : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                      }`}
                    >
                      Order Book
                    </button>
                    <button
                      onClick={() => setMiddleColumnTab('trades')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                        middleColumnTab === 'trades'
                          ? 'bg-[var(--color-brand-primary)] text-white shadow-xs'
                          : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                      }`}
                    >
                      <span>Trades</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                    </button>
                  </div>
                  <button
                    onClick={refreshOrderBook}
                    className="p-1.5 rounded-lg hover:bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
                    disabled={isLoading}
                    title="Refresh"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                <div className="flex-1 min-h-0 overflow-hidden">
                  {middleColumnTab === 'book' ? (
                    <OrderBook
                      orderBook={orderBook}
                      setPrice={setPrice}
                      isLoading={isLoading}
                      baseSymbol={fromToken?.code || 'XLM'}
                      counterSymbol={toToken?.code || 'USDC'}
                    />
                  ) : (
                    <Suspense
                      fallback={
                        <div className="w-full h-full flex items-center justify-center bg-secondary">
                          <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                        </div>
                      }
                    >
                      <LastTrades
                        baseAsset={fromToken || undefined}
                        counterAsset={toToken || undefined}
                      />
                    </Suspense>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Row: Trade Transactions (Spans Full Width under Chart + OrderBook) */}
            <div className="w-full bg-[var(--color-bg-secondary)] rounded-2xl border border-[var(--color-border)]/60 overflow-hidden shadow-sm min-h-[300px]">
              <Suspense
                fallback={
                  <div className="w-full h-32 flex items-center justify-center bg-secondary">
                    <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                  </div>
                }
              >
                <TradeTransactionUI />
              </Suspense>
            </div>
          </div>

          {/* RIGHT SIDE AREA: ORDER TRADE FORM + ACCOUNT PANEL (Ecommerce-style sticky natural height) */}
          <div
            ref={sidebarRef}
            style={stickyStyle}
            className="w-full lg:w-[320px] xl:w-[340px] 2xl:w-[360px] shrink-0 flex flex-col gap-2 h-fit"
          >
            {renderOrderForm()}

            <StellarAccountPanel
              xlmBalance={
                fromToken?.code === 'XLM'
                  ? fromToken.balance
                  : toToken?.code === 'XLM'
                    ? toToken.balance
                    : '0.00'
              }
              spendableXlm={spendableAmount}
              subentryCount={subentryCount}
            />
          </div>
        </div>
      )}

      <StellarAssetSelectorModal
        isOpen={selectingAssetFor !== null}
        onClose={() => setSelectingAssetFor(null)}
        tokens={availableTokens}
        selectedToken={selectingAssetFor === 'from' ? (fromToken as any) : (toToken as any)}
        onSelect={token => {
          if (selectingAssetFor === 'from') setFromToken(token as any);
          else setToToken(token as any);
        }}
        title={`Select ${selectingAssetFor === 'from' ? 'Base (Trading)' : 'Quote (Pricing)'} Asset`}
      />
    </>
  );
};

export default OrderBookSwapUI;
