import { create } from 'zustand';

import type { Trade } from '../models';

const MAX_TRADES_PER_SYMBOL = 100;

export interface TradeBufferMessage extends Trade {
  bufferReceivedAt?: number;
}

interface TradeStoreState {
  tradesBySymbol: Record<string, Trade[]>;
  syncBuffers: Record<string, Trade[]>;
  isSyncingBySymbol: Record<string, boolean>;

  startSync: (symbol: string) => void;
  applySnapshot: (symbol: string, trades: Trade[]) => void;
  reconcileAndFlush: (symbol: string, latestTimestamp: number) => void;
  addTrades: (symbol: string, incoming: Trade[]) => void;
  getTrades: (symbol: string) => Trade[];
  clear: (symbol?: string) => void;
}

export const useTradeStore = create<TradeStoreState>((set, get) => ({
  tradesBySymbol: {},
  syncBuffers: {},
  isSyncingBySymbol: {},

  startSync: symbol => {
    set(state => ({
      isSyncingBySymbol: {
        ...state.isSyncingBySymbol,
        [symbol]: true,
      },
      syncBuffers: {
        ...state.syncBuffers,
        [symbol]: [],
      },
    }));

    setTimeout(() => {
      if (get().isSyncingBySymbol[symbol]) {
        get().reconcileAndFlush(symbol, 0);
      }
    }, 4000);
  },

  applySnapshot: (symbol, trades) => {
    const seen = new Set<string>();
    const deduped: Trade[] = [];

    for (const t of trades) {
      if (!seen.has(t.id)) {
        seen.add(t.id);
        deduped.push(t);
      }
    }

    deduped.sort((a, b) => b.timestamp - a.timestamp);

    set(state => ({
      tradesBySymbol: {
        ...state.tradesBySymbol,
        [symbol]: deduped.slice(0, MAX_TRADES_PER_SYMBOL),
      },
    }));
  },

  reconcileAndFlush: (symbol, latestTimestamp) => {
    const state = get();
    const buffer = state.syncBuffers[symbol] || [];
    const existing = state.tradesBySymbol[symbol] || [];

    const newerBuffered = buffer.filter(t => t.timestamp > latestTimestamp);

    const combined = [...newerBuffered, ...existing];
    const seen = new Set<string>();
    const deduped: Trade[] = [];

    for (const t of combined) {
      if (!seen.has(t.id)) {
        seen.add(t.id);
        deduped.push(t);
      }
    }

    deduped.sort((a, b) => b.timestamp - a.timestamp);

    set(s => {
      const nextBuffers = { ...s.syncBuffers };
      delete nextBuffers[symbol];

      return {
        syncBuffers: nextBuffers,
        isSyncingBySymbol: {
          ...s.isSyncingBySymbol,
          [symbol]: false,
        },
        tradesBySymbol: {
          ...s.tradesBySymbol,
          [symbol]: deduped.slice(0, MAX_TRADES_PER_SYMBOL),
        },
      };
    });
  },

  addTrades: (symbol, incoming) => {
    const state = get();
    const isSyncing = state.isSyncingBySymbol[symbol] ?? false;

    if (isSyncing) {
      const currentBuf = state.syncBuffers[symbol] || [];
      const nextBuf = [...currentBuf, ...incoming];
      if (nextBuf.length > 500) {
        nextBuf.splice(0, nextBuf.length - 500);
      }
      set(s => ({
        syncBuffers: {
          ...s.syncBuffers,
          [symbol]: nextBuf,
        },
      }));
      return;
    }

    const existing = state.tradesBySymbol[symbol] ?? [];
    const combined = [...incoming, ...existing];

    const seen = new Set<string>();
    const deduped: Trade[] = [];

    for (const t of combined) {
      if (!seen.has(t.id)) {
        seen.add(t.id);
        deduped.push(t);
      }
    }

    deduped.sort((a, b) => b.timestamp - a.timestamp);

    set(s => ({
      tradesBySymbol: {
        ...s.tradesBySymbol,
        [symbol]: deduped.slice(0, MAX_TRADES_PER_SYMBOL),
      },
    }));
  },

  getTrades: symbol => get().tradesBySymbol[symbol] ?? [],

  clear: symbol => {
    if (symbol) {
      set(state => {
        const nextTrades = { ...state.tradesBySymbol };
        const nextBuffers = { ...state.syncBuffers };
        const nextSyncing = { ...state.isSyncingBySymbol };
        delete nextTrades[symbol];
        delete nextBuffers[symbol];
        delete nextSyncing[symbol];
        return {
          tradesBySymbol: nextTrades,
          syncBuffers: nextBuffers,
          isSyncingBySymbol: nextSyncing,
        };
      });
    } else {
      set({ tradesBySymbol: {}, syncBuffers: {}, isSyncingBySymbol: {} });
    }
  },
}));

export const tradeStore = {
  startSync: (symbol: string) => useTradeStore.getState().startSync(symbol),
  applySnapshot: (symbol: string, trades: Trade[]) =>
    useTradeStore.getState().applySnapshot(symbol, trades),
  reconcileAndFlush: (symbol: string, latestTimestamp: number) =>
    useTradeStore.getState().reconcileAndFlush(symbol, latestTimestamp),
  addTrades: (symbol: string, trades: Trade[]) =>
    useTradeStore.getState().addTrades(symbol, trades),
  getTrades: (symbol: string) => useTradeStore.getState().getTrades(symbol),
  clear: (symbol?: string) => useTradeStore.getState().clear(symbol),
};
