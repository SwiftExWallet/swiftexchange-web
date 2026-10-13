import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { RecoveryStep } from '../types';

export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
export const DEFAULT_FALLBACK_WALLET = '0x91a...f2c';
export const DEFAULT_NEW_KEY = '0x4be...a90';

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
  recoveryDurationMs: number;

  setCurrentStep: (step: RecoveryStep) => void;
  startSetup: (email: string, walletAddress?: string) => void;
  confirmEmailSetup: () => void;
  updateEmail: (newEmail: string) => void;
  disableRecovery: () => void;
  setTargetWallet: (wallet: string) => void;
  startRecoveryRequest: (email: string) => void;
  authorizeRecoveryEmail: () => void;
  cancelRecovery: () => void;
  completeRestore: () => void;
  fastForwardWait: () => void;
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
      walletAddress: DEFAULT_FALLBACK_WALLET,
      targetWallet: DEFAULT_FALLBACK_WALLET,
      newKey: DEFAULT_NEW_KEY,
      requestId: 'REC-9824-A',
      initiatedAt: 'Today, 14:49 UTC',
      recoveryInProgress: false,
      recoveryStartedAt: null,
      recoveryDurationMs: SEVEN_DAYS_MS,

      setCurrentStep: (step: RecoveryStep) => {
        set({ currentStep: step });
      },

      startSetup: (email: string, walletAddress?: string) => {
        set({
          pendingEmail: email,
          walletAddress: walletAddress || get().walletAddress || DEFAULT_FALLBACK_WALLET,
          currentStep: 'setup-verifying',
        });
      },

      confirmEmailSetup: () => {
        const state = get();
        const activeEmail = state.pendingEmail || state.email || 'alex.miller@gmail.com';
        set({
          isConfigured: true,
          email: activeEmail,
          pendingEmail: '',
          confirmedAt: Date.now(),
          currentStep: 'active',
        });
      },

      updateEmail: (newEmail: string) => {
        set({
          pendingEmail: newEmail,
          currentStep: 'setup-verifying',
        });
      },

      disableRecovery: () => {
        set({
          isConfigured: false,
          email: '',
          pendingEmail: '',
          confirmedAt: null,
          recoveryInProgress: false,
          recoveryStartedAt: null,
          currentStep: 'welcome',
        });
      },

      setTargetWallet: (wallet: string) => {
        set({ targetWallet: wallet, walletAddress: wallet });
      },

      startRecoveryRequest: (inputEmail: string) => {
        const randId = `REC-${Math.floor(1000 + Math.random() * 9000)}-A`;
        set({
          email: inputEmail || get().email || 'alex.miller@gmail.com',
          requestId: randId,
          newKey: DEFAULT_NEW_KEY,
          currentStep: 'recover-awaiting-email',
        });
      },

      authorizeRecoveryEmail: () => {
        set({
          recoveryInProgress: true,
          recoveryStartedAt: Date.now(),
          initiatedAt: 'Today, 14:49 UTC',
          currentStep: 'recover-timelock',
        });
      },

      cancelRecovery: () => {
        set({
          recoveryInProgress: false,
          recoveryStartedAt: null,
          currentStep: get().isConfigured ? 'active' : 'welcome',
        });
      },

      completeRestore: () => {
        set({
          recoveryInProgress: false,
          recoveryStartedAt: null,
          currentStep: 'recover-completed',
        });
      },

      fastForwardWait: () => {
        set({
          recoveryStartedAt: Date.now() - SEVEN_DAYS_MS - 2000,
          currentStep: 'recover-ready',
        });
      },

      resetAll: () => {
        set({
          currentStep: 'welcome',
          isConfigured: false,
          email: '',
          pendingEmail: '',
          confirmedAt: null,
          walletAddress: DEFAULT_FALLBACK_WALLET,
          targetWallet: DEFAULT_FALLBACK_WALLET,
          newKey: DEFAULT_NEW_KEY,
          requestId: 'REC-9824-A',
          initiatedAt: 'Today, 14:49 UTC',
          recoveryInProgress: false,
          recoveryStartedAt: null,
        });
      },
    }),
    {
      name: 'swiftex_zk_email_recovery_v4',
    }
  )
);
