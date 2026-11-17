import { create } from 'zustand';

import type { VaultActivityRecord } from '../types/vault.types';

export const getVaultActivityKey = (
  network: string,
  userAddress: string,
  vaultAddress: string
): string => {
  return `${network.toLowerCase()}:${userAddress.trim().toLowerCase()}:${vaultAddress.trim().toLowerCase()}`;
};

interface VaultActivityStore {
  // Pure in-memory state (no localStorage)
  activitiesByVault: Record<string, VaultActivityRecord[]>;
  cursorByVault: Record<string, string | undefined>;
  isDoneByVault: Record<string, boolean>;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasFetchedOnce: Record<string, boolean>;

  getActivities: (key: string) => VaultActivityRecord[];
  addActivity: (key: string, record: VaultActivityRecord) => void;
  appendActivities: (
    key: string,
    records: VaultActivityRecord[],
    nextCursor?: string,
    isDone?: boolean
  ) => void;
  setLoading: (loading: boolean) => void;
  setLoadingMore: (loading: boolean) => void;
  markFetched: (key: string) => void;
  resetVault: (key: string) => void;
  clearAll: () => void;
}

export const useVaultActivityStore = create<VaultActivityStore>((set, get) => ({
  activitiesByVault: {},
  cursorByVault: {},
  isDoneByVault: {},
  isLoading: false,
  isLoadingMore: false,
  hasFetchedOnce: {},

  getActivities: (key: string) => {
    return get().activitiesByVault[key] || [];
  },

  addActivity: (key: string, record: VaultActivityRecord) => {
    set(state => {
      const existing = state.activitiesByVault[key] || [];
      const filtered = existing.filter(r => r.txHash !== record.txHash && r.id !== record.id);
      return {
        activitiesByVault: {
          ...state.activitiesByVault,
          [key]: [record, ...filtered],
        },
      };
    });
  },

  appendActivities: (key, newRecords, nextCursor, isDone = false) => {
    set(state => {
      const existing = state.activitiesByVault[key] || [];
      const recordMap = new Map<string, VaultActivityRecord>();
      existing.forEach(r => recordMap.set(r.txHash || r.id, r));
      newRecords.forEach(r => recordMap.set(r.txHash || r.id, r));
      const merged = Array.from(recordMap.values()).sort((a, b) => b.timestamp - a.timestamp);

      return {
        activitiesByVault: {
          ...state.activitiesByVault,
          [key]: merged,
        },
        cursorByVault: {
          ...state.cursorByVault,
          [key]: nextCursor,
        },
        isDoneByVault: {
          ...state.isDoneByVault,
          [key]: isDone,
        },
      };
    });
  },

  setLoading: (loading: boolean) => set({ isLoading: loading }),
  setLoadingMore: (loading: boolean) => set({ isLoadingMore: loading }),

  markFetched: (key: string) => {
    set(state => ({
      hasFetchedOnce: {
        ...state.hasFetchedOnce,
        [key]: true,
      },
    }));
  },

  resetVault: (key: string) => {
    set(state => ({
      activitiesByVault: { ...state.activitiesByVault, [key]: [] },
      cursorByVault: { ...state.cursorByVault, [key]: undefined },
      isDoneByVault: { ...state.isDoneByVault, [key]: false },
      hasFetchedOnce: { ...state.hasFetchedOnce, [key]: false },
    }));
  },

  clearAll: () =>
    set({
      activitiesByVault: {},
      cursorByVault: {},
      isDoneByVault: {},
      hasFetchedOnce: {},
      isLoading: false,
      isLoadingMore: false,
    }),
}));
