import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { SPAREKEY_CONFIG } from '../constants';
import type { RecoveryStep } from '../types';

export const SPAREKEY_CONTRACT_ID = SPAREKEY_CONFIG.contractId || '';
export const DEFAULT_TIMELOCK_SECONDS = SPAREKEY_CONFIG.minDelaySeconds || 5;

interface RecoveryStoreState {
  currentStep: RecoveryStep;
  isConfigured: boolean;
  email: string;
  pendingEmail: string;
  confirmedAt: number | null;
  walletAddress: string;
  targetWallet: string;
  newKey: string;
  requestId: string;
  initiatedAt: string;
  recoveryInProgress: boolean;
  recoveryStartedAt: number | null;
  unlockAt: number | null;
  recoveryDurationMs: number;
  commitmentHex: string;
  saltHex: string;
  isOnChainVerified: boolean;
  contractId: string;
  lastTxHash: string;

  setCurrentStep: (step: RecoveryStep) => void;
  startSetup: (email: string, walletAddress: string) => void;
  confirmEmailSetup: () => void;
  confirmOnChainSetup: (data: {
    email: string;
    commitmentHex: string;
    saltHex: string;
    walletAddress: string;
    txHash?: string;
  }) => void;
  updateEmail: (newEmail: string) => void;
  setOnChainUpdatedEmail: (data: {
    email: string;
    commitmentHex: string;
    saltHex: string;
    txHash?: string;
  }) => void;
  disableRecovery: () => void;
  setTargetWallet: (wallet: string) => void;
  setNewKey: (key: string) => void;
  startRecoveryRequest: (params: {
    email?: string;
    targetWallet: string;
    destinationAddress: string;
    requestId?: string;
  }) => void;
  setPendingRecoveryOnChain: (data: {
    startedAt?: number;
    unlockAt?: number;
    destination?: string;
  }) => void;
  cancelRecovery: () => void;
  completeRestore: (txHash?: string) => void;
  clearRecoverySession: (nextStep?: RecoveryStep) => void;
  resetAll: () => void;
}

