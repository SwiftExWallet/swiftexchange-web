import {
  AlertCircle,
  ArrowLeft,
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';

import { useNotificationStore } from '../../../../store/notificationStore';
import { useWalletStore } from '../../../walletconnect/store/walletConnectStore';
import { parseAsterError } from '../../adapters/aster/api/errors';
import { useAsterAgent } from '../../adapters/aster/hooks/useAsterAgent';
import { fetchAsterSnapshot } from '../../adapters/aster/hooks/useAsterDataSync';
import { useOrders } from '../../adapters/aster/hooks/useOrders';
import { useHyperliquidAgent } from '../../adapters/hyperliquid/hooks/useHyperliquidAgent';
import { useExchangeManager } from '../../core/ExchangeManager';
import { useAccountStore } from '../../core/stores/accountStore';
import { useLeverageStore } from '../../core/stores/leverageStore';
import { useMarketStore } from '../../core/stores/marketStore';
import { type OrderType, useOrderEntryStore } from '../../core/stores/orderEntryStore';
import { useOrderbookStore } from '../../core/stores/orderbookStore';
import { usePositionStore } from '../../core/stores/positionStore';
import { useTickerStore } from '../../core/stores/tickerStore';
import { useTradeCalculations } from '../../hooks/useTradeCalculations';
import { type UnifiedOrderParams, useUnifiedExecution } from '../../services/useUnifiedExecution';
import { calculateLiquidationPrice } from '../../utils/liquidationCalculator';
import { validateOrder } from '../../utils/orderValidation';
import { AccountModal } from '../trade/AccountModal';
import { LeverageModal } from '../trade/LeverageModal';
import { MobileMiniOrderbook } from './MobileMiniOrderbook';

interface MobileTradeScreenProps {
  onBack: () => void;
  side: 'BUY' | 'SELL';
  onSwitchSide: (side: 'BUY' | 'SELL') => void;
}

const PERCENT_BUTTONS = [25, 50, 75, 100];

const ADVANCED_ORDER_TYPES: {
  label: string;
  value: OrderType;
  badge: string;
  badgeColor: string;
  description: string;
}[] = [
  {
    label: 'Stop Limit',
    value: 'STOP',
    badge: 'Conditional',
    badgeColor: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
    description: 'Trigger at stop price, then place a limit order at specified target price',
  },
  {
    label: 'Stop Market',
    value: 'STOP_MARKET',
    badge: 'Trigger',
    badgeColor: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
    description: 'Trigger at stop price, then execute immediately at best market price',
  },
  {
    label: 'Trailing Stop',
    value: 'TRAILING_STOP_MARKET',
    badge: 'Algo',
    badgeColor: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
    description:
      'Tracks market peak price and triggers execution when price reverses by callback %',
  },
  {
    label: 'Post Only',
    value: 'POST_ONLY',
    badge: 'Maker (GTX)',
    badgeColor: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
    description: 'Guaranteed maker order (GTX) to capture rebates and eliminate taker fees',
  },
  {
    label: 'Chase Order',
    value: 'CHASE',
    badge: 'Algo',
    badgeColor: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20',
    description: 'Dynamically readjusts order price to chase best bid/ask or offset gap',
  },
  {
    label: 'Scaled Order',
    value: 'SCALED',
    badge: 'Algo',
    badgeColor: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
    description: 'Distributes size across multiple limit orders within a defined price range',
  },
];

const getOrderTypeLabel = (type: OrderType): string => {
  switch (type) {
    case 'MARKET':
      return 'Market';
    case 'LIMIT':
      return 'Limit';
    case 'STOP':
      return 'Stop Limit';
    case 'STOP_MARKET':
      return 'Stop Market';
    case 'TRAILING_STOP_MARKET':
      return 'Trailing Stop';
    case 'POST_ONLY':
      return 'Post Only';
    case 'CHASE':
      return 'Chase Order';
    case 'SCALED':
      return 'Scaled Order';
    default:
      return type;
  }
};

const isAdvancedOrder = (type: OrderType): boolean => {
  return type !== 'MARKET' && type !== 'LIMIT';
};

const formatPrecision = (
  val: string | number | undefined,
  step: number | undefined
): string | undefined => {
  if (val === undefined || val === null || val === '') return undefined;
  if (!step) return String(val);
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return String(val);
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  const factor = Math.pow(10, decimals);
  const truncated = Math.floor(num * factor) / factor;
  return truncated.toFixed(decimals);
};

export const MobileTradeScreen: React.FC<MobileTradeScreenProps> = ({
  onBack,
  side,
  onSwitchSide,
}) => {
  const isLong = side === 'BUY';
  const store = useOrderEntryStore();
  const selectedSymbol = useMarketStore(state => state.selectedSymbol);
  const markets = useMarketStore(state => state.markets);
  const currentMarket = markets[selectedSymbol] || markets[selectedSymbol.replace('-', '')];
  const baseAsset = currentMarket?.baseAsset || selectedSymbol.split('-')[0] || 'BTC';
  const quoteAsset = currentMarket?.quoteAsset || selectedSymbol.split('-')[1] || 'USDT';

  const assetCtxByMarket = useTickerStore(state => state.assetCtxByMarket);
  const cleanSym = selectedSymbol.replace('-', '');
  const markPriceStr =
    assetCtxByMarket[cleanSym]?.markPx ||
    assetCtxByMarket[`${cleanSym}USDT`]?.markPx ||
    assetCtxByMarket[selectedSymbol]?.markPx ||
    '0';
  const currentPrice = parseFloat(markPriceStr) || 0;

  const currentExchange = useExchangeManager(state => state.currentExchange);
  const currentNetwork = useExchangeManager(state => state.currentNetwork);
  const { isReady, loading: isSigning, executeOrder } = useUnifiedExecution();
  const asterAgent = useAsterAgent();
  const hyperliquidAgent = useHyperliquidAgent();
  const activeAgent = currentExchange === 'hyperliquid' ? hyperliquidAgent : asterAgent;
  const { isReady: isAgentReady, deriveAgentKey, deriveState, error: deriveError } = activeAgent;
  const isEvmConnected = useWalletStore(state => !!state.connectedWallets.evm?.address);
  const openWalletModal = useWalletStore(state => state.openModal);
  const isDepositError = deriveState === 'error' && deriveError?.message?.includes('Must deposit');

  // Sync store for symbol
  useEffect(() => {
    if (selectedSymbol) {
      store.syncForSymbol(selectedSymbol);
    }
  }, [selectedSymbol]);

  // Decimals
  const baseDecimals = currentMarket?.stepSize
    ? Math.max(0, -Math.floor(Math.log10(currentMarket.stepSize)))
    : 3;
  const priceDecimals = currentMarket?.tickSize
    ? Math.max(0, -Math.floor(Math.log10(currentMarket.tickSize)))
    : 2;

  // Active Leverage & Margin Mode
  const symbolLeverage =
    store.leverageBySymbol[selectedSymbol] ||
    store.leverageBySymbol[cleanSym] ||
    store.leverage ||
    (currentMarket?.maxLeverage ? Math.min(currentMarket.maxLeverage, 100) : 20);
  const symbolMarginType =
    store.marginTypeBySymbol[selectedSymbol] ||
    store.marginTypeBySymbol[cleanSym] ||
    store.marginType ||
    'cross';

  // Balances
  const balances = useAccountStore(state => state.balances);
  const availableBalanceStr = useAccountStore(state => state.availableBalance);
  const totalMarginBalanceStr = useAccountStore(state => state.totalMarginBalance);
  const totalWalletBalanceStr = useAccountStore(state => state.totalWalletBalance);

  // Calculations from desktop hook
  const {
    orderCost,
    maxPossibleSize,
    walletBalance: calcWalletBalance,
  } = useTradeCalculations(
    selectedSymbol,
    store.size || '0',
    store.sizeAsset,
    symbolLeverage,
    symbolMarginType
  );
  const maxOrderSize = maxPossibleSize;

  // Robust live available margin determination
  const availableMargin = useMemo(() => {
    if (calcWalletBalance > 0) return calcWalletBalance;
    if (availableBalanceStr && parseFloat(availableBalanceStr) > 0) {
      return parseFloat(availableBalanceStr);
    }
    const qBal = balances[quoteAsset] || balances['USDT'] || balances['USDC'] || balances['USD'];
    if (qBal) {
      return parseFloat(qBal.available || qBal.total || '0');
    }
    if (totalMarginBalanceStr && parseFloat(totalMarginBalanceStr) > 0) {
      return parseFloat(totalMarginBalanceStr);
    }
    if (totalWalletBalanceStr && parseFloat(totalWalletBalanceStr) > 0) {
      return parseFloat(totalWalletBalanceStr);
    }
    return 0;
  }, [
    calcWalletBalance,
    availableBalanceStr,
    balances,
    quoteAsset,
    totalMarginBalanceStr,
    totalWalletBalanceStr,
  ]);

  const positions = usePositionStore(state => state.positions);
  const bracketsBySymbol = useLeverageStore(state => state.bracketsBySymbol);

  const estimatedLiquidationPrice = useMemo(() => {
    const numSize = parseFloat(store.size || '0');
    if (!numSize || numSize <= 0 || isNaN(numSize)) return null;

    const entryPx =
      store.orderType === 'LIMIT' && parseFloat(store.price) > 0
        ? parseFloat(store.price)
        : currentPrice;

    if (!entryPx || entryPx <= 0) return null;

    const symNoDash = cleanSym;
    const brackets = bracketsBySymbol[symNoDash] || bracketsBySymbol[selectedSymbol];

    let mmr = 0.005;
    if (brackets && brackets.length > 0) {
      const notional = store.sizeAsset === 'quote' ? numSize : numSize * entryPx;
      const matched =
        brackets.find(b => notional <= b.notionalCap) || brackets[brackets.length - 1];
      if (matched) {
        mmr = matched.maintMarginRatio || 0.005;
      }
    }

    const lev = Math.max(1, symbolLeverage);

    // If order size > 0 and in cross margin mode with wallet balance, calculate exact cross margin liq price
    if (numSize > 0 && symbolMarginType === 'cross' && availableMargin > 0) {
      let baseQty = numSize;
      if (store.sizeAsset === 'quote') {
        baseQty = numSize / entryPx;
      }
      const positionAmt = isLong ? String(baseQty) : String(-baseQty);

      const crossLiq = calculateLiquidationPrice({
        position: {
          symbol: selectedSymbol,
          size: positionAmt,
          entryPrice: String(entryPx),
          markPrice: String(entryPx),
          liquidationPrice: '0',
          unrealizedPnl: '0',
          leverage: lev,
          marginType: 'cross',
          isolatedMargin: '0',
        },
        allPositions: Object.values(positions),
        balances,
        isMultiAsset: false,
        bracketsBySymbol,
      });

      if (crossLiq !== null && crossLiq > 0) {
        return crossLiq;
      }
    }

    // Standard isolated or baseline leverage liquidation formula
    if (isLong) {
      const denom = 1 - mmr;
      if (denom <= 0) return null;
      const liq = (entryPx * (1 - 1 / lev)) / denom;
      return liq > 0 ? liq : null;
    } else {
      const denom = 1 + mmr;
      if (denom <= 0) return null;
      const liq = (entryPx * (1 + 1 / lev)) / denom;
      return liq > 0 ? liq : null;
    }
  }, [
    currentPrice,
    store.price,
    store.size,
    store.sizeAsset,
    store.orderType,
    cleanSym,
    selectedSymbol,
    symbolLeverage,
    symbolMarginType,
    isLong,
    availableMargin,
    balances,
    positions,
    bracketsBySymbol,
  ]);

  const { placeChase, placeBatch } = useOrders(asterAgent.asterSigner, asterAgent.userAddr);

  // Live orderbook reference for Chase Orders (best bid/ask)
  const book = useOrderbookStore(state => state.books[selectedSymbol] || state.books[cleanSym]);
  const bestBid =
    book?.bids?.[0]?.price || (currentPrice > 0 ? currentPrice.toFixed(priceDecimals) : '--');
  const bestAsk =
    book?.asks?.[0]?.price || (currentPrice > 0 ? currentPrice.toFixed(priceDecimals) : '--');

  const gapNum = parseFloat(store.chaseOffset) || 0;
  const numBestBid = parseFloat(bestBid);
  const numBestAsk = parseFloat(bestAsk);
  const yourBid =
    !isNaN(numBestBid) && numBestBid > 0 ? (numBestBid - gapNum).toFixed(priceDecimals) : bestBid;
  const yourAsk =
    !isNaN(numBestAsk) && numBestAsk > 0 ? (numBestAsk + gapNum).toFixed(priceDecimals) : bestAsk;

  // Validation
  const relevantBalances = useMemo(() => Object.values(balances), [balances]);
  const validation = useMemo(() => {
    return validateOrder(
      currentMarket,
      currentPrice,
      relevantBalances,
      side,
      store.orderType,
      store.price,
      store.size,
      store.sizeAsset,
      store.stopPrice,
      store.callbackRate,
      maxOrderSize
    );
  }, [
    currentMarket,
    currentPrice,
    relevantBalances,
    side,
    store.orderType,
    store.price,
    store.size,
    store.sizeAsset,
    store.stopPrice,
    store.callbackRate,
    maxOrderSize,
  ]);

  // Local state
  const [showOrderTypeMenu, setShowOrderTypeMenu] = useState(false);
  const [showLeverageModal, setShowLeverageModal] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [sliderVal, setSliderVal] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Effective limit price
  const activePrice =
    store.orderType === 'LIMIT' || store.orderType === 'POST_ONLY'
      ? parseFloat(store.price) || currentPrice
      : currentPrice;

  // Slider change handler
  const handleSliderChange = (percent: number) => {
    setSliderVal(percent);
    if (!currentPrice || currentPrice <= 0 || availableMargin <= 0) return;

    const maxUsd = availableMargin * symbolLeverage * 0.98;
    const targetUsd = (maxUsd * percent) / 100;

    if (store.sizeAsset === 'quote') {
      store.setSize(targetUsd > 0 ? targetUsd.toFixed(2) : '');
    } else {
      const targetBase = targetUsd / currentPrice;
      store.setSize(targetBase > 0 ? targetBase.toFixed(baseDecimals) : '');
    }
  };

  // Quick fill price from orderbook
  const handleSelectPriceFromBook = (px: string) => {
    if (store.orderType === 'MARKET') {
      store.setOrderType('LIMIT');
    }
    store.setPrice(px);
  };

  // Toggle size currency (Base token vs Quote USD)
  const handleCurrencyToggle = () => {
    const newAsset = store.sizeAsset === 'base' ? 'quote' : 'base';
    const currentSize = parseFloat(store.size) || 0;
    if (currentSize > 0 && currentPrice > 0) {
      if (newAsset === 'quote') {
        store.setSize((currentSize * currentPrice).toFixed(2));
      } else {
        store.setSize((currentSize / currentPrice).toFixed(baseDecimals));
      }
    }
    store.setSizeAsset(newAsset);
  };

  // Fill BBO price
  const handleBboFill = () => {
    if (currentPrice > 0) {
      store.setPrice(currentPrice.toFixed(priceDecimals));
    }
  };

  // Order submission supporting standard and advanced order types
  const handleSubmitOrder = async () => {
    if (isSubmitting || !isReady) return;
    if (!validation.isValid && validation.error) {
      useNotificationStore.getState().showToast({
        type: 'SYSTEM',
        title: 'Validation Error',
        status: 'error',
        message: validation.error,
      });
      return;
    }

    const numSize = parseFloat(store.size);
    if (!numSize || numSize <= 0) {
      useNotificationStore.getState().showToast({
        type: 'SYSTEM',
        title: 'Invalid Size',
        status: 'error',
        message: 'Please enter a valid order size.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      let finalSize = store.size;
      if (store.sizeAsset === 'quote') {
        const conversionPrice = activePrice > 0 ? activePrice : currentPrice;
        if (conversionPrice > 0) {
          finalSize = String(numSize / conversionPrice);
        }
      }

      const formattedQty = formatPrecision(finalSize, currentMarket?.stepSize);
      const formattedPrice = formatPrecision(store.price, currentMarket?.tickSize);
      const formattedStopPrice = formatPrecision(store.stopPrice, currentMarket?.tickSize);
      const formattedActivation = formatPrecision(store.activationPrice, currentMarket?.tickSize);

      let res: any = null;

      if (store.orderType === 'SCALED') {
        const pLower = parseFloat(store.scaledPriceLower || '0');
        const pUpper = parseFloat(store.scaledPriceUpper || '0');
        const n = parseInt(store.scaledOrderCount || '5', 10);
        const dist = store.scaledDistribution || 'FLAT';
        const tSize = parseFloat(finalSize || '0');

        if (n < 2 || n > 20) throw new Error('Order count must be between 2 and 20');
        if (pLower <= 0 || pUpper <= 0 || pLower >= pUpper) throw new Error('Invalid price range');

        const priceStep = (pUpper - pLower) / (n - 1);
        const sumWeights = (n * (n + 1)) / 2;

        const scaledOrders: any[] = [];
        for (let i = 0; i < n; i++) {
          const price = pLower + priceStep * i;
          let size = tSize / n;
          if (dist === 'ASCENDING') size = (tSize * (i + 1)) / sumWeights;
          if (dist === 'DESCENDING') size = (tSize * (n - i)) / sumWeights;

          const fPrice = formatPrecision(price, currentMarket?.tickSize);
          const fSize = formatPrecision(size, currentMarket?.stepSize);

          if (fPrice && fSize && parseFloat(fSize) > 0) {
            scaledOrders.push({
              symbol: cleanSym,
              side,
              type: 'LIMIT',
              quantity: fSize,
              price: fPrice,
              timeInForce: 'GTC',
              reduceOnly: store.isReduceOnly,
            });
          }
        }

        if (scaledOrders.length === 0) {
          throw new Error('Calculated sizes are too small for market step size');
        }

        const minNotional = currentMarket?.minNotional || 5.0;
        for (const o of scaledOrders) {
          const splitNotional = parseFloat(o.price) * parseFloat(o.quantity);
          if (splitNotional < minNotional) {
            throw new Error(
              `Each split order must have at least $${minNotional.toFixed(2)} USDT notional (current split is $${splitNotional.toFixed(2)} USDT). Please increase total size or reduce order count.`
            );
          }
        }

        res = await placeBatch(scaledOrders);
      } else if (store.orderType === 'CHASE') {
        const formattedChaseOffset =
          formatPrecision(store.chaseOffset || '0', currentMarket?.tickSize) || '0';
        const formattedMaxChaseOffset =
          store.maxChaseDifferenceEnabled &&
          store.maxChaseOffset &&
          parseFloat(store.maxChaseOffset) > 0
            ? formatPrecision(store.maxChaseOffset, currentMarket?.tickSize)
            : undefined;

        res = await placeChase({
          symbol: cleanSym,
          side,
          quantity: formattedQty || store.size,
          quantityUnit: 'BASE',
          reduceOnly: store.isReduceOnly,
          chaseOffset: formattedChaseOffset,
          maxChaseOffset: formattedMaxChaseOffset,
        });
      } else {
        const isMarket = store.orderType === 'MARKET';
        const isTrailingStop = store.orderType === 'TRAILING_STOP_MARKET';
        const isPostOnly = store.orderType === 'POST_ONLY';

        res = await executeOrder({
          symbol: selectedSymbol,
          side,
          type: store.orderType as UnifiedOrderParams['type'],
          price: !isMarket && !isTrailingStop ? formattedPrice || '0' : '0',
          size: formattedQty || finalSize,
          reduceOnly: store.isReduceOnly,
          timeInForce:
            !isMarket && !isTrailingStop
              ? isPostOnly
                ? 'GTX'
                : store.timeInForce || 'GTC'
              : undefined,
          stopPrice: !isMarket && !isTrailingStop ? formattedStopPrice : undefined,
          callbackRate: isTrailingStop ? store.callbackRate || '1.0' : undefined,
          activationPrice: isTrailingStop ? formattedActivation : undefined,
          currentPrice,
        });

        if (
          store.attachedTpEnabled &&
          store.attachedTpPrice &&
          parseFloat(store.attachedTpPrice) > 0
        ) {
          const oppositeSide: 'BUY' | 'SELL' = side === 'BUY' ? 'SELL' : 'BUY';
          const formattedTp =
            formatPrecision(store.attachedTpPrice, currentMarket?.tickSize) ||
            store.attachedTpPrice;
          try {
            await executeOrder({
              symbol: selectedSymbol,
              side: oppositeSide,
              type: 'TAKE_PROFIT_MARKET',
              price: '0',
              size: formattedQty || finalSize,
              reduceOnly: true,
              stopPrice: formattedTp,
              currentPrice,
            });
          } catch (tpErr) {
            console.warn('Attached Take Profit order notice:', tpErr);
          }
        }

        if (
          store.attachedSlEnabled &&
          store.attachedSlPrice &&
          parseFloat(store.attachedSlPrice) > 0
        ) {
          const oppositeSide: 'BUY' | 'SELL' = side === 'BUY' ? 'SELL' : 'BUY';
          const formattedSl =
            formatPrecision(store.attachedSlPrice, currentMarket?.tickSize) ||
            store.attachedSlPrice;
          try {
            await executeOrder({
              symbol: selectedSymbol,
              side: oppositeSide,
              type: 'STOP_MARKET',
              price: '0',
              size: formattedQty || finalSize,
              reduceOnly: true,
              stopPrice: formattedSl,
              currentPrice,
            });
          } catch (slErr) {
            console.warn('Attached Stop Loss order notice:', slErr);
          }
        }
      }

      const txHash =
        res?.newChainData?.hash || (Array.isArray(res) && res[0]?.newChainData?.hash) || undefined;
      const explorerBase =
        currentNetwork === 'testnet'
          ? 'https://www.asterdex-testnet.com/en/explorer/tx/'
          : 'https://www.asterdex.com/en/explorer/tx/';

      useNotificationStore.getState().showToast({
        type: 'DYDX',
        title: `${isLong ? 'Long' : 'Short'} Order Placed`,
        status: 'success',
        message: `${side} ${getOrderTypeLabel(store.orderType)} ${formattedQty || finalSize} ${baseAsset} placed successfully.`,
        txHash,
        explorerUrl: txHash ? `${explorerBase}${txHash}` : undefined,
      });

      // Immediately refresh positions and balances from Aster REST API
      if (asterAgent.asterSigner && asterAgent.userAddr) {
        fetchAsterSnapshot(asterAgent.asterSigner, asterAgent.userAddr).catch(err => {
          console.error('[MobileTradeScreen] Failed to sync snapshot after order submit:', err);
        });
      }

      store.setSize('');
      setSliderVal(0);
    } catch (err: any) {
      console.error('Mobile order execution error:', err);
      const parsedErr = parseAsterError(err);
      useNotificationStore.getState().showToast({
        type: 'SYSTEM',
        title: 'Order Failed',
        status: 'error',
        message:
          parsedErr.userMessage ||
          err?.userMessage ||
          err?.message ||
          'Failed to execute mobile order.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Required margin display
  const displayMargin = useMemo(() => {
    return orderCost > 0 ? orderCost.toFixed(2) : '0.00';
  }, [orderCost]);

  // Submit button text helper
  const submitButtonText = useMemo(() => {
    if (isSubmitting || isSigning) return 'Placing Order...';
    if (store.orderType === 'CHASE') {
      return isLong ? 'Place Chase Long' : 'Place Chase Short';
    }
    if (store.orderType === 'SCALED') {
      return isLong ? 'Place Scaled Long' : 'Place Scaled Short';
    }
    if (store.orderType === 'TRAILING_STOP_MARKET') {
      return isLong ? 'Place Trailing Long' : 'Place Trailing Short';
    }
    if (store.orderType === 'STOP' || store.orderType === 'STOP_MARKET') {
      return isLong ? 'Place Stop Long' : 'Place Stop Short';
    }
    return isLong ? 'Open Long' : 'Open Short';
  }, [isSubmitting, isSigning, store.orderType, isLong]);

  return (
    <div className="flex flex-col h-full w-full bg-secondary text-primary font-sans select-none">
      {/* 1. Top Header Bar using exact bg-secondary matching the top header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-secondary border-b border-color shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-9 h-9 rounded-full bg-tertiary flex items-center justify-center text-primary hover:bg-hover transition-colors cursor-pointer border border-color"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className={`text-[15px] font-bold ${isLong ? 'text-success' : 'text-danger'}`}>
                {isLong ? 'Open Long' : 'Open Short'}
              </span>
              <button
                type="button"
                onClick={() => onSwitchSide(isLong ? 'SELL' : 'BUY')}
                className="text-[10px] px-1.5 py-0.5 rounded bg-tertiary text-secondary hover:text-primary transition-colors cursor-pointer border border-color"
                title="Switch Long/Short"
              >
                Switch
              </button>
            </div>
            <span className="text-[11px] text-muted font-mono-tabular">
              {baseAsset} ${currentPrice ? currentPrice.toLocaleString('en-US') : '--'}
            </span>
          </div>
        </div>

        {/* Right Header Buttons: Order Type Selector */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setShowOrderTypeMenu(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors cursor-pointer shadow-xs ${
                isAdvancedOrder(store.orderType)
                  ? 'bg-brand/15 border-brand text-brand font-bold'
                  : 'bg-tertiary hover:bg-hover border-color text-primary'
              }`}
            >
              <span>{getOrderTypeLabel(store.orderType)}</span>
              <ChevronDown
                size={12}
                className={isAdvancedOrder(store.orderType) ? 'text-brand' : 'text-secondary'}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Order Type Selection Modal / Sheet */}
      {showOrderTypeMenu && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs"
          onClick={() => setShowOrderTypeMenu(false)}
        >
          <div
            className="w-full max-w-sm bg-secondary border border-color rounded-t-3xl sm:rounded-2xl p-4 shadow-2xl space-y-3 animate-slide-up text-primary max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-1 border-b border-color/40">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-brand" />
                <h3 className="text-sm font-bold text-primary">Select Order Type</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowOrderTypeMenu(false)}
                className="w-7 h-7 rounded-full bg-tertiary flex items-center justify-center text-secondary hover:text-primary transition-colors cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            {/* Standard Orders */}
            <div className="space-y-1.5">
              <div className="text-[10.5px] font-semibold text-muted uppercase tracking-wider px-0.5">
                Standard Execution
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    store.setOrderType('MARKET');
                    setShowOrderTypeMenu(false);
                  }}
                  className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer ${
                    store.orderType === 'MARKET'
                      ? 'border-brand bg-brand/10 text-brand shadow-xs'
                      : 'border-color bg-tertiary text-secondary hover:text-primary'
                  }`}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs font-bold text-primary">Market</span>
                    {store.orderType === 'MARKET' && <Check size={13} className="text-brand" />}
                  </div>
                  <div className="text-[10px] text-muted leading-tight">
                    Instant fill at best price
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    store.setOrderType('LIMIT');
                    if (!store.price || store.price === '0') store.setPrice(String(currentPrice));
                    setShowOrderTypeMenu(false);
                  }}
                  className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer ${
                    store.orderType === 'LIMIT'
                      ? 'border-brand bg-brand/10 text-brand shadow-xs'
                      : 'border-color bg-tertiary text-secondary hover:text-primary'
                  }`}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs font-bold text-primary">Limit</span>
                    {store.orderType === 'LIMIT' && <Check size={13} className="text-brand" />}
                  </div>
                  <div className="text-[10px] text-muted leading-tight">
                    Fill at specified target price
                  </div>
                </button>
              </div>
            </div>

            {/* Advanced Orders */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between px-0.5">
                <span className="text-[10.5px] font-semibold text-muted uppercase tracking-wider">
                  Advanced Orders
                </span>
                <span className="text-[9.5px] font-medium text-brand bg-brand/10 px-1.5 py-0.5 rounded-full border border-brand/20">
                  Conditional & Algo
                </span>
              </div>

              <div className="space-y-1.5">
                {ADVANCED_ORDER_TYPES.map(item => {
                  const isSelected = store.orderType === item.value;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => {
                        store.setOrderType(item.value);
                        if (
                          (item.value === 'STOP' || item.value === 'STOP_MARKET') &&
                          (!store.stopPrice || store.stopPrice === '0')
                        ) {
                          store.setStopPrice(String(currentPrice));
                        }
                        if (item.value === 'SCALED') {
                          if (!store.scaledPriceLower || store.scaledPriceLower === '0') {
                            store.setScaledPriceLower((currentPrice * 0.98).toFixed(priceDecimals));
                          }
                          if (!store.scaledPriceUpper || store.scaledPriceUpper === '0') {
                            store.setScaledPriceUpper((currentPrice * 1.02).toFixed(priceDecimals));
                          }
                        }
                        setShowOrderTypeMenu(false);
                      }}
                      className={`w-full p-2.5 rounded-xl text-left border transition-all cursor-pointer flex items-start justify-between gap-2 ${
                        isSelected
                          ? 'border-brand bg-brand/10 shadow-xs'
                          : 'border-color bg-tertiary hover:bg-hover'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span
                            className={`text-xs font-bold ${isSelected ? 'text-brand' : 'text-primary'}`}
                          >
                            {item.label}
                          </span>
                          <span
                            className={`text-[9px] font-semibold px-1.5 py-0.2 rounded border ${item.badgeColor}`}
                          >
                            {item.badge}
                          </span>
                        </div>
                        <p className="text-[10.5px] text-muted leading-tight line-clamp-2">
                          {item.description}
                        </p>
                      </div>
                      {isSelected && <Check size={14} className="text-brand shrink-0 mt-0.5" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Main Content Split: Left Form & Right Ultra-Thin Orderbook */}
      <div className="flex-1 flex overflow-hidden min-h-0 bg-secondary">
        {/* Left Form: Real, working, reactive inputs matching desktop functionality */}
        <div className="flex-1 flex flex-col justify-between p-3.5 overflow-y-auto scrollbar-none space-y-3">
          <div className="space-y-3">
            {/* Header Balance & Margin Card: Minimal, clean, uncrowded */}
            <div className="p-2.5 bg-tertiary/70 border border-color rounded-xl shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-muted font-medium block">Margin Req.</span>
                  <div className="text-lg font-bold font-mono-tabular tracking-tight text-primary">
                    ${displayMargin}
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center justify-end gap-1 text-[10px] text-muted font-medium">
                    <Wallet size={10} className="text-secondary" />
                    <span>Avail. Balance</span>
                  </div>
                  <div className="flex items-center justify-end gap-1.5 mt-0.5">
                    <span className="text-[13px] font-bold font-mono-tabular text-primary">
                      ${availableMargin.toFixed(2)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowDepositModal(true)}
                      className="w-4 h-4 rounded-full bg-brand/20 hover:bg-brand/30 flex items-center justify-center text-brand cursor-pointer transition-colors border border-brand/30 shadow-2xs shrink-0"
                      title="Deposit Margin"
                    >
                      <Plus size={11} strokeWidth={2.5} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1.5 border-t border-color/40 text-[10px] text-secondary">
                <span className="text-muted">Max:</span>
                <span className="font-semibold text-primary font-mono-tabular">
                  {maxPossibleSize > 0
                    ? `${maxPossibleSize.toFixed(store.sizeAsset === 'quote' ? 2 : baseDecimals)} ${store.sizeAsset === 'quote' ? quoteAsset : baseAsset}`
                    : `--`}
                </span>
              </div>
            </div>

            {/* Slider with Active Step Fill & Step Dots */}
            <div className="space-y-1.5">
              <div className="relative py-1">
                <div
                  className="w-full h-2.5 bg-tertiary rounded-full relative flex items-center cursor-pointer p-0.5 border border-color/40"
                  onClick={e => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const clickX = e.clientX - rect.left;
                    const pct = Math.max(0, Math.min(100, Math.round((clickX / rect.width) * 100)));
                    handleSliderChange(pct);
                  }}
                >
                  <div
                    className="bg-brand h-full rounded-full flex items-center justify-end pr-0.5 transition-all duration-75"
                    style={{ width: `${Math.max(sliderVal, 5)}%` }}
                  >
                    <div className="w-3.5 h-3.5 rounded-full bg-white shadow-md shrink-0 translate-x-1" />
                  </div>

                  <div className="absolute inset-0 flex justify-between items-center px-2 pointer-events-none">
                    <div className="w-1 h-1 rounded-full bg-secondary/50" />
                    <div className="w-1 h-1 rounded-full bg-secondary/50" />
                    <div className="w-1 h-1 rounded-full bg-secondary/50" />
                    <div className="w-1 h-1 rounded-full bg-secondary/50" />
                  </div>
                </div>

                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={sliderVal}
                  onChange={e => handleSliderChange(Number(e.target.value))}
                  className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
                />
              </div>

              {/* Quick Percentage Buttons */}
              <div className="grid grid-cols-4 gap-1.5">
                {PERCENT_BUTTONS.map(pct => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => handleSliderChange(pct)}
                    className={`py-0.5 rounded-lg text-[10.5px] font-semibold transition-colors cursor-pointer border ${
                      sliderVal === pct
                        ? 'bg-brand text-white border-brand'
                        : 'bg-tertiary text-secondary border-color hover:text-primary hover:bg-hover'
                    }`}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>

            {/* Validation Error Banner if present */}
            {validation.error && (
              <div className="flex items-center gap-1.5 text-[11px] text-danger bg-danger/10 border border-danger/25 rounded-lg px-2.5 py-1.5 leading-snug">
                <AlertCircle size={13} className="shrink-0 text-danger" />
                <span>{validation.error}</span>
              </div>
            )}

            {/* Form Fields: Real working inputs */}
            <div className="space-y-2 pt-0.5 text-[12px]">
              {/* Trigger Price Input (For Stop Limit and Stop Market Orders) */}
              {(store.orderType === 'STOP' || store.orderType === 'STOP_MARKET') && (
                <div className="flex items-center justify-between bg-tertiary border border-color rounded-xl px-3 py-2 focus-within:border-brand transition-colors">
                  <span className="text-secondary font-medium shrink-0">Trigger Price</span>
                  <div className="flex items-center gap-1.5 flex-1 justify-end">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={store.stopPrice}
                      onChange={e => {
                        const val = e.target.value;
                        if (val === '' || /^\d*\.?\d*$/.test(val)) store.setStopPrice(val);
                      }}
                      placeholder={currentPrice ? currentPrice.toFixed(priceDecimals) : '0.00'}
                      className="w-full text-right bg-transparent text-primary font-mono text-[13px] font-medium outline-none placeholder:text-muted"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (currentPrice > 0)
                          store.setStopPrice(currentPrice.toFixed(priceDecimals));
                      }}
                      className="px-2 py-0.5 rounded bg-secondary text-[10px] font-semibold text-secondary hover:text-primary transition-colors border border-color shrink-0 cursor-pointer"
                      title="Set to Mark Price"
                    >
                      Mark
                    </button>
                  </div>
                </div>
              )}

              {/* Limit Price Input (For Limit, Post Only, Stop Limit Orders) */}
              {(store.orderType === 'LIMIT' ||
                store.orderType === 'POST_ONLY' ||
                store.orderType === 'STOP') && (
                <div className="flex items-center justify-between bg-tertiary border border-color rounded-xl px-3 py-2 focus-within:border-brand transition-colors">
                  <span className="text-secondary font-medium shrink-0">Price</span>
                  <div className="flex items-center gap-1.5 flex-1 justify-end">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={store.price}
                      onChange={e => {
                        const val = e.target.value;
                        if (val === '' || /^\d*\.?\d*$/.test(val)) store.setPrice(val);
                      }}
                      placeholder={currentPrice ? currentPrice.toFixed(priceDecimals) : '0.00'}
                      className="w-full text-right bg-transparent text-primary font-mono text-[13px] font-medium outline-none placeholder:text-muted"
                    />
                    <button
                      type="button"
                      onClick={handleBboFill}
                      className="px-2 py-0.5 rounded bg-secondary text-[10px] font-semibold text-secondary hover:text-primary transition-colors border border-color shrink-0 cursor-pointer"
                      title="Set to Best Bid/Offer"
                    >
                      BBO
                    </button>
                  </div>
                </div>
              )}

              {/* Post Only (GTX) Info Badge */}
              {store.orderType === 'POST_ONLY' && (
                <div className="text-[11px] text-brand bg-brand/10 border border-brand/20 rounded-xl px-3 py-1.5 flex items-center justify-between font-medium">
                  <span>Post Only (Maker Only)</span>
                  <span className="font-mono text-[10px] font-bold bg-brand/20 text-brand px-1.5 py-0.5 rounded">
                    TIF: GTX
                  </span>
                </div>
              )}

              {/* Trailing Stop Dynamic Inputs */}
              {store.orderType === 'TRAILING_STOP_MARKET' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between bg-tertiary border border-color rounded-xl px-3 py-2 focus-within:border-brand transition-colors">
                    <span className="text-secondary font-medium shrink-0">Activation</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={store.activationPrice}
                      onChange={e => {
                        const val = e.target.value;
                        if (val === '' || /^\d*\.?\d*$/.test(val)) store.setActivationPrice(val);
                      }}
                      placeholder="Optional (Market price)"
                      className="w-full text-right bg-transparent text-primary font-mono text-[13px] font-medium outline-none placeholder:text-muted"
                    />
                  </div>

                  <div className="flex items-center justify-between bg-tertiary border border-color rounded-xl px-3 py-2 focus-within:border-brand transition-colors">
                    <span className="text-secondary font-medium shrink-0">Callback %</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={store.callbackRate}
                        onChange={e => {
                          const val = e.target.value;
                          if (val === '' || /^\d*\.?\d*$/.test(val)) store.setCallbackRate(val);
                        }}
                        placeholder="0.1 to 5.0"
                        className="w-24 text-right bg-transparent text-primary font-mono text-[13px] font-medium outline-none placeholder:text-muted"
                      />
                      <span className="text-muted text-xs">%</span>
                    </div>
                  </div>

                  {/* Callback Rate Chips */}
                  <div className="flex gap-1.5">
                    {['0.5', '1.0', '2.0', '3.0', '5.0'].map(rate => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => store.setCallbackRate(rate)}
                        className={`flex-1 py-1 text-[10px] font-semibold rounded-lg border transition-colors cursor-pointer ${
                          store.callbackRate === rate
                            ? 'bg-brand/20 border-brand text-brand font-bold'
                            : 'bg-tertiary border-color text-secondary hover:text-primary'
                        }`}
                      >
                        {rate}%
                      </button>
                    ))}
                  </div>
                  <div className="text-[10px] text-secondary bg-tertiary/60 border border-color rounded-lg p-2 leading-snug">
                    Tracks peak price and triggers execution when price reverses by{' '}
                    <strong className="text-primary">{store.callbackRate || '1.0'}%</strong>.
                  </div>
                </div>
              )}

              {/* Chase Order Dynamic Inputs */}
              {store.orderType === 'CHASE' && (
                <div className="space-y-2 bg-tertiary/80 border border-color rounded-xl p-2.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-secondary font-medium">Chase Mode</span>
                    <div className="flex gap-1 bg-secondary p-0.5 rounded-lg border border-color">
                      <button
                        type="button"
                        onClick={() => {
                          store.setChasePriceMode('BBO');
                          store.setChaseOffset('0');
                        }}
                        className={`px-2 py-0.5 text-[10px] font-semibold rounded-md transition-colors cursor-pointer ${
                          store.chasePriceMode === 'BBO'
                            ? 'bg-brand text-white'
                            : 'text-secondary hover:text-primary'
                        }`}
                      >
                        Best BBO
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          store.setChasePriceMode('GAP');
                          if (!store.chaseOffset || store.chaseOffset === '0') {
                            store.setChaseOffset(
                              currentMarket?.tickSize ? String(currentMarket.tickSize) : '0.5'
                            );
                          }
                        }}
                        className={`px-2 py-0.5 text-[10px] font-semibold rounded-md transition-colors cursor-pointer ${
                          store.chasePriceMode === 'GAP'
                            ? 'bg-brand text-white'
                            : 'text-secondary hover:text-primary'
                        }`}
                      >
                        Gap Offset
                      </button>
                    </div>
                  </div>

                  {store.chasePriceMode === 'GAP' && (
                    <div className="flex items-center justify-between bg-secondary border border-color rounded-lg px-2.5 py-1.5 focus-within:border-brand">
                      <span className="text-muted text-[11px]">Gap offset</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={store.chaseOffset}
                        onChange={e => {
                          const val = e.target.value;
                          if (val === '' || /^\d*\.?\d*$/.test(val)) store.setChaseOffset(val);
                        }}
                        placeholder="0.00"
                        className="w-full text-right bg-transparent text-primary font-mono text-xs font-medium outline-none"
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[10.5px] font-mono pt-0.5 text-secondary">
                    <div className="flex items-center gap-1">
                      <span className="text-muted text-[10px]">
                        {store.chasePriceMode === 'GAP' ? 'Your Bid' : 'Best Bid'}:
                      </span>
                      <span className="text-success font-semibold">
                        {store.chasePriceMode === 'GAP' ? yourBid : bestBid}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-muted text-[10px]">
                        {store.chasePriceMode === 'GAP' ? 'Your Ask' : 'Best Ask'}:
                      </span>
                      <span className="text-danger font-semibold">
                        {store.chasePriceMode === 'GAP' ? yourAsk : bestAsk}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Scaled Order Dynamic Inputs */}
              {store.orderType === 'SCALED' && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-tertiary border border-color rounded-xl px-2.5 py-1.5 focus-within:border-brand">
                      <label className="text-[10px] text-muted block">Price Lower</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={store.scaledPriceLower}
                        onChange={e => {
                          const val = e.target.value;
                          if (val === '' || /^\d*\.?\d*$/.test(val)) store.setScaledPriceLower(val);
                        }}
                        placeholder="0.00"
                        className="w-full bg-transparent text-primary text-xs font-mono outline-none"
                      />
                    </div>
                    <div className="bg-tertiary border border-color rounded-xl px-2.5 py-1.5 focus-within:border-brand">
                      <label className="text-[10px] text-muted block">Price Upper</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={store.scaledPriceUpper}
                        onChange={e => {
                          const val = e.target.value;
                          if (val === '' || /^\d*\.?\d*$/.test(val)) store.setScaledPriceUpper(val);
                        }}
                        placeholder="0.00"
                        className="w-full bg-transparent text-primary text-xs font-mono outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between bg-tertiary border border-color rounded-xl px-3 py-1.5 focus-within:border-brand">
                    <span className="text-secondary font-medium text-xs">Order Count</span>
                    <input
                      type="number"
                      min={2}
                      max={20}
                      value={store.scaledOrderCount}
                      onChange={e => store.setScaledOrderCount(e.target.value)}
                      placeholder="2 - 20"
                      className="w-20 text-right bg-transparent text-primary font-mono text-xs font-medium outline-none"
                    />
                  </div>

                  <div className="flex gap-1 bg-tertiary p-1 rounded-xl border border-color text-xs">
                    {['FLAT', 'ASCENDING', 'DESCENDING'].map(dist => (
                      <button
                        key={dist}
                        type="button"
                        onClick={() => store.setScaledDistribution(dist as any)}
                        className={`flex-1 py-1 text-center rounded-lg transition-colors cursor-pointer text-[10.5px] font-semibold ${
                          store.scaledDistribution === dist
                            ? 'bg-secondary text-primary shadow-xs'
                            : 'text-secondary hover:text-primary'
                        }`}
                      >
                        {dist === 'FLAT'
                          ? 'Flat'
                          : dist === 'ASCENDING'
                            ? 'Scale Up'
                            : 'Scale Down'}
                      </button>
                    ))}
                  </div>

                  {store.scaledPriceLower && store.scaledPriceUpper && store.scaledOrderCount && (
                    <div className="text-[10px] text-secondary bg-brand/5 p-2 rounded-lg border border-brand/15 text-center leading-snug">
                      Splits size into{' '}
                      <strong className="text-brand">{store.scaledOrderCount}</strong> limit orders
                      between <strong className="text-primary">{store.scaledPriceLower}</strong> and{' '}
                      <strong className="text-primary">{store.scaledPriceUpper}</strong>.
                    </div>
                  )}
                </div>
              )}

              {/* Size Input with Interactive Currency Toggle */}
              <div className="flex items-center justify-between bg-tertiary border border-color rounded-xl px-3 py-2 focus-within:border-brand transition-colors">
                <span className="text-secondary font-medium shrink-0">Size</span>
                <div className="flex items-center gap-1.5 flex-1 justify-end">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={store.size}
                    onChange={e => {
                      const val = e.target.value;
                      if (val === '' || /^\d*\.?\d*$/.test(val)) {
                        store.setSize(val);
                        setSliderVal(0);
                      }
                    }}
                    placeholder="0.00"
                    className="w-full text-right bg-transparent text-primary font-mono text-[13px] font-medium outline-none placeholder:text-muted"
                  />
                  <button
                    type="button"
                    onClick={handleCurrencyToggle}
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-secondary text-[11px] font-semibold text-primary hover:text-brand transition-colors border border-color shrink-0 cursor-pointer"
                    title="Toggle Base / Quote Currency"
                  >
                    <span>{store.sizeAsset === 'base' ? baseAsset : quoteAsset}</span>
                    <ArrowUpDown size={11} className="text-muted" />
                  </button>
                </div>
              </div>

              {/* Leverage Selector Row */}
              <button
                type="button"
                onClick={() => setShowLeverageModal(true)}
                className="w-full flex items-center justify-between py-1 px-1 hover:bg-hover rounded-lg transition-colors text-left cursor-pointer"
              >
                <span className="text-secondary font-medium">Leverage</span>
                <div className="flex items-center gap-1 text-primary font-semibold font-mono">
                  <span className="capitalize">{symbolMarginType}</span>
                  <span>{symbolLeverage}x</span>
                  <ChevronRight size={14} className="text-muted" />
                </div>
              </button>

              {/* TP / SL Toggle & Inputs (For non-scaled/chase or limit/market) */}
              {store.orderType !== 'SCALED' && store.orderType !== 'CHASE' && (
                <div className="space-y-1.5 border-t border-color/40 pt-1.5">
                  <div className="flex items-center justify-between py-0.5 px-1">
                    <span className="text-secondary font-medium">Take Profit / Stop Loss</span>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={store.attachedTpEnabled || store.attachedSlEnabled}
                        onChange={e => {
                          store.setAttachedTpEnabled(e.target.checked);
                          store.setAttachedSlEnabled(e.target.checked);
                        }}
                        className="rounded border-color bg-tertiary text-brand w-3.5 h-3.5 cursor-pointer"
                      />
                      <span className="text-[11px] text-secondary">Enable</span>
                    </label>
                  </div>

                  {(store.attachedTpEnabled || store.attachedSlEnabled) && (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div className="bg-tertiary border border-color rounded-xl px-2.5 py-1.5 focus-within:border-brand">
                        <label className="text-[10px] text-muted block">TP Price</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={store.attachedTpPrice}
                          onChange={e => {
                            const val = e.target.value;
                            if (val === '' || /^\d*\.?\d*$/.test(val))
                              store.setAttachedTpPrice(val);
                          }}
                          placeholder="0.00"
                          className="w-full bg-transparent text-primary text-xs font-mono outline-none"
                        />
                      </div>
                      <div className="bg-tertiary border border-color rounded-xl px-2.5 py-1.5 focus-within:border-brand">
                        <label className="text-[10px] text-muted block">SL Price</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={store.attachedSlPrice}
                          onChange={e => {
                            const val = e.target.value;
                            if (val === '' || /^\d*\.?\d*$/.test(val))
                              store.setAttachedSlPrice(val);
                          }}
                          placeholder="0.00"
                          className="w-full bg-transparent text-primary text-xs font-mono outline-none"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Liquidation Price Row */}
              <div className="flex items-center justify-between py-1 px-1">
                <span className="text-secondary font-medium">Liquidation price</span>
                <span className="text-warning font-mono font-bold tracking-tight">
                  {estimatedLiquidationPrice != null && estimatedLiquidationPrice > 0
                    ? `$${estimatedLiquidationPrice.toLocaleString('en-US', {
                        minimumFractionDigits: priceDecimals,
                        maximumFractionDigits: priceDecimals,
                      })}`
                    : '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Action Button: Connect EVM / 1-Click Trading / Submit Order */}
          <div className="pt-2">
            {!isEvmConnected ? (
              <button
                type="button"
                onClick={openWalletModal}
                className="w-full h-11 bg-brand hover:bg-brand-hover text-white rounded-xl font-bold text-sm transition-all cursor-pointer shadow-md flex items-center justify-center gap-2 active:scale-[0.99]"
              >
                <Wallet size={16} />
                <span>Connect EVM Wallet</span>
              </button>
            ) : !isAgentReady ? (
              <div className="space-y-1.5">
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
                  className={`w-full h-11 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer select-none active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed ${
                    deriveState === 'signing'
                      ? 'bg-brand/80 text-white cursor-wait'
                      : deriveState === 'error'
                        ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30 hover:bg-rose-500/25'
                        : 'bg-brand hover:bg-brand-hover text-white shadow-md'
                  }`}
                >
                  {deriveState === 'signing' ? (
                    <>
                      <Loader2 size={16} className="animate-spin text-white" />
                      <span>Waiting for Signature...</span>
                    </>
                  ) : deriveState === 'error' ? (
                    <>
                      <AlertCircle size={16} className="text-rose-400" />
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
                      <Zap size={16} className="text-white fill-white" />
                      <span>Enable 1-Click Trading</span>
                    </>
                  )}
                </button>
                <p className="text-[10.5px] text-center text-muted leading-tight">
                  {deriveState === 'signing'
                    ? 'Confirm signature request in your wallet'
                    : isDepositError
                      ? `Initial deposit or faucet required to activate ${currentExchange === 'hyperliquid' ? 'Hyperliquid' : 'Aster V3'}`
                      : `One-time signature to activate gas-free trading on ${currentExchange === 'hyperliquid' ? 'Hyperliquid' : 'Aster V3'}`}
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleSubmitOrder}
                disabled={
                  isSubmitting ||
                  isSigning ||
                  !isReady ||
                  (!validation.isValid && !!store.size && parseFloat(store.size) > 0)
                }
                className={`w-full h-11 rounded-xl font-bold text-sm text-white transition-all shadow-md active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2 ${
                  isLong ? 'bg-success hover:bg-success/90' : 'bg-danger hover:bg-danger/90'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <span>{submitButtonText}</span>
              </button>
            )}
          </div>
        </div>

        {/* Right Live Mini Orderbook (120px) using bg-secondary */}
        <div className="w-[120px] shrink-0 border-l border-color px-1 py-1 flex flex-col h-full bg-secondary">
          <MobileMiniOrderbook
            currentPrice={currentPrice}
            tickSize={currentMarket?.tickSize}
            onSelectPrice={handleSelectPriceFromBook}
          />
        </div>
      </div>

      {/* Real Leverage Modal */}
      <LeverageModal isOpen={showLeverageModal} onClose={() => setShowLeverageModal(false)} />

      {/* Real Deposit / Account Modal */}
      <AccountModal
        isOpen={showDepositModal}
        onClose={() => setShowDepositModal(false)}
        initialTab="deposit"
      />
    </div>
  );
};
