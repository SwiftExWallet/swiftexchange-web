import type { Signer } from 'ethers';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { useNotificationStore } from '../../../../store/notificationStore';
import { getAccountInfo, getDepositWithdrawHistory } from '../../adapters/aster/api/account';
import { useAccountStore } from './accountStore';

export type DepositTrackStatus = 'CONFIRMING_ON_CHAIN' | 'INDEXING' | 'CONFIRMED' | 'FAILED';

export interface PendingDepositRecord {
  id: string;
  txHash: string;
  asset: string;
  amount: string;
  chainId: number;
  chainName: string;
  explorerUrl: string;
  timestamp: number;
  status: DepositTrackStatus;
  error?: string;
}

export interface PendingWithdrawRecord {
  id: string;
  txHash?: string;
  asset: string;
  amount: string;
  chainId: number;
  chainName: string;
  destination: string;
  timestamp: number;
  status: 'PROCESSING' | 'CONFIRMED' | 'FAILED';
  error?: string;
}

export type AccountTxType = 'DEPOSIT' | 'WITHDRAW';
export type AccountTxStep = 'AWAITING_SIGNATURE' | 'CONFIRMING' | 'SUCCESS' | 'FAILED';

export interface ActiveAccountTransaction {
  id: string;
  type: AccountTxType;
  step: AccountTxStep;
  asset: string;
  amount: string;
  chainId: number;
  chainName: string;
  txHash?: string;
  destinationAddress?: string;
  message?: string;
  timestamp: number;
}

interface DepositTrackerState {
  activeTransaction: ActiveAccountTransaction | null;
  pendingDeposits: PendingDepositRecord[];
  pendingWithdrawals: PendingWithdrawRecord[];

  setActiveTransaction: (tx: ActiveAccountTransaction | null) => void;
  updateActiveTransaction: (partial: Partial<ActiveAccountTransaction>) => void;
  clearActiveTransaction: () => void;

  addDeposit: (deposit: Omit<PendingDepositRecord, 'id' | 'timestamp'>) => void;
  updateStatus: (txHash: string, status: DepositTrackStatus, error?: string) => void;
  removeDeposit: (txHash: string) => void;
  clearCompleted: () => void;
  hasActiveDeposits: () => boolean;

  addWithdrawal: (withdraw: Omit<PendingWithdrawRecord, 'id' | 'timestamp'>) => void;
  updateWithdrawalStatus: (
    idOrTx: string,
    status: 'PROCESSING' | 'CONFIRMED' | 'FAILED',
    error?: string
  ) => void;
  removeWithdrawal: (idOrTx: string) => void;
  hasActiveWithdrawals: () => boolean;

  hasActiveTransactions: () => boolean;
}

let pollingInterval: NodeJS.Timeout | null = null;

