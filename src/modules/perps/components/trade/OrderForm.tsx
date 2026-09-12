import { Check, ChevronDown, Plus } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import InfoBanner from '../../../../components/common/InfoBanner';
import { useExchangeManager } from '../../core/ExchangeManager';
import { useAccountStore } from '../../core/stores/accountStore';
import { useMarketStore } from '../../core/stores/marketStore';
import {
  type TimeInForce,
  type WorkingType,
  useOrderEntryStore,
} from '../../core/stores/orderEntryStore';
import { useOrderbookStore } from '../../core/stores/orderbookStore';
import { useTickerStore } from '../../core/stores/tickerStore';
import { useTradeCalculations } from '../../hooks/useTradeCalculations';
import { validateOrder } from '../../utils/orderValidation';
import { AssetModeModal } from './AssetModeModal';
import { OrderActionButton } from './OrderActionButton';
import { OrderInput } from './OrderInput';
import { OrderTypeSelector } from './OrderTypeSelector';

interface OrderFormProps {
  onSubmitOrder: (params: any) => Promise<void>;
  isLoading?: boolean;
  onOpenMarginModal: () => void;
  onOpenLeverageModal: () => void;
  onOpenDepositModal: () => void;
}

const TIF_OPTIONS: { label: string; value: TimeInForce }[] = [
  { label: 'GTC', value: 'GTC' },
  { label: 'IOC', value: 'IOC' },
  { label: 'FOK', value: 'FOK' },
  { label: 'GTX (Post Only)', value: 'GTX' },
];

