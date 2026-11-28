import { useCallback, useState } from 'react';

import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { changeLeverage, changeMarginType } from '../adapters/aster/api/account';
import {
  cancelAllOpenOrders as cancelAllAsterOrders,
  cancelOrder as cancelAsterOrder,
  placeOrder as placeAsterOrder,
} from '../adapters/aster/api/orders';
import { useAsterAgent } from '../adapters/aster/hooks/useAsterAgent';
import {
  cancelAllHyperliquidOrders,
  cancelHyperliquidOrder,
  placeHyperliquidOrder,
  updateHyperliquidLeverage,
} from '../adapters/hyperliquid/api/orders';
import { useHyperliquidAgentStore } from '../adapters/hyperliquid/hooks/useHyperliquidAgent';
import { useExchangeManager } from '../core/ExchangeManager';
import { useMarketStore } from '../core/stores/marketStore';
import { useOrderStore } from '../core/stores/orderStore';
import { usePositionStore } from '../core/stores/positionStore';
import { formatPriceToTick, formatQuantityToStep, generateClientOrderId } from '../utils/precision';
import { areSymbolsEqual, normalizeSymbol, toAsterSymbol } from '../utils/symbol';

export interface UnifiedOrderParams {
  symbol: string;
  side: 'BUY' | 'SELL';
  type:
    | 'LIMIT'
    | 'MARKET'
    | 'STOP'
    | 'STOP_MARKET'
    | 'TAKE_PROFIT'
    | 'TAKE_PROFIT_MARKET'
    | 'TRAILING_STOP_MARKET'
    | 'POST_ONLY';
  price: string | number;
  size: string | number;
  reduceOnly?: boolean;
  timeInForce?: 'GTC' | 'IOC' | 'FOK' | 'GTX' | 'ALO' | 'FrontendMarket';
  stopPrice?: string | number;
  callbackRate?: string | number;
  activationPrice?: string | number;
  currentPrice?: number;
  workingType?: 'MARK_PRICE' | 'CONTRACT_PRICE';
  closePosition?: boolean;
  attachedTpPrice?: string | number;
  attachedSlPrice?: string | number;
}

