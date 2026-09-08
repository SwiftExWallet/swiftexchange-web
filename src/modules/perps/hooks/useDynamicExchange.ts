import { useEffect, useRef, useState } from 'react';

import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { getBrackets } from '../adapters/aster/api/funding';
import { AsterClient } from '../adapters/aster/client';
import { HyperliquidClient } from '../adapters/hyperliquid';
import { useExchangeManager } from '../core/ExchangeManager';
import type { PerpExchange } from '../core/interfaces/exchange';
import { useLeverageStore } from '../core/stores/leverageStore';
import { marketStore, useMarketStore } from '../core/stores/marketStore';
import { resetPerpStores } from '../core/stores/resetPerpStores';

export function useDynamicExchange() {
  const currentExchange = useExchangeManager(state => state.currentExchange);
  const currentNetwork = useExchangeManager(state => state.currentNetwork);
  const setNetwork = useExchangeManager(state => state.setNetwork);
  const globalAppNetwork = useWalletStore(state => state.network);
  const clientRef = useRef<PerpExchange | null>(null);
  const [activeClient, setActiveClient] = useState<PerpExchange | null>(null);

  // Enforce perps network to strictly mirror global application network
  useEffect(() => {
    if (globalAppNetwork && currentNetwork !== globalAppNetwork) {
      setNetwork(globalAppNetwork);
    }
  }, [globalAppNetwork, currentNetwork, setNetwork]);

  // Re-initialize the exchange client whenever the selected exchange or network changes
  useEffect(() => {
    // Cancellation flag guards against race conditions when the exchange changes
    // before a pending async getMarkets() call completes.
    let cancelled = false;

    const init = async () => {
      const exchangeLabel = currentExchange === 'hyperliquid' ? 'Hyperliquid' : 'Aster V3';
      const networkLabel = currentNetwork === 'testnet' ? 'Testnet' : 'Mainnet';
      useExchangeManager
        .getState()
        .setIsSwitching(true, `Connecting to ${exchangeLabel} (${networkLabel})...`);

      // 1. Immediately wipe store states to prevent stale cross-exchange data contamination
      resetPerpStores();

      if (clientRef.current) {
        await clientRef.current.disconnect();
        clientRef.current = null;
        setActiveClient(null);
      }

      const client: PerpExchange =
        currentExchange === 'aster'
          ? new AsterClient(currentNetwork)
          : new HyperliquidClient(currentNetwork);

      clientRef.current = client;
      await client.connect();

      if (cancelled) {
        useExchangeManager.getState().setIsSwitching(false);
        return;
      }

      const markets = await client.getMarkets();
      if (cancelled) {
        useExchangeManager.getState().setIsSwitching(false);
        return;
      }

      marketStore.setMarkets(markets);

      if (currentExchange === 'aster') {
        getBrackets()
          .then(bracketsData => {
            if (cancelled) return;
            const bracketsMap: Record<string, any[]> = {};
            bracketsData.forEach((lb: any) => {
              bracketsMap[lb.symbol] = (lb.riskBrackets || []).map((rb: any) => ({
                bracket: rb.bracketSeq,
                initialLeverage: rb.maxOpenPosLeverage,
                notionalCap: rb.bracketNotionalCap,
                notionalFloor: rb.bracketNotionalFloor,
                maintMarginRatio: rb.bracketMaintenanceMarginRate,
                cum: rb.cumFastMaintenanceAmount,
              }));
            });
            useLeverageStore.getState().setAllBrackets(bracketsMap);
          })
          .catch(err => console.error('[useDynamicExchange] getBrackets failed:', err));
      } else {
        // Hyperliquid risk brackets derived from market metadata
        const bracketsMap: Record<string, any[]> = {};
        markets.forEach(m => {
          const maxLev = m.maxLeverage || 20;
          const mmr = Number((1 / (maxLev * 2)).toFixed(4));
          const bracketList = [
            {
              bracket: 1,
              initialLeverage: maxLev,
              notionalCap: 1000000,
              notionalFloor: 0,
              maintMarginRatio: mmr,
              cum: 0,
            },
          ];
          bracketsMap[m.symbol] = bracketList;
          bracketsMap[m.symbol.replace('-', '')] = bracketList;
          bracketsMap[m.baseAsset] = bracketList;
        });
        useLeverageStore.getState().setAllBrackets(bracketsMap);
      }

      if (markets.length === 0) {
        useExchangeManager.getState().setIsSwitching(false);
        return;
      }

      // Determine best symbol after exchange switch:
      // 1. Keep current if it exists on the new exchange.
      // 2. Match by base asset (e.g. ETH-USDC → ETH-USDT).
      // 3. Fall back to first available market.
      const currentSym = marketStore.getSelectedSymbol();
      const symbolSet = new Set(markets.map(m => m.symbol));

      let nextSymbol = currentSym;
      if (!symbolSet.has(currentSym)) {
        const base = currentSym.split('-')[0];
        const match = markets.find(m => m.symbol.startsWith(base + '-'));
        nextSymbol = match ? match.symbol : markets[0].symbol;
      }

      // setSelectedSymbol is a no-op if symbol hasn't changed, avoiding a
      // redundant Zustand update + subscription trigger
      marketStore.setSelectedSymbol(nextSymbol);
      subscribeToSymbol(client, nextSymbol);

      if (!cancelled) {
        setActiveClient(client);
        setTimeout(() => {
          if (!cancelled) {
            useExchangeManager.getState().setIsSwitching(false);
          }
        }, 150);
      }
    };

    init().catch(err => {
      if (!cancelled) {
        console.error('[useDynamicExchange] init failed:', err);
        useExchangeManager.getState().setIsSwitching(false);
      }
    });

    return () => {
      cancelled = true;
      clientRef.current?.disconnect();
      clientRef.current = null;
      setActiveClient(null);
      useExchangeManager.getState().setIsSwitching(false);
    };
  }, [currentExchange, currentNetwork]);

  // Re-subscribe to data feeds when the selected symbol changes
  useEffect(() => {
    let prevSymbol = useMarketStore.getState().selectedSymbol;

    const unsubscribe = useMarketStore.subscribe(state => {
      const symbol = state.selectedSymbol;
      const client = clientRef.current;
      if (!client || symbol === prevSymbol) return;

      if (prevSymbol) {
        unsubscribeFromSymbol(client, prevSymbol);
      }

      subscribeToSymbol(client, symbol);
      prevSymbol = symbol;
    });

    return unsubscribe;
  }, []);

  return { client: activeClient };
}

function subscribeToSymbol(client: PerpExchange, symbol: string): void {
  client.subscribeOrderBook(symbol);
  client.subscribeTicker(symbol);
}

function unsubscribeFromSymbol(client: PerpExchange, symbol: string): void {
  client.unsubscribeOrderBook?.(symbol);
  client.unsubscribeTicker?.(symbol);
}
