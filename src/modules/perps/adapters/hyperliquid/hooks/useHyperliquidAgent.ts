import { useCallback, useEffect, useRef } from 'react';

import type { Wallet } from 'ethers';
import { create } from 'zustand';

import {
  HyperliquidIsolatedSigner,
  deriveHyperliquidAgentKey,
  encryptAndStoreAgentKey,
  getStoredAgentAddress,
  hasStoredAgentKey,
  purgeAgentKey,
  restoreAgentWallet,
} from '../../../../walletconnect/services/hyperliquidAgentKeyManager';
import { walletService } from '../../../../walletconnect/services/walletService';
import { useWalletStore } from '../../../../walletconnect/store/walletConnectStore';
import { useExchangeManager } from '../../../core/ExchangeManager';

export type DeriveState = 'idle' | 'signing' | 'ready' | 'error';

interface HyperliquidAgentStoreState {
  hyperliquidSigner: HyperliquidIsolatedSigner | Wallet | null;
  agentAddress: string | null;
  deriveState: DeriveState;
  error: Error | null;
  isRestoring: boolean;
  setHyperliquidSigner: (
    signer: HyperliquidIsolatedSigner | Wallet | null,
    address?: string | null
  ) => void;
  setDeriveState: (state: DeriveState) => void;
  setError: (error: Error | null) => void;
  deriveAgentKey: (
    userAddr: string
  ) => Promise<{ agentAddress: string; wallet: HyperliquidIsolatedSigner | Wallet }>;
  restoreKey: () => Promise<HyperliquidIsolatedSigner | Wallet | null>;
  purge: () => void;
}

let activeHlRestorePromise: Promise<any> | null = null;
let lastFailedHlRestoreKey = '';
let lastFailedHlRestoreTime = 0;

