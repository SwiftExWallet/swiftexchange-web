import { useCallback, useEffect, useState } from 'react';

import type { Wallet } from 'ethers';
import { create } from 'zustand';

import { useNotificationStore } from '../../../../../store/notificationStore';
import {
  deriveAsterAgentKey,
  emergencyPurgeLocalAgent,
  getStoredAgentAddress,
  getStoredAgentExpiry,
  hasStoredAgentKey,
  purgeAgentKey,
  restoreAgentWallet,
  revokeAsterAgentKey,
} from '../../../../walletconnect/services/asterAgentKeyManager';
import { signerIframeBridge } from '../../../../walletconnect/services/signerIframeBridge';
import { walletService } from '../../../../walletconnect/services/walletService';
import { useWalletStore } from '../../../../walletconnect/store/walletConnectStore';
import { useExchangeManager } from '../../../core/ExchangeManager';
import type { IAsterSigner } from '../types/signer';

export type DeriveState = 'idle' | 'signing' | 'ready' | 'error';

interface AsterAgentStoreState {
  asterSigner: Wallet | IAsterSigner | null;
  agentAddress: string | null;
  deriveState: DeriveState;
  error: Error | null;
  isRestoring: boolean;
  isRevoking: boolean;
  sessionExpiry: number | null;
  setAsterSigner: (signer: Wallet | IAsterSigner | null, address?: string | null) => void;
  setDeriveState: (state: DeriveState) => void;
  setError: (error: Error | null) => void;
  deriveAgentKey: (userAddr: string) => Promise<{ agentAddress: string }>;
  restoreKey: () => Promise<Wallet | IAsterSigner | null>;
  revokeSession: () => Promise<void>;
  emergencyPurgeSession: () => Promise<void>;
  purge: () => void;
}