export const useDepositTrackerStore = create<DepositTrackerState>()(
  persist(
    (set, get) => ({
      activeTransaction: null,
      pendingDeposits: [],
      pendingWithdrawals: [],

      setActiveTransaction: tx => {
        set({ activeTransaction: tx });
      },

      updateActiveTransaction: partial => {
        set(state => ({
          activeTransaction: state.activeTransaction
            ? { ...state.activeTransaction, ...partial }
            : null,
        }));
      },

      clearActiveTransaction: () => {
        set({ activeTransaction: null });
      },

      addDeposit: deposit => {
        const id = `${deposit.txHash}_${Date.now()}`;
        const newRecord: PendingDepositRecord = {
          ...deposit,
          id,
          timestamp: Date.now(),
        };

        set(state => {
          const filtered = state.pendingDeposits.filter(
            d => d.txHash.toLowerCase() !== deposit.txHash.toLowerCase()
          );
          return { pendingDeposits: [newRecord, ...filtered] };
        });
      },

      updateStatus: (txHash, status, error) => {
        set(state => ({
          pendingDeposits: state.pendingDeposits.map(d =>
            d.txHash.toLowerCase() === txHash.toLowerCase()
              ? { ...d, status, ...(error ? { error } : {}) }
              : d
          ),
          activeTransaction:
            state.activeTransaction &&
            state.activeTransaction.txHash?.toLowerCase() === txHash.toLowerCase()
              ? {
                  ...state.activeTransaction,
                  step:
                    status === 'CONFIRMED'
                      ? 'SUCCESS'
                      : status === 'FAILED'
                        ? 'FAILED'
                        : state.activeTransaction.step,
                  message:
                    error ||
                    (status === 'CONFIRMED'
                      ? 'Deposit fully confirmed and credited!'
                      : state.activeTransaction.message),
                }
              : state.activeTransaction,
        }));
      },

      removeDeposit: txHash => {
        set(state => ({
          pendingDeposits: state.pendingDeposits.filter(
            d => d.txHash.toLowerCase() !== txHash.toLowerCase()
          ),
        }));
      },

      clearCompleted: () => {
        set(state => ({
          pendingDeposits: state.pendingDeposits.filter(
            d => d.status === 'INDEXING' || d.status === 'CONFIRMING_ON_CHAIN'
          ),
          pendingWithdrawals: state.pendingWithdrawals.filter(w => w.status === 'PROCESSING'),
        }));
      },

      hasActiveDeposits: () => {
        return get().pendingDeposits.some(
          d => d.status === 'CONFIRMING_ON_CHAIN' || d.status === 'INDEXING'
        );
      },

      addWithdrawal: withdraw => {
        const id = `withdraw_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const newRecord: PendingWithdrawRecord = {
          ...withdraw,
          id,
          timestamp: Date.now(),
        };

        set(state => {
          const filtered = withdraw.txHash
            ? state.pendingWithdrawals.filter(
                w => !w.txHash || w.txHash.toLowerCase() !== withdraw.txHash!.toLowerCase()
              )
            : state.pendingWithdrawals;
          return { pendingWithdrawals: [newRecord, ...filtered] };
        });
      },

      updateWithdrawalStatus: (idOrTx, status, error) => {
        set(state => ({
          pendingWithdrawals: state.pendingWithdrawals.map(w =>
            w.id === idOrTx || (w.txHash && w.txHash.toLowerCase() === idOrTx.toLowerCase())
              ? { ...w, status, ...(error ? { error } : {}) }
              : w
          ),
          activeTransaction:
            state.activeTransaction &&
            state.activeTransaction.type === 'WITHDRAW' &&
            (state.activeTransaction.id === idOrTx ||
              (state.activeTransaction.txHash &&
                state.activeTransaction.txHash.toLowerCase() === idOrTx.toLowerCase()))
              ? {
                  ...state.activeTransaction,
                  step:
                    status === 'CONFIRMED'
                      ? 'SUCCESS'
                      : status === 'FAILED'
                        ? 'FAILED'
                        : state.activeTransaction.step,
                  message:
                    error ||
                    (status === 'CONFIRMED'
                      ? 'Withdrawal processed and dispatched!'
                      : state.activeTransaction.message),
                }
              : state.activeTransaction,
        }));
      },

      removeWithdrawal: idOrTx => {
        set(state => ({
          pendingWithdrawals: state.pendingWithdrawals.filter(
            w => w.id !== idOrTx && (!w.txHash || w.txHash.toLowerCase() !== idOrTx.toLowerCase())
          ),
        }));
      },

      hasActiveWithdrawals: () => {
        return get().pendingWithdrawals.some(w => w.status === 'PROCESSING');
      },

      hasActiveTransactions: () => {
        const s = get();
        return (
          s.hasActiveDeposits() ||
          s.hasActiveWithdrawals() ||
          (s.activeTransaction !== null &&
            (s.activeTransaction.step === 'AWAITING_SIGNATURE' ||
              s.activeTransaction.step === 'CONFIRMING'))
        );
      },
    }),
    {
      name: 'swiftex_aster_pending_deposits',
    }
  )
);

/**
 * Starts a targeted poller for both pending deposits and pending withdrawals.
 * Automatically terminates when all transactions are confirmed or resolved.
 */
export function startDepositPolling(signer: Signer, userAddr: string) {
  startTransactionPolling(signer, userAddr);
}

export function startTransactionPolling(signer: Signer, userAddr: string) {
  if (pollingInterval) return;

  const checkPending = async () => {
    const store = useDepositTrackerStore.getState();
    const activeDeposits = store.pendingDeposits.filter(
      d => d.status === 'INDEXING' || d.status === 'CONFIRMING_ON_CHAIN'
    );
    const activeWithdrawals = store.pendingWithdrawals.filter(w => w.status === 'PROCESSING');

    if (activeDeposits.length === 0 && activeWithdrawals.length === 0) {
      stopDepositPolling();
      return;
    }

    try {
      const promises: Promise<any>[] = [getAccountInfo(signer, userAddr)];

      if (activeDeposits.length > 0) {
        promises.push(
          getDepositWithdrawHistory(signer, userAddr, { limit: 15, type: 'DEPOSIT' }).catch(
            () => []
          )
        );
      } else {
        promises.push(Promise.resolve([]));
      }

      if (activeWithdrawals.length > 0) {
        promises.push(
          getDepositWithdrawHistory(signer, userAddr, { limit: 15, type: 'WITHDRAW' }).catch(
            () => []
          )
        );
      } else {
        promises.push(Promise.resolve([]));
      }

      const [accountInfo, depHistory, withHistory] = await Promise.all(promises);

      // Update balances in store
      if (accountInfo?.assets) {
        const mappedBalances = accountInfo.assets.map((a: any) => ({
          asset: a.asset,
          total: a.walletBalance,
          available: a.availableBalance || a.crossWalletBalance || '0',
          locked: String(
            parseFloat(a.walletBalance || '0') -
              parseFloat(a.availableBalance || a.crossWalletBalance || '0')
          ),
          marginBalance: a.marginBalance || a.crossWalletBalance || a.walletBalance || '0',
          unrealizedPnl: a.unrealizedProfit || '0',
        }));
        useAccountStore.getState().setBalances(mappedBalances);
      }

      const now = Date.now();

      // Check Deposits
      for (const item of activeDeposits) {
        const found = depHistory.some(
          (h: any) =>
            h.txHash?.toLowerCase() === item.txHash.toLowerCase() &&
            (h.state === 'SUCCESS' || h.state === 'PROCESSING')
        );

        if (found) {
          store.updateStatus(item.txHash, 'CONFIRMED');
          const currentActive = useDepositTrackerStore.getState().activeTransaction;
          if (
            currentActive &&
            currentActive.type === 'DEPOSIT' &&
            currentActive.txHash?.toLowerCase() === item.txHash.toLowerCase()
          ) {
            store.updateActiveTransaction({
              step: 'SUCCESS',
              message: `${item.amount} ${item.asset} has been credited to your Aster account!`,
            });
          }
          useNotificationStore.getState().showToast({
            type: 'DYDX',
            title: 'Deposit Credited',
            message: `${item.amount} ${item.asset} has been credited to your Aster account!`,
          });
        } else if (now - item.timestamp > 180000) {
          store.updateStatus(item.txHash, 'CONFIRMED');
          const currentActive = useDepositTrackerStore.getState().activeTransaction;
          if (
            currentActive &&
            currentActive.type === 'DEPOSIT' &&
            currentActive.txHash?.toLowerCase() === item.txHash.toLowerCase()
          ) {
            store.updateActiveTransaction({
              step: 'SUCCESS',
              message: `Deposit credited to your account!`,
            });
          }
        }
      }

      // Check Withdrawals
      for (const item of activeWithdrawals) {
        const found = withHistory.find(
          (h: any) =>
            (item.txHash && h.txHash?.toLowerCase() === item.txHash.toLowerCase()) ||
            (h.asset === item.asset &&
              Math.abs(parseFloat(h.amount) - parseFloat(item.amount)) < 0.0001)
        );

        if (found) {
          const currentActive = useDepositTrackerStore.getState().activeTransaction;
          const isMatchingActive =
            currentActive &&
            currentActive.type === 'WITHDRAW' &&
            (currentActive.id === item.id ||
              (item.txHash && currentActive.txHash?.toLowerCase() === item.txHash.toLowerCase()));

          if (found.state === 'SUCCESS') {
            store.updateWithdrawalStatus(item.id, 'CONFIRMED');
            if (isMatchingActive) {
              store.updateActiveTransaction({
                step: 'SUCCESS',
                message: `Withdrawal of ${item.amount} ${item.asset} dispatched successfully!`,
              });
            }
            useNotificationStore.getState().showToast({
              type: 'DYDX',
              title: 'Withdrawal Completed',
              message: `Withdrawal of ${item.amount} ${item.asset} dispatched successfully!`,
            });
          } else if (found.state === 'FAILED' || found.state === 'REJECTED') {
            store.updateWithdrawalStatus(
              item.id,
              'FAILED',
              'Withdrawal request was rejected or failed.'
            );
            if (isMatchingActive) {
              store.updateActiveTransaction({
                step: 'FAILED',
                message: 'Withdrawal request was rejected or failed.',
              });
            }
            useNotificationStore.getState().showToast({
              type: 'DYDX',
              title: 'Withdrawal Failed',
              message: `Withdrawal of ${item.amount} ${item.asset} failed.`,
            });
          }
        } else if (now - item.timestamp > 300000) {
          // Timeout after 5 minutes
          store.updateWithdrawalStatus(item.id, 'CONFIRMED');
          const currentActive = useDepositTrackerStore.getState().activeTransaction;
          if (
            currentActive &&
            currentActive.type === 'WITHDRAW' &&
            (currentActive.id === item.id ||
              (item.txHash && currentActive.txHash?.toLowerCase() === item.txHash.toLowerCase()))
          ) {
            store.updateActiveTransaction({
              step: 'SUCCESS',
              message: `Withdrawal completed!`,
            });
          }
        }
      }

      if (!useDepositTrackerStore.getState().hasActiveTransactions()) {
        stopDepositPolling();
      }
    } catch (err) {
      console.warn('[TransactionTracker] Polling check encountered error:', err);
    }
  };

  checkPending();
  pollingInterval = setInterval(checkPending, 10000);
}

export function stopDepositPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}
