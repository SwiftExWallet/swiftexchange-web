import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { AccountBalance } from '../models';

export interface AccountSummaryMetrics {
  totalWalletBalance?: string;
  totalMarginBalance?: string;
  availableBalance?: string;
  totalUnrealizedProfit?: string;
}

interface AccountStoreState {
  balances: Record<string, AccountBalance>;
  isLoading: boolean;
  multiAssetsMargin: boolean;
  totalWalletBalance?: string;
  totalMarginBalance?: string;
  availableBalance?: string;
  totalUnrealizedProfit?: string;
  setIsLoading: (loading: boolean) => void;
  setBalances: (balances: AccountBalance[], summary?: AccountSummaryMetrics) => void;
  setMultiAssetsMargin: (isMultiAsset: boolean) => void;
  updateBalance: (balance: AccountBalance) => void;
  getBalance: (asset: string) => AccountBalance | undefined;
  clear: () => void;
}

export const useAccountStore = create<AccountStoreState>()(
  persist(
    (set, get) => ({
      balances: {},
      isLoading: false,
      multiAssetsMargin: false,
      totalWalletBalance: undefined,
      totalMarginBalance: undefined,
      availableBalance: undefined,
      totalUnrealizedProfit: undefined,
      setIsLoading: isLoading => set({ isLoading }),
      setBalances: (balances, summary) => {
        const nextBalances: Record<string, AccountBalance> = {};
        balances.forEach(b => {
          nextBalances[b.asset] = b;
        });
        set({
          balances: nextBalances,
          isLoading: false,
          ...(summary
            ? {
                totalWalletBalance: summary.totalWalletBalance,
                totalMarginBalance: summary.totalMarginBalance,
                availableBalance: summary.availableBalance,
                totalUnrealizedProfit: summary.totalUnrealizedProfit,
              }
            : {}),
        });
      },
      setMultiAssetsMargin: isMultiAsset => set({ multiAssetsMargin: isMultiAsset }),
      updateBalance: balance =>
        set(state => ({
          balances: {
            ...state.balances,
            [balance.asset]: balance,
          },
        })),
      getBalance: asset => get().balances[asset],
      clear: () =>
        set({
          balances: {},
          isLoading: false,
          totalWalletBalance: undefined,
          totalMarginBalance: undefined,
          availableBalance: undefined,
          totalUnrealizedProfit: undefined,
        }),
    }),
    {
      name: 'swiftex_perps_account_settings',
      partialize: state => ({
        multiAssetsMargin: state.multiAssetsMargin,
      }),
    }
  )
);