export const useAsterAgentStore = create<AsterAgentStoreState>((set, get) => ({
  asterSigner: null,
  agentAddress: null,
  deriveState: 'idle',
  error: null,
  isRestoring: false,
  isRevoking: false,
  sessionExpiry: null,

  setAsterSigner: (signer, address) =>
    set({
      asterSigner: signer,
      agentAddress: address ?? (signer && 'address' in signer ? (signer as any).address : null),
      deriveState: signer ? 'ready' : 'idle',
    }),

  setDeriveState: deriveState => set({ deriveState }),
  setError: error => set({ error }),

  restoreKey: async () => {
    const network = useWalletStore.getState().network;
    if (!hasStoredAgentKey(network)) {
      set({ asterSigner: null, agentAddress: null, deriveState: 'idle', sessionExpiry: null });
      return null;
    }

    const current = get().asterSigner;
    const currentStoredAddr = getStoredAgentAddress(network);
    const storedExpiry = getStoredAgentExpiry(network);

    if (current && get().agentAddress === currentStoredAddr) {
      if (storedExpiry !== get().sessionExpiry) {
        set({ sessionExpiry: storedExpiry });
      }
      return current;
    }

    if (get().isRestoring) return null;

    set({ isRestoring: true });
    try {
      const signer = await restoreAgentWallet(network);
      if (signer) {
        const addr = await signer.getAddress();
        set({
          asterSigner: signer,
          agentAddress: addr,
          sessionExpiry: storedExpiry,
          deriveState: 'ready',
          isRestoring: false,
          error: null,
        });
        return signer;
      }
    } catch (e) {
      console.error('[AsterAgentStore] Failed to restore agent signer:', e);
    }
    set({
      isRestoring: false,
      asterSigner: null,
      agentAddress: null,
      sessionExpiry: null,
      deriveState: 'idle',
    });
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
      const expiryNum = parseInt(result.expired, 10);

      set({
        asterSigner: signerIframeBridge,
        agentAddress: result.agentAddress,
        sessionExpiry: isNaN(expiryNum) ? null : expiryNum,
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

  revokeSession: async () => {
    const userAddr = useWalletStore.getState().connectedWallets.evm?.address;
    if (!userAddr) throw new Error('EVM wallet not connected');
    if (get().isRevoking) return;

    set({ isRevoking: true, error: null });
    try {
      const provider =
        walletService.getProvider('evm') ||
        (typeof window !== 'undefined' ? (window as any).ethereum : null);
      if (!provider) throw new Error('EVM provider not available');

      const network = useWalletStore.getState().network;
      await revokeAsterAgentKey(userAddr, provider, network);
      await signerIframeBridge.revokeKey().catch(() => {});

      set({
        asterSigner: null,
        agentAddress: null,
        sessionExpiry: null,
        deriveState: 'idle',
        isRevoking: false,
        error: null,
      });

      useNotificationStore.getState().showToast({
        type: 'SYSTEM',
        title: 'Session Revoked',
        message: 'Your agent session has been revoked and purged from the secure vault.',
        status: 'success',
      });
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      set({ error: err, isRevoking: false });
      throw err;
    }
  },

  emergencyPurgeSession: async () => {
    const network = useWalletStore.getState().network;
    await emergencyPurgeLocalAgent(network);
    await signerIframeBridge.revokeKey().catch(() => {});
    set({
      asterSigner: null,
      agentAddress: null,
      sessionExpiry: null,
      deriveState: 'idle',
      isRevoking: false,
      error: null,
    });
    useNotificationStore.getState().showToast({
      type: 'SYSTEM',
      title: 'Session Purged',
      message: 'Local trading session has been purged.',
      status: 'info',
    });
  },

  purge: () => {
    const network = useWalletStore.getState().network;
    purgeAgentKey(network);
    signerIframeBridge.revokeKey().catch(() => {});
    set({
      asterSigner: null,
      agentAddress: null,
      sessionExpiry: null,
      deriveState: 'idle',
      error: null,
      isRestoring: false,
      isRevoking: false,
    });
  },
}));

export interface UseAsterAgentResult {
  asterSigner: Wallet | IAsterSigner | null;
  userAddr: string | null;
  agentAddress: string | null;
  deriveState: DeriveState;
  error: Error | null;
  sessionExpiry: number | null;
  isRevoking: boolean;
  timeRemaining: string | null;
  deriveAgentKey: () => Promise<void>;
  revokeSession: () => Promise<void>;
  emergencyPurgeSession: () => Promise<void>;
  purge: () => void;
  isReady: boolean;
}

function formatRemainingTime(expiry: number | null): string | null {
  if (!expiry) return null;
  const diff = expiry - Date.now();
  if (diff <= 0) return 'Expired';
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
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
  const sessionExpiry = useAsterAgentStore(s => s.sessionExpiry);
  const isRevoking = useAsterAgentStore(s => s.isRevoking);

  const restoreKey = useAsterAgentStore(s => s.restoreKey);
  const deriveAgentKeyStore = useAsterAgentStore(s => s.deriveAgentKey);
  const revokeSessionStore = useAsterAgentStore(s => s.revokeSession);
  const emergencyPurgeSessionStore = useAsterAgentStore(s => s.emergencyPurgeSession);
  const purgeStore = useAsterAgentStore(s => s.purge);

  const [timeRemaining, setTimeRemaining] = useState<string | null>(() =>
    formatRemainingTime(sessionExpiry)
  );

  useEffect(() => {
    setTimeRemaining(formatRemainingTime(sessionExpiry));
    if (!sessionExpiry) return;

    const interval = setInterval(() => {
      const formatted = formatRemainingTime(sessionExpiry);
      setTimeRemaining(formatted);
      if (formatted === 'Expired') {
        restoreKey();
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [sessionExpiry, restoreKey]);

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
    if (!userAddr) return;
    try {
      await deriveAgentKeyStore(userAddr);
    } catch (e: any) {
      console.warn('[useAsterAgent] Agent derivation notice:', e?.message || e);
    }
  }, [userAddr, deriveAgentKeyStore]);

  const isReady = (deriveState === 'ready' || hasStoredAgentKey(network)) && !!asterSigner;

  return {
    asterSigner,
    userAddr,
    agentAddress,
    deriveState,
    error,
    sessionExpiry,
    isRevoking,
    timeRemaining,
    deriveAgentKey,
    revokeSession: revokeSessionStore,
    emergencyPurgeSession: emergencyPurgeSessionStore,
    purge: purgeStore,
    isReady,
  };
}
