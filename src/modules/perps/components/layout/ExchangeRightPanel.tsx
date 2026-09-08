import { HelpCircle, Sparkles } from 'lucide-react';
import React, { useState } from 'react';

import { useNotificationStore } from '../../../../store/notificationStore';
import { useAsterAgent } from '../../adapters/aster/hooks/useAsterAgent';
import { useAsterDataSync } from '../../adapters/aster/hooks/useAsterDataSync';
import { useOrders } from '../../adapters/aster/hooks/useOrders';
import { useHyperliquidAgent } from '../../adapters/hyperliquid/hooks/useHyperliquidAgent';
import { useHyperliquidDataStream } from '../../adapters/hyperliquid/hooks/useHyperliquidDataStream';
import { useExchangeManager } from '../../core/ExchangeManager';
import { useAccountStore } from '../../core/stores/accountStore';
import { useMarketStore } from '../../core/stores/marketStore';
import { usePositionStore } from '../../core/stores/positionStore';
import { useTickerStore } from '../../core/stores/tickerStore';
import { useTradeCalculations } from '../../hooks/useTradeCalculations';
import { useUnifiedExecution } from '../../services/useUnifiedExecution';
import { AccountModal } from '../trade/AccountModal';
import { AssetModeModal } from '../trade/AssetModeModal';
import { LeverageModal } from '../trade/LeverageModal';
import { MarginModeModal } from '../trade/MarginModeModal';
import { OrderForm } from '../trade/OrderForm';

const useLiveTotalPnl = (positions: Record<string, any>) => {
  const assetCtxByMarket = useTickerStore(state => state.assetCtxByMarket);

  return Object.values(positions).reduce((acc, p) => {
    const isLong = parseFloat(p.size) > 0;
    const markPrice = assetCtxByMarket[p.symbol]?.markPx || p.markPrice || '0';
    const entryVal = parseFloat(p.entryPrice);
    const markVal = parseFloat(markPrice);
    const absSize = Math.abs(parseFloat(p.size));
    const pnlVal = isLong ? (markVal - entryVal) * absSize : (entryVal - markVal) * absSize;
    return acc + pnlVal;
  }, 0);
};

const useTotalWalletBalance = (balances: Record<string, any>) => {
  const assetCtxByMarket = useTickerStore(state => state.assetCtxByMarket);

  return Object.values(balances).reduce((acc, b) => {
    if (b.usdValue && !isNaN(parseFloat(b.usdValue))) {
      return acc + parseFloat(b.usdValue);
    }
    let price = 1;
    if (b.asset !== 'USDT' && b.asset !== 'USDC') {
      const symbol = `${b.asset}USDT`;
      const markPrice =
        assetCtxByMarket[symbol]?.markPx || assetCtxByMarket[`${b.asset}-USDT`]?.markPx;
      if (markPrice) {
        price = parseFloat(markPrice);
      } else if (b.asset === 'ASTER') {
        price = 0.7483;
      } else {
        price = 0;
      }
    }
    return acc + parseFloat(b.total) * price;
  }, 0);
};

