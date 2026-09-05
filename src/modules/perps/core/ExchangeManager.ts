import { create } from 'zustand';

import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import type { ExchangeName, PerpNetwork } from './config/networks';

export type { PerpNetwork, ExchangeName };

interface ExchangeManagerState {
  currentExchange: ExchangeName;
  currentNetwork: PerpNetwork;
  isSwitching: boolean;
  switchMessage?: string;
  setExchange: (exchange: ExchangeName) => void;
  setNetwork: (network: PerpNetwork) => void;
  setIsSwitching: (isSwitching: boolean, message?: string) => void;
}

const getInitialNetwork = (): PerpNetwork => {
  try {
    const globalNet = useWalletStore.getState()?.network;
    return globalNet === 'testnet' ? 'testnet' : 'mainnet';
  } catch {
    return 'mainnet';
  }
};

export const useExchangeManager = create<ExchangeManagerState>(set => ({
  currentExchange: 'aster',
  currentNetwork: getInitialNetwork(),
  isSwitching: false,
  switchMessage: undefined,
  setExchange: exchange => set({ currentExchange: exchange }),
  setNetwork: network => set({ currentNetwork: network }),
  setIsSwitching: (isSwitching, message) => set({ isSwitching, switchMessage: message }),
}));

// Automatically sync perps network whenever global wallet network changes
useWalletStore.subscribe((state, prevState) => {
  if (state.network && state.network !== prevState?.network) {
    useExchangeManager.getState().setNetwork(state.network);
  }
});

export const exchangeManager = {
  setExchange: (exchange: ExchangeName) => useExchangeManager.getState().setExchange(exchange),
  setNetwork: (network: PerpNetwork) => useExchangeManager.getState().setNetwork(network),
  setIsSwitching: (isSwitching: boolean, message?: string) =>
    useExchangeManager.getState().setIsSwitching(isSwitching, message),
  currentExchange: () => useExchangeManager.getState().currentExchange,
  currentNetwork: () => useExchangeManager.getState().currentNetwork,
  isSwitching: () => useExchangeManager.getState().isSwitching,
  current: () => useExchangeManager.getState().currentExchange,
  subscribe: (listener: (state: ExchangeManagerState, prevState: ExchangeManagerState) => void) =>
    useExchangeManager.subscribe(listener),
};
