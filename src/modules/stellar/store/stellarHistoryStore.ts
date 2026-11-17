import { create } from 'zustand';

export interface AccountHistoryState {
  pool: any[];
  cursor?: string;
  done: boolean;
  lastFetchedAt: number;
}

interface StellarHistoryStore {
  historyByAccount: Record<string, AccountHistoryState>;

  getAccountState: (network: string, account: string) => AccountHistoryState;

  appendRecords: (
    network: string,
    account: string,
    newRecords: any[],
    nextCursor?: string,
    isDone?: boolean
  ) => void;

  prependFreshRecords: (network: string, account: string, freshRecords: any[]) => void;

  resetAccount: (network: string, account: string) => void;
  resetAll: () => void;
}

const DEFAULT_STATE: AccountHistoryState = {
  pool: [],
  cursor: undefined,
  done: false,
  lastFetchedAt: 0,
};

export const getHistoryKey = (network: string, account: string) =>
  `${network.toLowerCase()}:${account.trim()}`;

export const useStellarHistoryStore = create<StellarHistoryStore>((set, get) => ({
  historyByAccount: {},

  getAccountState: (network: string, account: string) => {
    if (!account) return DEFAULT_STATE;
    const key = getHistoryKey(network, account);
    return get().historyByAccount[key] || DEFAULT_STATE;
  },

  appendRecords: (network, account, newRecords, nextCursor, isDone) => {
    if (!account) return;
    const key = getHistoryKey(network, account);

    set(state => {
      const current = state.historyByAccount[key] || { ...DEFAULT_STATE };
      const existingIds = new Set(current.pool.map((op: any) => op.id));
      const filteredNew = newRecords.filter((op: any) => !existingIds.has(op.id));

      const mergedPool = [...current.pool, ...filteredNew];
      const finalCursor = nextCursor ?? current.cursor;
      const finalDone = isDone !== undefined ? isDone : current.done;

      return {
        historyByAccount: {
          ...state.historyByAccount,
          [key]: {
            pool: mergedPool,
            cursor: finalCursor,
            done: finalDone,
            lastFetchedAt: Date.now(),
          },
        },
      };
    });
  },

  prependFreshRecords: (network, account, freshRecords) => {
    if (!account) return;
    const key = getHistoryKey(network, account);

    set(state => {
      const current = state.historyByAccount[key] || { ...DEFAULT_STATE };
      const existingIds = new Set(current.pool.map((op: any) => op.id));
      const newerRecords = freshRecords.filter((op: any) => !existingIds.has(op.id));

      if (newerRecords.length === 0) {
        return {
          historyByAccount: {
            ...state.historyByAccount,
            [key]: {
              ...current,
              lastFetchedAt: Date.now(),
            },
          },
        };
      }

      return {
        historyByAccount: {
          ...state.historyByAccount,
          [key]: {
            ...current,
            pool: [...newerRecords, ...current.pool],
            lastFetchedAt: Date.now(),
          },
        },
      };
    });
  },

  resetAccount: (network, account) => {
    const key = getHistoryKey(network, account);
    set(state => {
      const updated = { ...state.historyByAccount };
      delete updated[key];
      return { historyByAccount: updated };
    });
  },

  resetAll: () => set({ historyByAccount: {} }),
}));
