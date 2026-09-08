import { useCallback, useEffect } from 'react';

import type { Wallet } from 'ethers';
import { create } from 'zustand';

import {
  deriveAsterAgentKey,
  encryptAndStoreAgentKey,
  getStoredAgentAddress,
  hasStoredAgentKey,
  purgeAgentKey,
  restoreAgentWallet,
} from '../../../../walletconnect/services/asterAgentKeyManager';
import { walletService } from '../../../../walletconnect/services/walletService';
import { useWalletStore } from '../../../../walletconnect/store/walletConnectStore';
import { useExchangeManager } from '../../../core/ExchangeManager';

export type DeriveState = 'idle' | 'signing' | 'ready' | 'error';

interface AsterAgentStoreState {
  asterSigner: Wallet | null;
  agentAddress: string | null;
  deriveState: DeriveState;
  error: Error | null;
  isRestoring: boolean;
  setAsterSigner: (signer: Wallet | null, address?: string | null) => void;
  setDeriveState: (state: DeriveState) => void;
  setError: (error: Error | null) => void;
  deriveAgentKey: (userAddr: string) => Promise<{ agentAddress: string; wallet: Wallet }>;
  restoreKey: () => Promise<Wallet | null>;
  purge: () => void;
}

export const useAsterAgentStore = create<AsterAgentStoreState>((set, get) => ({
  asterSigner: null,
  agentAddress: null,
  deriveState: 'idle',
  error: null,
  isRestoring: false,

  setAsterSigner: (signer, address) =>
    set({
      asterSigner: signer,
      agentAddress: address ?? (signer ? signer.address : null),
      deriveState: signer ? 'ready' : 'idle',
    }),

  setDeriveState: deriveState => set({ deriveState }),
  setError: error => set({ error }),

  restoreKey: async () => {
    const network = useWalletStore.getState().network;
    if (!hasStoredAgentKey(network)) {
      set({ asterSigner: null, agentAddress: null, deriveState: 'idle' });
      return null;
    }

    const current = get().asterSigner;
    const currentStoredAddr = getStoredAgentAddress(network);
    if (current && get().agentAddress === currentStoredAddr) return current;

    if (get().isRestoring) return null;

    set({ isRestoring: true });
    try {
      const wallet = await restoreAgentWallet(network);
      if (wallet) {
        set({
          asterSigner: wallet,
          agentAddress: wallet.address,
          deriveState: 'ready',
          isRestoring: false,
          error: null,
        });
        return wallet;
      }
    } catch (e) {
      console.error('[AsterAgentStore] Failed to restore agent wallet:', e);
    }
    set({ isRestoring: false, asterSigner: null, agentAddress: null, deriveState: 'idle' });
    return null;
  },

  deriveAgentKey: async (userAddr: string) => {
    if (!userAddr) throw new Error('EVM wallet not connected');
    if (get().deriveState === 'signing') {
      throw new Error('Derivation request is already in progress. Please check your wallet.');
    }

    set({ deriveState: 'signing', error: null });

    try {
      const provider =
        walletService.getProvider('evm') ||
        (typeof window !== 'undefined' ? (window as any).ethereum : null);
      if (!provider) throw new Error('EVM provider not available');

      const network = useWalletStore.getState().network;
      const result = await deriveAsterAgentKey(userAddr, provider, network);
      await encryptAndStoreAgentKey(result.wallet.privateKey, network);

      set({
        asterSigner: result.wallet,
        agentAddress: result.agentAddress,
        deriveState: 'ready',
        error: null,
      });
      return result;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      set({ error: err, deriveState: 'error' });
      throw err;
    }
  },

  purge: () => {
    const network = useWalletStore.getState().network;
    purgeAgentKey(network);
    set({
      asterSigner: null,
      agentAddress: null,
      deriveState: 'idle',
      error: null,
      isRestoring: false,
    });
  },
}));

export interface UseAsterAgentResult {
  asterSigner: Wallet | null;
  userAddr: string | null;
  agentAddress: string | null;
  deriveState: DeriveState;
  error: Error | null;
  deriveAgentKey: () => Promise<void>;
  purge: () => void;
  isReady: boolean;
}

export function useAsterAgent(): UseAsterAgentResult {
  const currentExchange = useExchangeManager(s => s.currentExchange);
  const evmWallet = useWalletStore(state => state.connectedWallets.evm);
  const userAddr = evmWallet?.address ?? null;
  const network = useWalletStore(state => state.network);

  const asterSigner = useAsterAgentStore(s => s.asterSigner);
  const agentAddress = useAsterAgentStore(s => s.agentAddress);
  const deriveState = useAsterAgentStore(s => s.deriveState);
  const error = useAsterAgentStore(s => s.error);

  const restoreKey = useAsterAgentStore(s => s.restoreKey);
  const deriveAgentKeyStore = useAsterAgentStore(s => s.deriveAgentKey);
  const purgeStore = useAsterAgentStore(s => s.purge);

  useEffect(() => {
    if (userAddr) {
      restoreKey();
    } else {
      if (asterSigner) {
        purgeStore();
      }
    }
  }, [userAddr, network, currentExchange, restoreKey, purgeStore]);

  const deriveAgentKey = useCallback(async () => {
    if (!userAddr) throw new Error('EVM wallet not connected');
    await deriveAgentKeyStore(userAddr);
  }, [userAddr, deriveAgentKeyStore]);

  const isReady = (deriveState === 'ready' || hasStoredAgentKey(network)) && !!asterSigner;

  return {
    asterSigner,
    userAddr,
    agentAddress,
    deriveState,
    error,
    deriveAgentKey,
    purge: purgeStore,
    isReady,
  };
}