export const useRecoveryStore = create<RecoveryStoreState>()(
  persist(
    (set, get) => ({
      currentStep: 'welcome',
      isConfigured: false,
      email: '',
      pendingEmail: '',
      confirmedAt: null,
      walletAddress: '',
      targetWallet: '',
      newKey: '',
      requestId: '',
      initiatedAt: '',
      recoveryInProgress: false,
      recoveryStartedAt: null,
      unlockAt: null,
      recoveryDurationMs: DEFAULT_TIMELOCK_SECONDS * 1000,
      commitmentHex: '',
      saltHex: '',
      isOnChainVerified: false,
      contractId: SPAREKEY_CONTRACT_ID,
      lastTxHash: '',

      setCurrentStep: (step: RecoveryStep) => {
        set({ currentStep: step });
      },

      startSetup: (email: string, walletAddress: string) => {
        set({
          pendingEmail: (email || '').trim(),
          walletAddress: (walletAddress || '').trim(),
          currentStep: 'setup-verifying',
        });
      },

      confirmEmailSetup: () => {
        const state = get();
        const activeEmail = state.pendingEmail || state.email;
        set({
          isConfigured: true,
          email: activeEmail,
          pendingEmail: '',
          confirmedAt: Date.now(),
          currentStep: 'active',
        });
      },

      confirmOnChainSetup: (data: {
        email: string;
        commitmentHex: string;
        saltHex: string;
        walletAddress: string;
        txHash?: string;
      }) => {
        const prev = get();
        const shouldTransitionToActive =
          prev.currentStep === 'setup-verifying' || prev.currentStep === 'welcome';
        set({
          isConfigured: true,
          isOnChainVerified: true,
          email: (data?.email || prev.email || '').trim(),
          commitmentHex: data?.commitmentHex || prev.commitmentHex || '',
          saltHex: data?.saltHex || prev.saltHex || '',
          walletAddress: (data?.walletAddress || prev.walletAddress || '').trim(),
          lastTxHash: data?.txHash || prev.lastTxHash || '',
          pendingEmail: '',
          confirmedAt: Date.now(),
          currentStep: shouldTransitionToActive ? 'active' : prev.currentStep,
        });
      },

      updateEmail: (newEmail: string) => {
        set({
          pendingEmail: (newEmail || '').trim(),
          currentStep: 'setup-verifying',
        });
      },

      setOnChainUpdatedEmail: (data: {
        email: string;
        commitmentHex: string;
        saltHex: string;
        txHash?: string;
      }) => {
        set({
          email: (data?.email || '').trim(),
          commitmentHex: data?.commitmentHex || '',
          saltHex: data?.saltHex || '',
          lastTxHash: data?.txHash || get().lastTxHash || '',
          pendingEmail: '',
        });
      },

      disableRecovery: () => {
        set({
          isConfigured: false,
          isOnChainVerified: false,
          email: '',
          pendingEmail: '',
          commitmentHex: '',
          saltHex: '',
          confirmedAt: null,
          recoveryInProgress: false,
          recoveryStartedAt: null,
          unlockAt: null,
          currentStep: 'welcome',
        });
      },

      setTargetWallet: (wallet: string) => {
        set({ targetWallet: (wallet || '').trim() });
      },

      setNewKey: (key: string) => {
        set({ newKey: (key || '').trim() });
      },

      startRecoveryRequest: (params: {
        email?: string;
        targetWallet: string;
        destinationAddress: string;
        requestId?: string;
      }) => {
        const randId = params?.requestId || `REC-${Math.floor(1000 + Math.random() * 9000)}-A`;
        set({
          email: (params?.email || '').trim(),
          targetWallet: (params?.targetWallet || '').trim(),
          newKey: (params?.destinationAddress || '').trim(),
          requestId: randId,
          recoveryInProgress: true,
          currentStep: 'recover-awaiting-email',
        });
      },

      setPendingRecoveryOnChain: (data: {
        startedAt?: number;
        unlockAt?: number;
        destination?: string;
      }) => {
        const startedAt = data.startedAt || Date.now();
        const unlockAt = data.unlockAt || startedAt + (SPAREKEY_CONFIG.minDelaySeconds || 5) * 1000;
        const initiatedTimeStr = new Date(startedAt).toUTCString();
        const isReady = Date.now() >= unlockAt;
        set({
          recoveryInProgress: true,
          recoveryStartedAt: startedAt,
          unlockAt,
          initiatedAt: initiatedTimeStr,
          ...(data.destination ? { newKey: data.destination } : {}),
          currentStep: isReady ? 'recover-ready' : 'recover-timelock',
        });
      },

      cancelRecovery: () => {
        set({
          recoveryInProgress: false,
          recoveryStartedAt: null,
          unlockAt: null,
          targetWallet: '',
          newKey: '',
          requestId: '',
          initiatedAt: '',
          lastTxHash: '',
          currentStep: get().isConfigured ? 'active' : 'welcome',
        });
      },

      completeRestore: (txHash?: string) => {
        set({
          recoveryInProgress: false,
          recoveryStartedAt: null,
          unlockAt: null,
          lastTxHash: txHash || get().lastTxHash || '',
          currentStep: 'recover-completed',
        });
      },

      clearRecoverySession: (nextStep?: RecoveryStep) => {
        set({
          recoveryInProgress: false,
          recoveryStartedAt: null,
          unlockAt: null,
          targetWallet: '',
          newKey: '',
          requestId: '',
          initiatedAt: '',
          lastTxHash: '',
          currentStep: nextStep || 'recover-get-started',
        });
      },

      resetAll: () => {
        set({
          currentStep: 'welcome',
          isConfigured: false,
          isOnChainVerified: false,
          email: '',
          pendingEmail: '',
          commitmentHex: '',
          saltHex: '',
          confirmedAt: null,
          walletAddress: '',
          targetWallet: '',
          newKey: '',
          requestId: '',
          initiatedAt: '',
          lastTxHash: '',
          recoveryInProgress: false,
          recoveryStartedAt: null,
          unlockAt: null,
        });
      },
    }),
    {
      name: 'swiftex_recovery_storage',
      partialize: state => {
        const isActivelyRecovering = Boolean(
          state.recoveryInProgress &&
          state.currentStep !== 'recover-completed' &&
          state.unlockAt &&
          Date.now() < state.unlockAt + 3600_000
        );

        return {
          isConfigured: state.isConfigured,
          isOnChainVerified: state.isOnChainVerified,
          email: state.email,
          walletAddress: state.walletAddress,
          commitmentHex: state.commitmentHex,
          saltHex: state.saltHex,
          confirmedAt: state.confirmedAt,
          contractId: state.contractId,
          ...(isActivelyRecovering
            ? {
                recoveryInProgress: true,
                recoveryStartedAt: state.recoveryStartedAt,
                unlockAt: state.unlockAt,
                targetWallet: state.targetWallet,
                newKey: state.newKey,
                currentStep: state.currentStep,
              }
            : {
                recoveryInProgress: false,
                currentStep: state.isConfigured ? 'active' : 'welcome',
              }),
        };
      },
    }
  )
);