export const useHyperliquidAgentStore = create<HyperliquidAgentStoreState>((set, get) => ({
  hyperliquidSigner: null,
  agentAddress: null,
  deriveState: 'idle',
  error: null,
  isRestoring: false,

  setHyperliquidSigner: (signer, address) =>
    set({
      hyperliquidSigner: signer,
      agentAddress: address ?? (signer ? signer.address : null),
      deriveState: signer ? 'ready' : 'idle',
    }),

  setDeriveState: deriveState => set({ deriveState }),
  setError: error => set({ error }),

  restoreKey: async () => {
    const isTestnet = useWalletStore.getState().network === 'testnet';
    if (!hasStoredAgentKey(isTestnet)) {
      if (
        get().hyperliquidSigner !== null ||
        get().agentAddress !== null ||
        get().deriveState !== 'idle'
      ) {
        set({ hyperliquidSigner: null, agentAddress: null, deriveState: 'idle' });
      }
      return null;
    }

    const current = get().hyperliquidSigner;
    const currentStoredAddr = getStoredAgentAddress(isTestnet);
    if (
      current &&
      (get().agentAddress || '').toLowerCase() === (currentStoredAddr || '').toLowerCase()
    ) {
      return current;
    }

    const restoreKeyId = `${isTestnet}_${currentStoredAddr}`;
    if (lastFailedHlRestoreKey === restoreKeyId && Date.now() - lastFailedHlRestoreTime < 5000) {
      return null;
    }

    if (activeHlRestorePromise) return activeHlRestorePromise;

    set({ isRestoring: true });
    activeHlRestorePromise = (async () => {
      try {
        const wallet = await restoreAgentWallet(isTestnet);
        if (wallet) {
          lastFailedHlRestoreKey = '';
          set({
            hyperliquidSigner: wallet,
            agentAddress: wallet.address,
            deriveState: 'ready',
            isRestoring: false,
            error: null,
          });
          return wallet;
        }
      } catch (e) {
        console.error('[HyperliquidAgentStore] Failed to restore agent wallet:', e);
      } finally {
        activeHlRestorePromise = null;
      }

      lastFailedHlRestoreKey = restoreKeyId;
      lastFailedHlRestoreTime = Date.now();
      if (
        get().hyperliquidSigner !== null ||
        get().agentAddress !== null ||
        get().deriveState !== 'idle'
      ) {
        set({
          isRestoring: false,
          hyperliquidSigner: null,
          agentAddress: null,
          deriveState: 'idle',
        });
      } else {
        set({ isRestoring: false });
      }
      return null;
    })();

    return activeHlRestorePromise;
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

      const isTestnet = useWalletStore.getState().network === 'testnet';
      const result = await deriveHyperliquidAgentKey(userAddr, provider, isTestnet);
      await encryptAndStoreAgentKey(result.agentAddress, isTestnet);

      set({
        hyperliquidSigner: result.wallet,
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
    const isTestnet = useWalletStore.getState().network === 'testnet';
    purgeAgentKey(isTestnet);
    set({
      hyperliquidSigner: null,
      agentAddress: null,
      deriveState: 'idle',
      error: null,
      isRestoring: false,
    });
  },
}));

export interface UseHyperliquidAgentResult {
  hyperliquidSigner: HyperliquidIsolatedSigner | Wallet | null;
  userAddr: string | null;
  agentAddress: string | null;
  deriveState: DeriveState;
  error: Error | null;
  deriveAgentKey: () => Promise<void>;
  purge: () => void;
  isReady: boolean;
}

export function useHyperliquidAgent(): UseHyperliquidAgentResult {
  const currentExchange = useExchangeManager(s => s.currentExchange);
  const evmWallet = useWalletStore(state => state.connectedWallets.evm);
  const userAddr = evmWallet?.address ?? null;
  const network = useWalletStore(state => state.network);
  const isTestnet = network === 'testnet';

  const hyperliquidSigner = useHyperliquidAgentStore(s => s.hyperliquidSigner);
  const agentAddress = useHyperliquidAgentStore(s => s.agentAddress);
  const deriveState = useHyperliquidAgentStore(s => s.deriveState);
  const error = useHyperliquidAgentStore(s => s.error);

  const restoreKey = useHyperliquidAgentStore(s => s.restoreKey);
  const deriveAgentKeyStore = useHyperliquidAgentStore(s => s.deriveAgentKey);
  const purgeStore = useHyperliquidAgentStore(s => s.purge);

  const lastRestoredKeyRef = useRef<string | null>(null);

  // Stable refs for store actions to avoid adding them to useEffect deps
  const restoreKeyRef = useRef(restoreKey);
  const purgeStoreRef = useRef(purgeStore);
  restoreKeyRef.current = restoreKey;
  purgeStoreRef.current = purgeStore;

  useEffect(() => {
    if (currentExchange !== 'hyperliquid') {
      lastRestoredKeyRef.current = null;
      return;
    }

    const key = `${userAddr}_${network}_${currentExchange}`;
    if (userAddr) {
      if (lastRestoredKeyRef.current !== key) {
        lastRestoredKeyRef.current = key;
        restoreKeyRef.current();
      }
    } else {
      lastRestoredKeyRef.current = null;
      // Read via store snapshot — avoids adding hyperliquidSigner to deps
      if (useHyperliquidAgentStore.getState().hyperliquidSigner) {
        purgeStoreRef.current();
      }
    }
    // hyperliquidSigner intentionally NOT in deps — prevents signer set → re-run loop
  }, [userAddr, network, currentExchange]);

  const deriveAgentKey = useCallback(async () => {
    if (!userAddr) throw new Error('EVM wallet not connected');
    await deriveAgentKeyStore(userAddr);
  }, [userAddr, deriveAgentKeyStore]);

  const isReady = (deriveState === 'ready' || hasStoredAgentKey(isTestnet)) && !!hyperliquidSigner;

  return {
    hyperliquidSigner,
    userAddr,
    agentAddress,
    deriveState,
    error,
    deriveAgentKey,
    purge: purgeStore,
    isReady,
  };
}
