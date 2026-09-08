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
import { useOrderStore } from '../core/stores/orderStore';

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
    | 'POST_ONLY';
  price: string | number;
  size: string | number;
  reduceOnly?: boolean;
  timeInForce?: 'GTC' | 'IOC' | 'FOK' | 'GTX' | 'ALO' | 'FrontendMarket';
  stopPrice?: string | number;
  currentPrice?: number;
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

          const rawPrice =
            typeof params.price === 'string' ? parseFloat(params.price) : params.price;
          const cleanPrice = !isNaN(rawPrice) && rawPrice > 0 ? String(rawPrice) : undefined;
          const isMarket = params.type === 'MARKET';
          const isStopMarket =
            params.type === 'STOP_MARKET' || params.type === 'TAKE_PROFIT_MARKET';
          const isPostOnly =
            params.type === 'POST_ONLY' ||
            params.timeInForce === 'ALO' ||
            params.timeInForce === 'GTX';
          const asterType = params.type === 'POST_ONLY' ? 'LIMIT' : params.type;

          const asterRes = await placeAsterOrder(asterSigner, effectiveUserAddr, {
            symbol: params.symbol.replace('-', ''),
            side: params.side,
            type: asterType as any,
            quantity: String(params.size),
            price: !isMarket && !isStopMarket ? cleanPrice : undefined,
            reduceOnly: params.reduceOnly ? true : undefined,
            timeInForce:
              !isMarket && !isStopMarket
                ? isPostOnly
                  ? 'GTX'
                  : (params.timeInForce as any)
                : undefined,
            stopPrice: params.stopPrice && !isMarket ? String(params.stopPrice) : undefined,
          });

          return asterRes;
        } else {
          // Hyperliquid execution
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
            symbol: symbol.replace('-', ''),
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
          await cancelAllAsterOrders(
            asterSigner,
            effectiveUserAddr,
            symbol ? symbol.replace('-', '') : ''
          );
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

      return executeOrder({
        symbol,
        side: oppositeSide,
        type: 'MARKET',
        price: currentPrice || 0,
        size: absSize,
        reduceOnly: true,
        currentPrice,
      });
    },
    [executeOrder]
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
          await changeLeverage(asterSigner, effectiveUserAddr, symbol.replace('-', ''), leverage);
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
            symbol.replace('-', ''),
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