export const ExchangeOrderFormPanel: React.FC = () => {
  const asterAgent = useAsterAgent();
  const hyperliquidAgent = useHyperliquidAgent();
  const currentExchange = useExchangeManager(s => s.currentExchange);
  const activeAgent = currentExchange === 'hyperliquid' ? hyperliquidAgent : asterAgent;
  const { userAddr } = activeAgent;
  const market = useMarketStore(state => state.markets[state.selectedSymbol]);

  useAsterDataSync(asterAgent.asterSigner, asterAgent.userAddr);
  useHyperliquidDataStream(hyperliquidAgent.userAddr);

  const { executeOrder } = useUnifiedExecution();
  const { placeChase, placeBatch } = useOrders(asterAgent.asterSigner, userAddr);
  const selectedSymbol = useMarketStore(state => state.selectedSymbol);
  const assetCtx = useTickerStore(state => state.assetCtxByMarket[selectedSymbol]);
  const currentMarketPrice = parseFloat(assetCtx?.midPx || assetCtx?.markPx || '0') || 0;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeModal, setActiveModal] = useState<
    'margin' | 'leverage' | 'account' | 'assetMode' | null
  >(null);
  const [accountModalTab, setAccountModalTab] = useState<
    'deposit' | 'withdraw' | 'transfer' | 'history'
  >('deposit');

  const handlePlaceOrder = async (payload: any) => {
    if (!activeAgent.isReady || !userAddr) return;

    setIsSubmitting(true);
    try {
      let tif = payload.timeInForce;
      if (payload.isPostOnly) {
        tif = 'GTX';
      }

      const formatPrecision = (
        val: string | number | undefined,
        step: number | undefined
      ): string | undefined => {
        if (val === undefined || val === null || val === '') return undefined;
        if (!step) return String(val);
        const num = typeof val === 'string' ? parseFloat(val) : val;
        if (isNaN(num)) return String(val);

        // Compute decimals from step, e.g. 0.001 -> 3
        const decimals = Math.max(0, -Math.floor(Math.log10(step)));

        // Truncate (floor) instead of round
        const factor = Math.pow(10, decimals);
        const truncated = Math.floor(num * factor) / factor;

        return truncated.toFixed(decimals);
      };

      // Handle both hyphenated and unhyphenated symbol lookups for Aster/HL compatibility
      const currentMarket =
        market ||
        useMarketStore.getState().markets[payload.symbol] ||
        useMarketStore.getState().markets[payload.symbol.replace(/([A-Z]+)USD(T?)/, '$1-USD$2')];

      let finalSize = payload.size;
      if (payload.sizeAsset === 'quote') {
        let conversionPrice = 1;
        if (
          (payload.type === 'LIMIT' || payload.type === 'STOP' || payload.type === 'TAKE_PROFIT') &&
          payload.price
        ) {
          conversionPrice = parseFloat(payload.price);
        } else {
          const assetCtx = useTickerStore.getState().getAssetCtx(payload.symbol);
          conversionPrice = parseFloat(assetCtx?.markPx || '1');
        }

        if (!isNaN(conversionPrice) && conversionPrice > 0) {
          finalSize = String(parseFloat(payload.size) / conversionPrice);
        }
      }

      const formattedQty = formatPrecision(finalSize, currentMarket?.stepSize);
      const formattedPrice = formatPrecision(payload.price, currentMarket?.tickSize);
      const formattedStopPrice = formatPrecision(payload.stopPrice, currentMarket?.tickSize);
      const formattedActivation = formatPrecision(payload.activationPrice, currentMarket?.tickSize);

      if (payload.type === 'SCALED') {
        const pLower = parseFloat(payload.scaledPriceLower || '0');
        const pUpper = parseFloat(payload.scaledPriceUpper || '0');
        const n = parseInt(payload.scaledOrderCount || '5', 10);
        const dist = payload.scaledDistribution || 'FLAT';
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
              symbol: payload.symbol.replace('-', ''),
              side: payload.side,
              type: 'LIMIT',
              quantity: fSize,
              price: fPrice,
              timeInForce: 'GTC',
              reduceOnly: payload.isReduceOnly,
            });
          }
        }

        if (scaledOrders.length === 0)
          throw new Error('Calculated sizes are too small for market step size');

        await placeBatch(scaledOrders);
      } else if (payload.type === 'CHASE') {
        const formattedChaseOffset =
          formatPrecision(payload.chaseOffset || '0', currentMarket?.tickSize) || '0';
        const formattedMaxChaseOffset =
          formatPrecision(payload.maxChaseOffset || '10', currentMarket?.tickSize) || '10';

        await placeChase({
          symbol: payload.symbol.replace('-', ''),
          side: payload.side,
          quantity: formattedQty || payload.size,
          quantityUnit: 'BASE',
          reduceOnly: payload.isReduceOnly,
          chaseOffset: formattedChaseOffset,
          maxChaseOffset: formattedMaxChaseOffset,
        });
      } else {
        const isMarket = payload.type === 'MARKET';
        await executeOrder({
          symbol: payload.symbol,
          side: payload.side,
          type: payload.type,
          price: !isMarket ? formattedPrice || '0' : '0',
          size: formattedQty || payload.size,
          reduceOnly: payload.isReduceOnly,
          timeInForce: !isMarket ? (payload.isPostOnly ? 'GTX' : tif) : undefined,
          stopPrice: !isMarket ? formattedStopPrice || formattedActivation : undefined,
          currentPrice: currentMarketPrice,
        });

        // If attached TP was configured, place TAKE_PROFIT_MARKET order
        if (
          payload.attachedTpEnabled &&
          payload.attachedTpPrice &&
          parseFloat(payload.attachedTpPrice) > 0
        ) {
          const oppositeSide: 'BUY' | 'SELL' = payload.side === 'BUY' ? 'SELL' : 'BUY';
          const formattedTp =
            formatPrecision(payload.attachedTpPrice, currentMarket?.tickSize) ||
            payload.attachedTpPrice;
          try {
            await executeOrder({
              symbol: payload.symbol,
              side: oppositeSide,
              type: 'TAKE_PROFIT_MARKET',
              price: '0',
              size: formattedQty || payload.size,
              reduceOnly: true,
              stopPrice: formattedTp,
              currentPrice: currentMarketPrice,
            });
          } catch (tpErr: any) {
            console.warn('Attached Take Profit order notice:', tpErr);
          }
        }

        // If attached SL was configured, place STOP_MARKET order
        if (
          payload.attachedSlEnabled &&
          payload.attachedSlPrice &&
          parseFloat(payload.attachedSlPrice) > 0
        ) {
          const oppositeSide: 'BUY' | 'SELL' = payload.side === 'BUY' ? 'SELL' : 'BUY';
          const formattedSl =
            formatPrecision(payload.attachedSlPrice, currentMarket?.tickSize) ||
            payload.attachedSlPrice;
          try {
            await executeOrder({
              symbol: payload.symbol,
              side: oppositeSide,
              type: 'STOP_MARKET',
              price: '0',
              size: formattedQty || payload.size,
              reduceOnly: true,
              stopPrice: formattedSl,
              currentPrice: currentMarketPrice,
            });
          } catch (slErr: any) {
            console.warn('Attached Stop Loss order notice:', slErr);
          }
        }
      }

      useNotificationStore.getState().showToast({
        type: 'DYDX',
        title: 'Order Placed',
        status: 'success',
        message: `${payload.side} ${payload.type} ${formattedQty || payload.size} ${
          payload.symbol.split('-')[0]
        } placed successfully.`,
      });
    } catch (err: any) {
      console.error('Failed to place order:', err);
      let errorMsg = err?.userMessage || err?.message || 'Failed to place order';

      // Fallback JSON parse just in case
      try {
        if (typeof errorMsg === 'string' && errorMsg.includes('{')) {
          const jsonMatch = errorMsg.match(/\{.*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.msg) errorMsg = parsed.msg;
          }
        }
      } catch {
        /* ignore */
      }

      useNotificationStore.getState().showToast({
        type: 'DYDX',
        title: 'Order Failed',
        status: 'error',
        message: errorMsg,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-secondary border border-color rounded-lg h-full min-h-0 flex flex-col overflow-hidden relative">
      <OrderForm
        onSubmitOrder={handlePlaceOrder}
        isLoading={isSubmitting}
        onOpenMarginModal={() => setActiveModal('margin')}
        onOpenLeverageModal={() => setActiveModal('leverage')}
        onOpenDepositModal={() => {
          setAccountModalTab('deposit');
          setActiveModal('account');
        }}
      />

      <AssetModeModal isOpen={activeModal === 'assetMode'} onClose={() => setActiveModal(null)} />
      <MarginModeModal isOpen={activeModal === 'margin'} onClose={() => setActiveModal(null)} />
      <LeverageModal isOpen={activeModal === 'leverage'} onClose={() => setActiveModal(null)} />
      <AccountModal
        isOpen={activeModal === 'account'}
        onClose={() => setActiveModal(null)}
        initialTab={accountModalTab}
      />
    </div>
  );
};

export const ExchangeAccountPanel: React.FC = () => {
  const asterAgent = useAsterAgent();
  const hyperliquidAgent = useHyperliquidAgent();
  const currentExchange = useExchangeManager(s => s.currentExchange);
  const currentNetwork = useExchangeManager(s => s.currentNetwork);
  const activeAgent = currentExchange === 'hyperliquid' ? hyperliquidAgent : asterAgent;
  const isAgentReady = activeAgent.isReady;
  const isLoadingBalance = useAccountStore(state => state.isLoading);
  const market = useMarketStore(state => state.markets[state.selectedSymbol]);

  const [activeModal, setActiveModal] = useState<
    'margin' | 'leverage' | 'account' | 'assetMode' | null
  >(null);
  const [accountModalTab, setAccountModalTab] = useState<
    'deposit' | 'withdraw' | 'transfer' | 'history' | 'faucet'
  >('deposit');

  const handleOpenAccount = (tab: 'deposit' | 'withdraw' | 'transfer' | 'history' | 'faucet') => {
    setAccountModalTab(tab);
    setActiveModal('account');
  };

  const { totalMaintenanceMargin, crossMarginRatio } = useTradeCalculations(
    market?.symbol || 'BTCUSDT',
    '0',
    'quote',
    1,
    'cross'
  );

  const balances = useAccountStore(state => state.balances);
  const multiAssetsMargin = useAccountStore(state => state.multiAssetsMargin);
  const storeMarginBalance = useAccountStore(state => state.totalMarginBalance);
  const positions = usePositionStore(state => state.positions);
  const totalPnl = useLiveTotalPnl(positions);
  const calculatedWalletBalance = useTotalWalletBalance(balances);

  const isAster = currentExchange === 'aster';

  // Perp Total Value is the total USD valuation of all assets in the perpetual account
  const perpTotalValue = calculatedWalletBalance;
  const perpCurrency = isAster ? 'USD' : 'USDC';

  // Margin Equity:
  // In Multi-Asset Mode on Aster: storeMarginBalance (multi-asset collateral equity in USD)
  // In Single-Asset Mode on Aster: settlement asset balance (USDT) + totalPnl in USDT
  // On Hyperliquid: (USDC balance + totalPnl) in USDC
  const marginEquity = isAster
    ? multiAssetsMargin && storeMarginBalance && parseFloat(storeMarginBalance) > 0
      ? parseFloat(storeMarginBalance)
      : parseFloat(balances['USDT']?.total || balances['USDT']?.marginBalance || '0') + totalPnl
    : parseFloat(balances['USDC']?.total || balances['USD']?.total || '0') + totalPnl;

  const marginCurrency = isAster ? (multiAssetsMargin ? 'USD' : 'USDT') : 'USDC';

  return (
    <div className="bg-secondary border border-color rounded-lg p-3 space-y-2.5 h-full min-h-0 overflow-y-auto scrollbar-thin flex flex-col justify-between">
      <div className="space-y-2.5">
        {/* Action Buttons */}
        {currentNetwork === 'testnet' && isAster ? (
          <button
            type="button"
            onClick={() => handleOpenAccount('faucet')}
            className="w-full bg-gradient-to-r from-amber-500/20 to-brand/20 hover:from-amber-500/30 hover:to-brand/30 text-amber-300 border border-amber-500/40 py-2 rounded-md text-[12px] font-semibold transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm"
          >
            <Sparkles size={14} className="text-amber-400" />
            Claim Aster Faucet
          </button>
        ) : (
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => handleOpenAccount('deposit')}
              className="flex-1 bg-brand hover:bg-brand-hover text-white py-1.5 rounded-md text-[11px] font-semibold transition-colors cursor-pointer text-center"
            >
              Deposit
            </button>
            <button
              type="button"
              onClick={() => handleOpenAccount('withdraw')}
              className="flex-1 bg-tertiary hover:bg-hover text-secondary hover:text-primary py-1.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer text-center"
            >
              Withdraw
            </button>
            <button
              type="button"
              onClick={() => handleOpenAccount('transfer')}
              className="flex-1 bg-tertiary hover:bg-hover text-secondary hover:text-primary py-1.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer text-center"
            >
              Transfer
            </button>
            <button
              type="button"
              onClick={() => handleOpenAccount('history')}
              className="flex-1 bg-tertiary hover:bg-hover text-secondary hover:text-primary py-1.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer text-center"
            >
              History
            </button>
          </div>
        )}

        {/* Account Equity Section */}
        <div className="space-y-1">
          <h4 className="text-[11px] font-medium text-primary mb-0.5">Account Equity</h4>
          <div className="flex justify-between items-center text-[11px] text-secondary">
            <span>Spot Total Value</span>
            {isLoadingBalance ? (
              <div className="h-3 w-16 bg-gradient-to-r from-tertiary via-hover to-tertiary bg-[length:200%_100%] animate-pulse rounded" />
            ) : (
              <span className="text-primary font-medium">
                {isAgentReady ? `0.00 ${perpCurrency}` : '--'}
              </span>
            )}
          </div>
          <div className="flex justify-between items-center text-[11px] text-secondary">
            <span>Perp Total Value</span>
            {isLoadingBalance ? (
              <div className="h-3 w-16 bg-gradient-to-r from-tertiary via-hover to-tertiary bg-[length:200%_100%] animate-pulse rounded" />
            ) : (
              <span className="text-primary font-medium">
                {isAgentReady ? `${perpTotalValue.toFixed(2)} ${perpCurrency}` : '--'}
              </span>
            )}
          </div>
          <div className="flex justify-between items-center text-[11px] text-secondary">
            <span>Perpetuals Unrealized Pnl</span>
            {isLoadingBalance ? (
              <div className="h-3 w-16 bg-gradient-to-r from-tertiary via-hover to-tertiary bg-[length:200%_100%] animate-pulse rounded" />
            ) : (
              <span
                className={`font-medium ${
                  !isAgentReady
                    ? 'text-primary'
                    : totalPnl > 0
                      ? 'text-success'
                      : totalPnl < 0
                        ? 'text-danger'
                        : 'text-primary'
                }`}
              >
                {!isAgentReady
                  ? '--'
                  : `${totalPnl > 0 ? '+' : ''}${totalPnl.toFixed(2)} ${perpCurrency}`}
              </span>
            )}
          </div>
        </div>

        {/* Margin Section */}
        <div className="space-y-1">
          <h4 className="text-[11px] font-medium text-primary mb-0.5">Margin</h4>
          <div className="flex justify-between items-center text-[11px] text-secondary">
            <span>Account Margin Ratio</span>
            <div className="flex items-center gap-1">
              {isAgentReady && !isLoadingBalance && (
                <div
                  className={`w-2 h-2 rounded-full ${
                    crossMarginRatio > 80
                      ? 'bg-danger'
                      : crossMarginRatio > 50
                        ? 'bg-warning'
                        : 'bg-success'
                  }`}
                />
              )}
              {isLoadingBalance ? (
                <div className="h-3 w-10 bg-gradient-to-r from-tertiary via-hover to-tertiary bg-[length:200%_100%] animate-pulse rounded" />
              ) : (
                <span
                  className={`font-medium ${
                    !isAgentReady
                      ? 'text-primary'
                      : crossMarginRatio > 80
                        ? 'text-danger'
                        : crossMarginRatio > 50
                          ? 'text-warning'
                          : 'text-success'
                  }`}
                >
                  {isAgentReady ? `${crossMarginRatio.toFixed(2)}%` : '--'}
                </span>
              )}
            </div>
          </div>
          <div className="flex justify-between items-center text-[11px] text-secondary">
            <span>Account Maintenance Margin</span>
            {isLoadingBalance ? (
              <div className="h-3 w-16 bg-gradient-to-r from-tertiary via-hover to-tertiary bg-[length:200%_100%] animate-pulse rounded" />
            ) : (
              <span className="text-primary font-medium">
                {isAgentReady ? `${totalMaintenanceMargin.toFixed(2)} ${marginCurrency}` : '--'}
              </span>
            )}
          </div>
          <div className="flex justify-between items-center text-[11px] text-secondary">
            <span className="flex items-center gap-1">
              Account Equity <HelpCircle size={10} className="text-secondary" />
            </span>
            {isLoadingBalance ? (
              <div className="h-3 w-16 bg-gradient-to-r from-tertiary via-hover to-tertiary bg-[length:200%_100%] animate-pulse rounded" />
            ) : (
              <span className="text-primary font-medium">
                {isAgentReady ? `${marginEquity.toFixed(2)} ${marginCurrency}` : '--'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Asset Mode status button - Aster DEX only (Hyperliquid is USDC-only collateral) */}
      {isAster && (
        <button
          type="button"
          onClick={() => setActiveModal('assetMode')}
          className="w-full py-2 px-3 text-[11px] flex items-center justify-between text-secondary bg-tertiary rounded-md hover:text-primary hover:bg-hover transition-colors cursor-pointer mt-1 border border-color shadow-2xs"
        >
          <div className="flex items-center gap-2">
            <span className="font-semibold text-primary">
              {multiAssetsMargin ? 'Multi-Asset Mode' : 'Single-Asset Mode'}
            </span>
          </div>
          <span className="text-[10px] text-muted hover:text-primary transition-colors">
            Switch Mode
          </span>
        </button>
      )}

      <AssetModeModal isOpen={activeModal === 'assetMode'} onClose={() => setActiveModal(null)} />
      <AccountModal
        isOpen={activeModal === 'account'}
        onClose={() => setActiveModal(null)}
        initialTab={accountModalTab}
      />
    </div>
  );
};

export const ExchangeRightPanel: React.FC = () => {
  return (
    <div className="w-full shrink-0 flex flex-col gap-1 overflow-y-auto scrollbar-thin h-full">
      <div className="shrink-0">
        <ExchangeOrderFormPanel />
      </div>
      <div className="shrink-0">
        <ExchangeAccountPanel />
      </div>
    </div>
  );
};
