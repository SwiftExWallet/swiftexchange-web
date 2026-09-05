import { create } from 'zustand';

import type { OrderBookLevel } from '../models';

export interface OrderBookSide {
  levels: Map<string, string>; // price -> size
}

export interface OrderBookState {
  symbol: string;
  bids: { price: string; size: string }[];
  asks: { price: string; size: string }[];
  lastUpdateId: number;
  isReady: boolean;
}

interface OrderbookStoreState {
  books: Record<string, OrderBookState>;
  _bidMaps: Record<string, Map<string, string>>;
  _askMaps: Record<string, Map<string, string>>;

  applySnapshot: (
    symbol: string,
    bids: OrderBookLevel[],
    asks: OrderBookLevel[],
    lastUpdateId: number
  ) => void;
  applyDiff: (
    symbol: string,
    bids: OrderBookLevel[],
    asks: OrderBookLevel[],
    updateId: number
  ) => void;
  flushToState: (symbol: string) => void;
  resetBook: (symbol: string) => void;
  getOrderBook: (symbol: string) => OrderBookState | undefined;
  clear: () => void;
}

function applyLevelsToMap(map: Map<string, string>, levels: OrderBookLevel[]): void {
  for (const { price, size } of levels) {
    if (size === '0' || parseFloat(size) === 0) {
      map.delete(price);
    } else {
      map.set(price, size);
    }
  }
}

function sortedBids(map: Map<string, string>, limit = 50): { price: string; size: string }[] {
  const entries: [string, number][] = [];
  for (const price of map.keys()) {
    entries.push([price, Number(price)]);
  }
  entries.sort((a, b) => b[1] - a[1]);

  const result: { price: string; size: string }[] = [];
  for (let i = 0; i < Math.min(limit, entries.length); i++) {
    const priceStr = entries[i][0];
    result.push({ price: priceStr, size: map.get(priceStr)! });
  }
  return result;
}

function sortedAsks(map: Map<string, string>, limit = 50): { price: string; size: string }[] {
  const entries: [string, number][] = [];
  for (const price of map.keys()) {
    entries.push([price, Number(price)]);
  }
  entries.sort((a, b) => a[1] - b[1]);

  const result: { price: string; size: string }[] = [];
  for (let i = 0; i < Math.min(limit, entries.length); i++) {
    const priceStr = entries[i][0];
    result.push({ price: priceStr, size: map.get(priceStr)! });
  }
  return result;
}

// Global RAF batch scheduler for smooth 60fps renders without React thrashing
let rafPending = false;
const pendingFlushes = new Set<string>();

export const useOrderbookStore = create<OrderbookStoreState>((set, get) => ({
  books: {},
  _bidMaps: {},
  _askMaps: {},

  applySnapshot: (symbol, bids, asks, lastUpdateId) => {
    const state = get();
    let bidMap = state._bidMaps[symbol];
    let askMap = state._askMaps[symbol];

    if (!bidMap) bidMap = new Map<string, string>();
    else bidMap.clear();

    if (!askMap) askMap = new Map<string, string>();
    else askMap.clear();

    for (const { price, size } of bids) bidMap.set(price, size);
    for (const { price, size } of asks) askMap.set(price, size);

    // Fast-path: Hyperliquid and REST snapshots already return sorted arrays
    const formattedBids = bids.slice(0, 50).map(b => ({ price: b.price, size: b.size }));
    const formattedAsks = asks.slice(0, 50).map(a => ({ price: a.price, size: a.size }));

    set(s => ({
      _bidMaps: { ...s._bidMaps, [symbol]: bidMap },
      _askMaps: { ...s._askMaps, [symbol]: askMap },
      books: {
        ...s.books,
        [symbol]: {
          symbol,
          bids: formattedBids,
          asks: formattedAsks,
          lastUpdateId,
          isReady: true,
        },
      },
    }));
  },

  applyDiff: (symbol, bids, asks) => {
    const state = get();
    const bidMap = state._bidMaps[symbol];
    const askMap = state._askMaps[symbol];
    if (!bidMap || !askMap) return;

    applyLevelsToMap(bidMap, bids);
    applyLevelsToMap(askMap, asks);

    pendingFlushes.add(symbol);
    if (!rafPending) {
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        pendingFlushes.forEach(sym => {
          get().flushToState(sym);
        });
        pendingFlushes.clear();
      });
    }
  },

  flushToState: symbol => {
    const state = get();
    const bidMap = state._bidMaps[symbol];
    const askMap = state._askMaps[symbol];
    if (!bidMap || !askMap) return;

    set(s => ({
      books: {
        ...s.books,
        [symbol]: {
          ...s.books[symbol],
          bids: sortedBids(bidMap),
          asks: sortedAsks(askMap),
        },
      },
    }));
  },

  resetBook: symbol => {
    set(state => {
      const books = { ...state.books };
      const bidMaps = { ...state._bidMaps };
      const askMaps = { ...state._askMaps };
      delete books[symbol];
      delete bidMaps[symbol];
      delete askMaps[symbol];
      return { books, _bidMaps: bidMaps, _askMaps: askMaps };
    });
  },

  getOrderBook: symbol => get().books[symbol],

  clear: () => set({ books: {}, _bidMaps: {}, _askMaps: {} }),
}));

// Non-hook accessor for WebSocket handlers
export const orderBookStore = {
  applySnapshot: (
    symbol: string,
    bids: OrderBookLevel[],
    asks: OrderBookLevel[],
    lastUpdateId: number
  ) => useOrderbookStore.getState().applySnapshot(symbol, bids, asks, lastUpdateId),
  applyDiff: (symbol: string, bids: OrderBookLevel[], asks: OrderBookLevel[], updateId: number) =>
    useOrderbookStore.getState().applyDiff(symbol, bids, asks, updateId),
  flushToState: (symbol: string) => useOrderbookStore.getState().flushToState(symbol),
  resetBook: (symbol: string) => useOrderbookStore.getState().resetBook(symbol),
  getOrderBook: (symbol: string) => useOrderbookStore.getState().getOrderBook(symbol),
  clear: () => useOrderbookStore.getState().clear(),
};