export const OrderForm: React.FC<OrderFormProps> = ({
  onSubmitOrder,
  isLoading,
  onOpenMarginModal,
  onOpenLeverageModal,
  onOpenDepositModal,
}) => {
  const store = useOrderEntryStore();
  const currentNetwork = useExchangeManager(state => state.currentNetwork);
  const currentExchange = useExchangeManager(state => state.currentExchange);
  const isLoadingBalance = useAccountStore(state => state.isLoading);
  const multiAssetsMargin = useAccountStore(state => state.multiAssetsMargin);
  const [isAssetModeModalOpen, setIsAssetModeModalOpen] = useState(false);
  const [isTifOpen, setIsTifOpen] = useState(false);
  const [isChaseDropdownOpen, setIsChaseDropdownOpen] = useState(false);
  const chaseDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (chaseDropdownRef.current && !chaseDropdownRef.current.contains(event.target as Node)) {
        setIsChaseDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedSymbol = useMarketStore(state => state.selectedSymbol);
  const markets = useMarketStore(state => state.markets);
  const market = markets[selectedSymbol] || null;

  useEffect(() => {
    if (selectedSymbol) {
      store.syncForSymbol(selectedSymbol);
    }
  }, [selectedSymbol]);

  const baseAsset = market?.baseAsset || selectedSymbol.split('-')[0] || 'ASSET';
  const quoteAsset =
    currentExchange === 'hyperliquid'
      ? 'USDC'
      : market?.quoteAsset ||
        (selectedSymbol.includes('-') ? selectedSymbol.split('-')[1] : 'USDT');

  const baseBalance = useAccountStore(state => state.balances[baseAsset]);
  const quoteBalance = useAccountStore(
    state =>
      state.balances[quoteAsset] || (quoteAsset === 'USDC' ? state.balances['USD'] : undefined)
  );

  const relevantBalances = useMemo(() => {
    return [baseBalance, quoteBalance].filter(Boolean);
  }, [baseBalance, quoteBalance]);

  const {
    walletBalance: calcWalletBalance,
    maxPossibleSize,
    orderCost,
    estimatedIsolatedLiqPrice,
    currentPrice,
  } = useTradeCalculations(
    selectedSymbol,
    store.size,
    store.sizeAsset,
    store.leverage,
    store.marginType
  );

  const validation = useMemo(() => {
    return validateOrder(
      market,
      currentPrice,
      relevantBalances,
      store.side,
      store.orderType,
      store.price,
      store.size,
      store.sizeAsset,
      store.stopPrice,
      store.callbackRate,
      maxPossibleSize
    );
  }, [
    market,
    currentPrice,
    relevantBalances,
    store.side,
    store.orderType,
    store.price,
    store.size,
    store.sizeAsset,
    store.stopPrice,
    store.callbackRate,
    maxPossibleSize,
  ]);

  const handleSubmit = (side: 'BUY' | 'SELL') => {
    store.setSide(side);
    const payload = {
      symbol: selectedSymbol,
      side,
      type: store.orderType === 'POST_ONLY' ? 'LIMIT' : store.orderType,
      size: store.size,
      sizeAsset: store.sizeAsset,
      price: store.price,
      leverage: store.leverage,
      isReduceOnly: store.isReduceOnly,
      isPostOnly: store.orderType === 'POST_ONLY' || store.isPostOnly,
      stopPrice: store.stopPrice,
      activationPrice: store.activationPrice,
      callbackRate: store.callbackRate,
      chaseOffset: store.chasePriceMode === 'GAP' ? store.chaseOffset : '0',
      chasePriceMode: store.chasePriceMode,
      maxChaseOffset: store.maxChaseOffset,
      maxChaseDifferenceEnabled: store.maxChaseDifferenceEnabled,
      scaledPriceLower: store.scaledPriceLower,
      scaledPriceUpper: store.scaledPriceUpper,
      scaledOrderCount: store.scaledOrderCount,
      scaledDistribution: store.scaledDistribution,
      timeInForce: store.orderType === 'POST_ONLY' ? 'GTX' : store.timeInForce,
      workingType: store.workingType,
      slippageEnabled: store.slippageEnabled,
      slippageTolerance: store.slippageTolerance,
      attachedTpEnabled: store.attachedTpEnabled,
      attachedTpPrice: store.attachedTpPrice,
      attachedTpTrigger: store.attachedTpTrigger,
      attachedSlEnabled: store.attachedSlEnabled,
      attachedSlPrice: store.attachedSlPrice,
      attachedSlTrigger: store.attachedSlTrigger,
    };

    onSubmitOrder(payload);
  };

  const currentCurrency = store.sizeAsset === 'base' ? baseAsset : quoteAsset;
  const baseDecimals = market?.stepSize ? Math.max(0, -Math.floor(Math.log10(market.stepSize))) : 4;
  const priceDecimals = market?.tickSize
    ? Math.max(0, -Math.floor(Math.log10(market.tickSize)))
    : 2;

  const actionSubtext = useMemo(() => {
    const size = parseFloat(store.size) || 0;
    if (size <= 0) return undefined;
    if (store.sizeAsset === 'quote') {
      const eqBase = currentPrice > 0 ? size / currentPrice : 0;
      return `≈${eqBase.toFixed(baseDecimals)} ${baseAsset}`;
    } else {
      return `≈${orderCost.toFixed(2)} ${quoteAsset}`;
    }
  }, [store.size, store.sizeAsset, currentPrice, orderCost, baseDecimals, baseAsset, quoteAsset]);

  const book = useOrderbookStore(
    state => state.books[selectedSymbol] || state.books[selectedSymbol.replace('-', '')]
  );
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

  const handleCurrencyToggle = (curr: string) => {
    const newAsset = curr === baseAsset ? 'base' : 'quote';
    if (newAsset !== store.sizeAsset) {
      const currentSize = parseFloat(store.size) || 0;
      if (currentSize > 0 && currentPrice > 0) {
        if (newAsset === 'quote') {
          store.setSize((currentSize * currentPrice).toFixed(2));
        } else {
          store.setSize((currentSize / currentPrice).toFixed(baseDecimals));
        }
      }
      store.setSizeAsset(newAsset);
    }
  };

  const markPrice = useTickerStore(
    state => parseFloat(state.assetCtxByMarket[selectedSymbol]?.markPx || '0') || currentPrice
  );

  const handleBboFill = () => {
    if (currentPrice > 0) {
      store.setPrice(currentPrice.toFixed(priceDecimals));
    }
  };

  const handleTriggerFill = () => {
    const targetPx =
      store.workingType === 'MARK_PRICE' ? markPrice || currentPrice : currentPrice || markPrice;
    if (targetPx > 0) {
      store.setStopPrice(targetPx.toFixed(priceDecimals));
    }
  };

  const isStopOrder =
    store.orderType === 'STOP' ||
    store.orderType === 'STOP_MARKET' ||
    store.orderType === 'TAKE_PROFIT' ||
    store.orderType === 'TAKE_PROFIT_MARKET';

  const isPriceOrder =
    store.orderType === 'LIMIT' ||
    store.orderType === 'POST_ONLY' ||
    store.orderType === 'STOP' ||
    store.orderType === 'TAKE_PROFIT';

  const currentSliderPct = Math.min(
    100,
    Math.max(0, maxPossibleSize > 0 ? ((parseFloat(store.size) || 0) / maxPossibleSize) * 100 : 0)
  );

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-3 py-0 space-y-2.5 scrollbar-thin ">
      <OrderTypeSelector activeType={store.orderType} onChange={store.setOrderType} />

      <div className="flex justify-between items-center text-[12px] text-secondary pt-0.5">
        <div className="flex items-center gap-1.5">
          <span>Avbl</span>
          {isLoadingBalance ? (
            <div className="h-3.5 w-16 bg-gradient-to-r from-tertiary via-hover to-tertiary bg-[length:200%_100%] animate-pulse rounded" />
          ) : (
            <span className="text-primary font-medium">
              {calcWalletBalance.toFixed(2)} {quoteAsset}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onOpenDepositModal}
          className="w-4 h-4 rounded-full border border-brand/50 text-brand hover:bg-brand/10 flex items-center justify-center transition-colors cursor-pointer"
          title={currentNetwork === 'testnet' ? 'Claim Testnet Faucet Funds' : 'Deposit'}
        >
          <Plus size={11} strokeWidth={2.5} />
        </button>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onOpenMarginModal}
          className="flex-1 bg-tertiary border border-color hover:border-border-dark rounded-md py-1.5 text-[12px] font-medium text-primary transition-colors cursor-pointer text-center"
        >
          {store.marginType === 'cross' ? 'Cross' : 'Isolated'}
        </button>
        <button
          type="button"
          onClick={onOpenLeverageModal}
          className="flex-1 bg-tertiary border border-color hover:border-border-dark rounded-md py-1.5 text-[12px] font-medium text-primary transition-colors cursor-pointer text-center"
        >
          {store.leverage}x
        </button>
        {currentExchange === 'aster' && (
          <button
            type="button"
            onClick={() => setIsAssetModeModalOpen(true)}
            className={`w-9 border rounded-md py-1.5 text-[12px] font-bold transition-all flex items-center justify-center cursor-pointer ${
              multiAssetsMargin
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-400 shadow-xs'
                : 'bg-tertiary border-color hover:border-border-dark text-secondary hover:text-primary'
            }`}
            title={multiAssetsMargin ? 'Multi-Asset Mode (Active)' : 'Single-Asset Mode (Active)'}
          >
            {multiAssetsMargin ? 'M' : 'S'}
          </button>
        )}
      </div>

      <div className="space-y-2">
        {isStopOrder && (
          <OrderInput
            label="Trigger price"
            value={store.stopPrice}
            onChange={store.setStopPrice}
            onFocus={() => store.setActiveInput('stopPrice')}
            currency={quoteAsset}
            placeholder="0.00"
            triggerOption={store.workingType === 'MARK_PRICE' ? 'Mark' : 'Last'}
            triggerOptions={['Mark', 'Last']}
            onTriggerOptionChange={opt =>
              store.setWorkingType(opt === 'Mark' ? 'MARK_PRICE' : 'CONTRACT_PRICE')
            }
            onTriggerFill={handleTriggerFill}
            error={validation.errorField === 'stopPrice'}
          />
        )}

        {isPriceOrder && (
          <OrderInput
            label="Order price"
            value={store.price}
            onChange={store.setPrice}
            onFocus={() => store.setActiveInput('price')}
            currency={quoteAsset}
            placeholder="0.00"
            onBboClick={handleBboFill}
            error={validation.errorField === 'price'}
          />
        )}

        {store.orderType === 'POST_ONLY' && (
          <div className="text-[11px] text-secondary bg-brand/5 border border-brand/15 rounded-md p-2 flex items-center justify-between">
            <span>Post Only (Maker Only)</span>
            <span className="text-brand font-mono text-[10px] font-semibold">TIF: GTX</span>
          </div>
        )}

        {store.orderType === 'TRAILING_STOP_MARKET' && (
          <>
            <OrderInput
              label="Activation"
              value={store.activationPrice}
              onChange={store.setActivationPrice}
              onFocus={() => store.setActiveInput('activationPrice')}
              currency={quoteAsset}
              placeholder="Market price if empty"
            />
            <OrderInput
              label="Callback %"
              value={store.callbackRate}
              onChange={store.setCallbackRate}
              currency="%"
              placeholder="0.1 to 5"
              error={validation.errorField === 'callbackRate'}
            />
            <div className="flex gap-1.5 pt-0.5">
              {['0.5', '1.0', '2.0', '3.0', '5.0'].map(rate => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => store.setCallbackRate(rate)}
                  className={`flex-1 py-1 text-[10px] rounded border transition-colors ${
                    store.callbackRate === rate
                      ? 'bg-brand/15 border-brand text-brand font-semibold'
                      : 'bg-tertiary border-color text-secondary hover:text-primary'
                  }`}
                >
                  {rate}%
                </button>
              ))}
            </div>
            <div className="text-[10.5px] text-secondary bg-tertiary/60 border border-color rounded-md p-1.5 leading-snug">
              Tracks peak market price and triggers execution when price reverses by{' '}
              <strong className="text-primary">{store.callbackRate || '1.0'}%</strong>.
            </div>
          </>
        )}

        {store.orderType === 'CHASE' && (
          <div className="space-y-2">
            <div className="bg-tertiary border border-color rounded-lg p-2.5 space-y-2.5">
              <div className="flex justify-between items-center text-[12px]">
                <span className="text-secondary font-medium">Chase price</span>
                <div className="relative" ref={chaseDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setIsChaseDropdownOpen(!isChaseDropdownOpen)}
                    className="flex items-center gap-1.5 text-primary font-medium text-[11px] bg-secondary hover:bg-hover px-2.5 py-1 rounded border border-color shadow-xs transition-colors cursor-pointer"
                  >
                    <span>
                      {store.chasePriceMode === 'GAP' ? 'Gap from best bid/ask' : 'Best bid/ask'}
                    </span>
                    <ChevronDown size={11} className="text-secondary" />
                  </button>

                  {isChaseDropdownOpen && (
                    <div className="absolute right-0 top-full mt-1 w-[165px] bg-secondary border border-color rounded-md shadow-2xl overflow-hidden z-50 py-1">
                      <button
                        type="button"
                        onClick={() => {
                          store.setChasePriceMode('BBO');
                          store.setChaseOffset('0');
                          setIsChaseDropdownOpen(false);
                        }}
                        className={`flex items-center justify-between w-full px-3 py-2 text-[11px] text-left hover:bg-hover transition-colors ${
                          store.chasePriceMode === 'BBO'
                            ? 'text-brand font-semibold'
                            : 'text-primary'
                        }`}
                      >
                        <span>Best bid/ask</span>
                        {store.chasePriceMode === 'BBO' && (
                          <Check size={12} className="text-brand" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          store.setChasePriceMode('GAP');
                          if (!store.chaseOffset || store.chaseOffset === '0') {
                            store.setChaseOffset(
                              market?.tickSize ? String(market.tickSize) : '0.5'
                            );
                          }
                          setIsChaseDropdownOpen(false);
                        }}
                        className={`flex items-center justify-between w-full px-3 py-2 text-[11px] text-left hover:bg-hover transition-colors ${
                          store.chasePriceMode === 'GAP'
                            ? 'text-brand font-semibold'
                            : 'text-primary'
                        }`}
                      >
                        <span>Gap from best bid/ask</span>
                        {store.chasePriceMode === 'GAP' && (
                          <Check size={12} className="text-brand" />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {store.chasePriceMode === 'GAP' && (
                <OrderInput
                  label="Gap value"
                  value={store.chaseOffset}
                  onChange={store.setChaseOffset}
                  currency={quoteAsset}
                  placeholder="0.00"
                />
              )}

              {/* Seamless, dark price display without any harsh horizontal line */}
              <div className="flex items-center justify-between text-[11px] font-mono pt-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-muted text-[10.5px]">
                    {store.chasePriceMode === 'GAP' ? 'Your bid' : 'Best bid'}
                  </span>
                  <span className="text-success font-semibold">
                    {store.chasePriceMode === 'GAP' ? yourBid : bestBid}
                  </span>
                </div>
                <span className="text-muted/30">/</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-muted text-[10.5px]">
                    {store.chasePriceMode === 'GAP' ? 'Your ask' : 'Best ask'}
                  </span>
                  <span className="text-danger font-semibold">
                    {store.chasePriceMode === 'GAP' ? yourAsk : bestAsk}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {store.orderType === 'SCALED' && (
          <>
            <OrderInput
              label="Price Lower"
              value={store.scaledPriceLower}
              onChange={store.setScaledPriceLower}
              currency={quoteAsset}
              placeholder="0.00"
            />
            <OrderInput
              label="Price Upper"
              value={store.scaledPriceUpper}
              onChange={store.setScaledPriceUpper}
              currency={quoteAsset}
              placeholder="0.00"
            />
            <OrderInput
              label="Order Count"
              value={store.scaledOrderCount}
              onChange={store.setScaledOrderCount}
              currency=""
              placeholder="2 - 20"
            />
            <div className="flex justify-between items-center text-[12px] bg-tertiary border border-color rounded-md p-1">
              {['FLAT', 'ASCENDING', 'DESCENDING'].map(dist => (
                <button
                  key={dist}
                  type="button"
                  onClick={() => store.setScaledDistribution(dist as any)}
                  className={`flex-1 py-1 text-center rounded transition-colors ${
                    store.scaledDistribution === dist
                      ? 'bg-secondary text-primary shadow-sm font-medium'
                      : 'text-secondary hover:text-primary'
                  }`}
                >
                  {dist === 'FLAT' ? 'Flat' : dist === 'ASCENDING' ? 'Scale Up' : 'Scale Down'}
                </button>
              ))}
            </div>

            {store.scaledPriceLower && store.scaledPriceUpper && store.scaledOrderCount && (
              <div className="text-[11px] text-secondary bg-brand/5 p-2 rounded-md border border-brand/15 leading-relaxed text-center">
                Splits size into <strong className="text-brand">{store.scaledOrderCount}</strong>{' '}
                limit orders between{' '}
                <strong className="text-primary">{store.scaledPriceLower}</strong> and{' '}
                <strong className="text-primary">{store.scaledPriceUpper}</strong>.
                <div className="text-[10px] text-muted mt-1">
                  Each order must be at least $5.00 USDT notional.
                </div>
              </div>
            )}
          </>
        )}

        <OrderInput
          label="Size"
          value={store.size}
          onChange={store.setSize}
          currency={currentCurrency}
          currencyOptions={[quoteAsset, baseAsset]}
          onCurrencyChange={handleCurrencyToggle}
          placeholder="0.00"
          error={validation.errorField === 'size'}
        />

        {/* Theme Range Slider */}
        <div className="px-1 py-1">
          <div className="relative w-full h-1 bg-border-color rounded-full flex items-center">
            <div
              className="absolute h-full bg-brand rounded-l-full pointer-events-none"
              style={{ width: `${currentSliderPct}%` }}
            />

            <div className="absolute inset-0 flex justify-between items-center pointer-events-none px-[1px]">
              {[0, 25, 50, 75, 100].map(mark => (
                <div
                  key={mark}
                  className={`w-1.5 h-1.5 rounded-full z-0 transition-colors ${
                    currentSliderPct >= mark
                      ? 'bg-brand ring-2 ring-brand/30'
                      : 'bg-tertiary border border-color'
                  }`}
                />
              ))}
            </div>

            <input
              type="range"
              min="0"
              max="100"
              value={currentSliderPct.toFixed(0)}
              onChange={e => {
                const pct = parseFloat(e.target.value) / 100;
                const newSize = maxPossibleSize * pct;
                if (newSize > 0) {
                  const stepPrecision = store.sizeAsset === 'quote' ? 2 : baseDecimals;
                  store.setSize(newSize.toFixed(stepPrecision));
                } else {
                  store.setSize('');
                }
              }}
              className="absolute inset-0 w-full h-4 -top-1.5 opacity-0 cursor-pointer z-10"
            />

            <div
              className="absolute w-3.5 h-3.5 bg-white rounded-full shadow pointer-events-none border-2 border-brand z-10"
              style={{
                left: `calc(${currentSliderPct}% - 7px)`,
              }}
            />
          </div>
        </div>

        {validation.error && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-danger/10 border border-danger/30 text-danger text-[11px] font-medium animate-fade-in">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0"
            >
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span>{validation.error}</span>
          </div>
        )}
      </div>

      <div className="space-y-1.5 text-[12px] text-secondary">
        {store.orderType === 'CHASE' && (
          <div className="space-y-1.5 pb-0.5">
            <label className="flex items-center gap-2 cursor-pointer group select-none">
              <input
                type="checkbox"
                checked={store.maxChaseDifferenceEnabled}
                onChange={e => store.setMaxChaseDifferenceEnabled(e.target.checked)}
                className="rounded border-color bg-tertiary text-brand focus:ring-0 cursor-pointer"
              />
              <span className="group-hover:text-primary transition-colors text-[12px]">
                Max chase difference
              </span>
            </label>

            {store.maxChaseDifferenceEnabled && (
              <div className="pl-4">
                <OrderInput
                  label="Max difference"
                  value={store.maxChaseOffset}
                  onChange={store.setMaxChaseOffset}
                  currency={quoteAsset}
                  placeholder="0.00"
                />
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer group select-none">
            <input
              type="checkbox"
              checked={store.attachedTpEnabled || store.attachedSlEnabled}
              onChange={e => {
                store.setAttachedTpEnabled(e.target.checked);
                store.setAttachedSlEnabled(e.target.checked);
              }}
              className="rounded border-color bg-tertiary text-brand focus:ring-0 cursor-pointer"
            />
            <span className="group-hover:text-primary transition-colors text-[12px]">TP/SL</span>
          </label>
        </div>

        {(store.attachedTpEnabled || store.attachedSlEnabled) && (
          <div className="pl-4 space-y-2 border-l border-color my-1">
            <div className="space-y-1">
              <div className="flex justify-between items-center text-[11px]">
                <span>Take Profit</span>
                <select
                  value={store.attachedTpTrigger}
                  onChange={e => store.setAttachedTpTrigger(e.target.value as WorkingType)}
                  className="bg-transparent text-primary text-[11px] outline-none cursor-pointer"
                >
                  <option value="MARK_PRICE" className="bg-secondary">
                    Mark
                  </option>
                  <option value="CONTRACT_PRICE" className="bg-secondary">
                    Last
                  </option>
                </select>
              </div>
              <OrderInput
                label="TP"
                value={store.attachedTpPrice}
                onChange={store.setAttachedTpPrice}
                currency={quoteAsset}
                placeholder="0.00"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between items-center text-[11px]">
                <span>Stop Loss</span>
                <select
                  value={store.attachedSlTrigger}
                  onChange={e => store.setAttachedSlTrigger(e.target.value as WorkingType)}
                  className="bg-transparent text-primary text-[11px] outline-none cursor-pointer"
                >
                  <option value="MARK_PRICE" className="bg-secondary">
                    Mark
                  </option>
                  <option value="CONTRACT_PRICE" className="bg-secondary">
                    Last
                  </option>
                </select>
              </div>
              <OrderInput
                label="SL"
                value={store.attachedSlPrice}
                onChange={store.setAttachedSlPrice}
                currency={quoteAsset}
                placeholder="0.00"
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer group select-none">
            <input
              type="checkbox"
              checked={store.isReduceOnly}
              onChange={e => store.setReduceOnly(e.target.checked)}
              className="rounded border-color bg-tertiary text-brand focus:ring-0 cursor-pointer"
            />
            <span className="group-hover:text-primary transition-colors text-[12px]">
              Reduce-Only
            </span>
          </label>

          {isPriceOrder && store.orderType !== 'POST_ONLY' && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsTifOpen(!isTifOpen)}
                className="flex items-center gap-1 text-[11px] text-secondary hover:text-primary transition-colors"
              >
                <span>{store.timeInForce}</span>
                <ChevronDown size={11} />
              </button>

              {isTifOpen && (
                <div className="absolute right-0 bottom-full mb-1 w-32 bg-secondary border border-color rounded shadow-2xl overflow-hidden z-50 py-1">
                  {TIF_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        store.setTimeInForce(opt.value);
                        setIsTifOpen(false);
                      }}
                      className={`block w-full text-left px-3 py-1.5 text-[11px] hover:bg-hover transition-colors ${
                        store.timeInForce === opt.value
                          ? 'text-brand font-semibold'
                          : 'text-primary'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <OrderActionButton
        onSubmit={handleSubmit}
        isLoading={isLoading}
        isValid={validation.isValid}
        validationError={validation.error}
        onOpenDepositModal={onOpenDepositModal}
        walletBalance={calcWalletBalance}
        actionSubtext={actionSubtext}
      />

      {/* Margin & Max Summary (Clean and compact like Aster) */}
      <div className="space-y-1 text-[11px] pt-1 text-secondary">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-1.5">
            <span>Margin</span>
            <span className="text-primary font-medium">
              {orderCost > 0 ? orderCost.toFixed(2) : '0.00'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span>Margin</span>
            <span className="text-primary font-medium">
              {orderCost > 0 ? orderCost.toFixed(2) : '0.00'}
            </span>
          </div>
        </div>

        <div className="flex justify-between items-center">
          <div className="flex items-center gap-1.5">
            <span>Max</span>
            <span className="text-primary font-medium">
              {maxPossibleSize > 0
                ? `${maxPossibleSize.toFixed(store.sizeAsset === 'quote' ? 2 : baseDecimals)} ${currentCurrency}`
                : `0.00 ${quoteAsset}`}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span>Max</span>
            <span className="text-primary font-medium">
              {maxPossibleSize > 0
                ? `${maxPossibleSize.toFixed(store.sizeAsset === 'quote' ? 2 : baseDecimals)} ${currentCurrency}`
                : `0.00 ${quoteAsset}`}
            </span>
          </div>
        </div>

        <div className="flex justify-between items-center pt-0.5">
          <div className="flex items-center gap-1.5">
            <span>Liq.Price (Long)</span>
            <span className="text-success font-medium">
              {estimatedIsolatedLiqPrice.long && estimatedIsolatedLiqPrice.long > 0
                ? `$${estimatedIsolatedLiqPrice.long.toFixed(2)}`
                : '--'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span>Liq.Price (Short)</span>
            <span className="text-danger font-medium">
              {estimatedIsolatedLiqPrice.short && estimatedIsolatedLiqPrice.short > 0
                ? `$${estimatedIsolatedLiqPrice.short.toFixed(2)}`
                : '--'}
            </span>
          </div>
        </div>
      </div>
      <InfoBanner
        variant="warning"
        label="Beta:"
        message={"This feature is currently in Beta. We're actively testing and improving it."}
        margin="mx-0 mt-0 mb-2"
      />
      <AssetModeModal
        isOpen={isAssetModeModalOpen}
        onClose={() => setIsAssetModeModalOpen(false)}
      />
    </div>
  );
};