export function useUnifiedExecution() {
  const currentExchange = useExchangeManager(s => s.currentExchange);
  const currentNetwork = useExchangeManager(s => s.currentNetwork);
  const walletUserAddr = useWalletStore(s => s.connectedWallets.evm?.address);

  const { asterSigner, userAddr: asterUserAddr } = useAsterAgent();
  const hyperliquidSigner = useHyperliquidAgentStore(s => s.hyperliquidSigner);

  const effectiveUserAddr = asterUserAddr || walletUserAddr || '';

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const isReady =
    currentExchange === 'aster'
      ? Boolean(asterSigner && effectiveUserAddr)
      : Boolean(hyperliquidSigner);

  const executeOrder = useCallback(
    async (params: UnifiedOrderParams) => {
      setLoading(true);
      setError(null);

      try {
        if (currentExchange === 'aster') {
          if (!asterSigner || !effectiveUserAddr) {
            throw new Error('Aster session is not ready. Please connect your wallet.');
          }

          const isMarket = params.type === 'MARKET';
          const isStopMarket =
            params.type === 'STOP_MARKET' || params.type === 'TAKE_PROFIT_MARKET';
          const isTrailingStop = params.type === 'TRAILING_STOP_MARKET';
          const isPostOnly =
            params.type === 'POST_ONLY' ||
            params.timeInForce === 'ALO' ||
            params.timeInForce === 'GTX';
          const asterType = params.type === 'POST_ONLY' ? 'LIMIT' : params.type;

          const allMarkets = Object.values(useMarketStore.getState().markets);
          const market = allMarkets.find(m => areSymbolsEqual(m.symbol, params.symbol));

          const stepSize = market?.stepSize || '0.001';
          const tickSize = market?.tickSize || '0.1';

          const cleanSize = formatQuantityToStep(params.size, stepSize);
          const cleanPrice =
            !isMarket && !isStopMarket && !isTrailingStop && params.price
              ? formatPriceToTick(params.price, tickSize)
              : undefined;

          const clientOrderId = generateClientOrderId();

          const asterRes = await placeAsterOrder(asterSigner, effectiveUserAddr, {
            symbol: toAsterSymbol(params.symbol),
            side: params.side,
            type: asterType as any,
            quantity: cleanSize,
            price: cleanPrice,
            newClientOrderId: clientOrderId,
            reduceOnly: params.reduceOnly ? true : undefined,
            closePosition: params.closePosition ? true : undefined,
            workingType: params.workingType,
            timeInForce:
              !isMarket && !isStopMarket && !isTrailingStop
                ? isPostOnly
                  ? 'GTX'
                  : (params.timeInForce as any) || 'GTC'
                : undefined,
            stopPrice:
              params.stopPrice && !isMarket && !isTrailingStop
                ? formatPriceToTick(params.stopPrice, tickSize)
                : undefined,
            callbackRate: isTrailingStop ? String(params.callbackRate || '1.0') : undefined,
            activationPrice:
              isTrailingStop && params.activationPrice
                ? formatPriceToTick(params.activationPrice, tickSize)
                : undefined,
          });

          // Instantly reflect order in UI without waiting for WebSocket
          if (asterRes && asterRes.orderId) {
            const normSymbol = normalizeSymbol(params.symbol);
            if (asterRes.status === 'NEW' || asterRes.status === 'PARTIALLY_FILLED') {
              useOrderStore.getState().updateOrder({
                id: String(asterRes.orderId),
                symbol: normSymbol,
                type: (asterRes.type || asterType || 'LIMIT').toLowerCase() as any,
                side: (asterRes.side || params.side).toLowerCase() as any,
                price: asterRes.price || cleanPrice || '0',
                size: asterRes.origQty || cleanSize,
                filledSize: asterRes.executedQty || '0',
                status: asterRes.status === 'PARTIALLY_FILLED' ? 'partially_filled' : 'new',
                reduceOnly: asterRes.reduceOnly || Boolean(params.reduceOnly),
                timestamp: asterRes.updateTime || Date.now(),
              });
            }
          }

          return asterRes;
        } else {
          // Hyperliquid execution
          if (params.type === 'TRAILING_STOP_MARKET') {
            throw new Error('Trailing Stop orders are currently supported on Aster DEX.');
          }

          if (!hyperliquidSigner) {
            throw new Error(
              'Hyperliquid agent wallet is not initialized. Please connect your wallet.'
            );
          }

          const isTestnet = currentNetwork === 'testnet';
          const hlRes = await placeHyperliquidOrder(hyperliquidSigner, params, isTestnet);
          return hlRes;
        }
      } catch (err: any) {
        const errObj = err instanceof Error ? err : new Error(String(err));
        setError(errObj);
        throw errObj;
      } finally {
        setLoading(false);
      }
    },
    [currentExchange, currentNetwork, asterSigner, effectiveUserAddr, hyperliquidSigner]
  );

  const cancelSingleOrder = useCallback(
    async (symbol: string, orderId: string) => {
      setLoading(true);
      setError(null);

      try {
        if (currentExchange === 'aster') {
          if (!asterSigner || !effectiveUserAddr) {
            throw new Error('Aster session is not ready.');
          }
          await cancelAsterOrder(asterSigner, effectiveUserAddr, {
            symbol: toAsterSymbol(symbol),
            orderId: parseInt(orderId, 10),
          });
        } else {
          if (!hyperliquidSigner) {
            throw new Error('Hyperliquid agent wallet is not initialized.');
          }
          const isTestnet = currentNetwork === 'testnet';
          await cancelHyperliquidOrder(hyperliquidSigner, symbol, orderId, isTestnet);
        }

        useOrderStore.getState().removeOrder(orderId);
      } catch (err: any) {
        const errObj = err instanceof Error ? err : new Error(String(err));
        setError(errObj);
        throw errObj;
      } finally {
        setLoading(false);
      }
    },
    [currentExchange, currentNetwork, asterSigner, effectiveUserAddr, hyperliquidSigner]
  );

  const cancelAll = useCallback(
    async (symbol?: string) => {
      setLoading(true);
      setError(null);

      try {
        if (currentExchange === 'aster') {
          if (!asterSigner || !effectiveUserAddr) {
            throw new Error('Aster session is not ready.');
          }
          if (symbol) {
            await cancelAllAsterOrders(asterSigner, effectiveUserAddr, toAsterSymbol(symbol));
          } else {
            const openOrders = useOrderStore.getState().getOpenOrders();
            const openSymbols: string[] = Array.from(
              new Set(openOrders.map(o => toAsterSymbol(o.symbol)))
            );
            await Promise.all(
              openSymbols.map(s => cancelAllAsterOrders(asterSigner, effectiveUserAddr, s))
            );
          }
        } else {
          if (!hyperliquidSigner || !effectiveUserAddr) {
            throw new Error('Hyperliquid agent wallet is not initialized.');
          }
          const isTestnet = currentNetwork === 'testnet';
          await cancelAllHyperliquidOrders(hyperliquidSigner, effectiveUserAddr, symbol, isTestnet);
        }
      } catch (err: any) {
        const errObj = err instanceof Error ? err : new Error(String(err));
        setError(errObj);
        throw errObj;
      } finally {
        setLoading(false);
      }
    },
    [currentExchange, currentNetwork, asterSigner, effectiveUserAddr, hyperliquidSigner]
  );

  const closePosition = useCallback(
    async (symbol: string, size: string, isLong: boolean, currentPrice?: number) => {
      const oppositeSide: 'BUY' | 'SELL' = isLong ? 'SELL' : 'BUY';
      const absSize = Math.abs(parseFloat(size));
      if (isNaN(absSize) || absSize <= 0) return;

      let remaining = absSize;
      let lastRes: any = null;

      for (let attempt = 0; attempt < 3 && remaining > 0; attempt++) {
        const res = await executeOrder({
          symbol,
          side: oppositeSide,
          type: 'MARKET',
          price: currentPrice || 0,
          size: remaining,
          reduceOnly: true,
          currentPrice,
        });
        lastRes = res;

        if (currentExchange === 'hyperliquid') {
          const filled = res?.response?.data?.statuses?.[0]?.filled;
          if (filled?.totalSz) {
            const filledAmount = parseFloat(filled.totalSz) || 0;
            remaining = Math.max(0, remaining - filledAmount);
          } else {
            break;
          }
        } else {
          remaining = 0;
          break;
        }
      }

      if (remaining <= 0) {
        usePositionStore.getState().removePosition(symbol);
        usePositionStore.getState().removePosition(toAsterSymbol(symbol));
        usePositionStore.getState().removePosition(normalizeSymbol(symbol));
      }

      return {
        ...lastRes,
        fullyClosed: remaining <= 0,
        remainingSize: remaining,
      };
    },
    [executeOrder, currentExchange]
  );

  const closeAllPositions = useCallback(
    async (positionsList: any[]) => {
      if (!positionsList || positionsList.length === 0) return { closedCount: 0, errors: [] };
      setLoading(true);
      setError(null);
      const errors: string[] = [];
      let closedCount = 0;

      for (const p of positionsList) {
        const isLong = parseFloat(p.size) > 0;
        const absSize = Math.abs(parseFloat(p.size));
        if (isNaN(absSize) || absSize <= 0) continue;
        const oppositeSide: 'BUY' | 'SELL' = isLong ? 'SELL' : 'BUY';

        try {
          await executeOrder({
            symbol: p.symbol,
            side: oppositeSide,
            type: 'MARKET',
            price: 0,
            size: absSize,
            reduceOnly: true,
            currentPrice: parseFloat(p.markPrice || '0') || undefined,
          });
          closedCount++;
        } catch (err: any) {
          console.error(`Failed to close position for ${p.symbol}:`, err);
          errors.push(`${p.symbol}: ${err?.message || 'Failed to close'}`);
        }
      }

      setLoading(false);
      return { closedCount, errors };
    },
    [executeOrder]
  );

  const reversePosition = useCallback(
    async (symbol: string, size: string, isLong: boolean, currentPrice?: number) => {
      const oppositeSide: 'BUY' | 'SELL' = isLong ? 'SELL' : 'BUY';
      const absSize = Math.abs(parseFloat(size));
      if (isNaN(absSize) || absSize <= 0) return;

      // 1. Close current position
      await executeOrder({
        symbol,
        side: oppositeSide,
        type: 'MARKET',
        price: currentPrice || 0,
        size: absSize,
        reduceOnly: true,
        currentPrice,
      });

      // 2. Open new position in opposite direction
      await executeOrder({
        symbol,
        side: oppositeSide,
        type: 'MARKET',
        price: currentPrice || 0,
        size: absSize,
        reduceOnly: false,
        currentPrice,
      });
    },
    [executeOrder]
  );

  const updateLeverageForSymbol = useCallback(
    async (symbol: string, leverage: number, isCross: boolean = true) => {
      setLoading(true);
      setError(null);

      try {
        if (currentExchange === 'aster') {
          if (!asterSigner || !effectiveUserAddr) {
            throw new Error('Aster session is not ready.');
          }
          await changeLeverage(asterSigner, effectiveUserAddr, toAsterSymbol(symbol), leverage);
        } else {
          if (!hyperliquidSigner) {
            throw new Error(
              'Hyperliquid trading session is not active. Please enable 1-Click Trading first.'
            );
          }
          const isTestnet = currentNetwork === 'testnet';
          await updateHyperliquidLeverage(hyperliquidSigner, symbol, leverage, isCross, isTestnet);
        }
      } catch (err: any) {
        const errObj = err instanceof Error ? err : new Error(String(err));
        setError(errObj);
        throw errObj;
      } finally {
        setLoading(false);
      }
    },
    [currentExchange, currentNetwork, asterSigner, effectiveUserAddr, hyperliquidSigner]
  );

  const updateMarginModeForSymbol = useCallback(
    async (symbol: string, marginType: 'cross' | 'isolated', currentLeverage: number = 20) => {
      setLoading(true);
      setError(null);

      try {
        if (currentExchange === 'aster') {
          if (!asterSigner || !effectiveUserAddr) {
            throw new Error('Aster session is not ready. Please connect your wallet and sign in.');
          }
          await changeMarginType(
            asterSigner,
            effectiveUserAddr,
            toAsterSymbol(symbol),
            marginType === 'cross' ? 'CROSSED' : 'ISOLATED'
          );
        } else {
          if (!hyperliquidSigner) {
            throw new Error(
              'Hyperliquid trading session is not active. Please enable 1-Click Trading first.'
            );
          }
          const isTestnet = currentNetwork === 'testnet';
          const isCross = marginType === 'cross';
          await updateHyperliquidLeverage(
            hyperliquidSigner,
            symbol,
            currentLeverage,
            isCross,
            isTestnet
          );
        }
      } catch (err: any) {
        const errObj = err instanceof Error ? err : new Error(String(err));
        setError(errObj);
        throw errObj;
      } finally {
        setLoading(false);
      }
    },
    [currentExchange, currentNetwork, asterSigner, effectiveUserAddr, hyperliquidSigner]
  );

  return {
    isReady,
    loading,
    error,
    executeOrder,
    cancelSingleOrder,
    cancelAll,
    closePosition,
    closeAllPositions,
    reversePosition,
    updateLeverageForSymbol,
    updateMarginModeForSymbol,
  };
}
