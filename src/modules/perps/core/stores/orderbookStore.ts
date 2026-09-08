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
  const keys = Array.from(map.keys());
  if (keys.length <= limit) {
    return keys
      .map(k => ({ price: k, num: Number(k) }))
      .sort((a, b) => b.num - a.num)
      .map(item => ({ price: item.price, size: map.get(item.price)! }));
  }

  const sortedKeys = keys.map(k => ({ price: k, num: Number(k) })).sort((a, b) => b.num - a.num);

  if (sortedKeys.length > 150) {
    for (let i = 100; i < sortedKeys.length; i++) {
      map.delete(sortedKeys[i].price);
    }
  }

  return sortedKeys
    .slice(0, limit)
    .map(item => ({ price: item.price, size: map.get(item.price)! }));
}

function sortedAsks(map: Map<string, string>, limit = 50): { price: string; size: string }[] {
  const keys = Array.from(map.keys());
  if (keys.length <= limit) {
    return keys
      .map(k => ({ price: k, num: Number(k) }))
      .sort((a, b) => a.num - b.num)
      .map(item => ({ price: item.price, size: map.get(item.price)! }));
  }

  const sortedKeys = keys.map(k => ({ price: k, num: Number(k) })).sort((a, b) => a.num - b.num);

  if (sortedKeys.length > 150) {
    for (let i = 100; i < sortedKeys.length; i++) {
      map.delete(sortedKeys[i].price);
    }
  }

  return sortedKeys
    .slice(0, limit)
    .map(item => ({ price: item.price, size: map.get(item.price)! }));
}

// Global RAF batch scheduler & Page Visibility state to eliminate background tab thrashing
let rafPending = false;
const pendingFlushes = new Set<string>();
let isPageVisible = typeof document !== 'undefined' ? !document.hidden : true;
let hasBackgroundPending = false;

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    isPageVisible = !document.hidden;
    // When returning to screen, perform a single smooth flush of all updated orderbooks
    if (isPageVisible && hasBackgroundPending) {
      hasBackgroundPending = false;
      pendingFlushes.forEach(sym => {
        useOrderbookStore.getState().flushToState(sym);
      });
      pendingFlushes.clear();
    }
  });
}

function getAlternateSymbolKey(symbol: string): string {
  if (symbol.includes('-')) {
    return symbol.replace('-', '');
  }
  if (symbol.endsWith('USDT')) {
    return symbol.replace(/USDT$/, '-USDT');
  }
  if (symbol.endsWith('USDC')) {
    return symbol.replace(/USDC$/, '-USDC');
  }
  return symbol;
}

export const useOrderbookStore = create<OrderbookStoreState>((set, get) => ({
  books: {},
  _bidMaps: {},
  _askMaps: {},

  applySnapshot: (symbol, bids, asks, lastUpdateId) => {
    const state = get();
    const altKey = getAlternateSymbolKey(symbol);

    let bidMap = state._bidMaps[symbol] || state._bidMaps[altKey];
    let askMap = state._askMaps[symbol] || state._askMaps[altKey];

    if (!bidMap) bidMap = new Map<string, string>();
    else bidMap.clear();

    if (!askMap) askMap = new Map<string, string>();
    else askMap.clear();

    for (const { price, size } of bids) bidMap.set(price, size);
    for (const { price, size } of asks) askMap.set(price, size);

    const formattedBids = bids.slice(0, 50).map(b => ({ price: b.price, size: b.size }));
    const formattedAsks = asks.slice(0, 50).map(a => ({ price: a.price, size: a.size }));

    const bookEntry: OrderBookState = {
      symbol,
      bids: formattedBids,
      asks: formattedAsks,
      lastUpdateId,
      isReady: true,
    };

    set(s => ({
      _bidMaps: { ...s._bidMaps, [symbol]: bidMap, [altKey]: bidMap },
      _askMaps: { ...s._askMaps, [symbol]: askMap, [altKey]: askMap },
      books: {
        ...s.books,
        [symbol]: bookEntry,
        [altKey]: { ...bookEntry, symbol: altKey },
      },
    }));
  },

  applyDiff: (symbol, bids, asks) => {
    const state = get();
    const altKey = getAlternateSymbolKey(symbol);
    const bidMap = state._bidMaps[symbol] || state._bidMaps[altKey];
    const askMap = state._askMaps[symbol] || state._askMaps[altKey];
    if (!bidMap || !askMap) return;

    applyLevelsToMap(bidMap, bids);
    applyLevelsToMap(askMap, asks);

    // If tab is currently hidden/away from screen, only mutate maps in memory.
    // Do NOT trigger requestAnimationFrame or React re-renders while away.
    if (!isPageVisible) {
      pendingFlushes.add(symbol);
      hasBackgroundPending = true;
      return;
    }

    pendingFlushes.add(symbol);
    if (!rafPending) {
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        if (!isPageVisible) return;
        pendingFlushes.forEach(sym => {
          get().flushToState(sym);
        });
        pendingFlushes.clear();
      });
    }
  },

  flushToState: symbol => {
    const state = get();
    const altKey = getAlternateSymbolKey(symbol);
    const bidMap = state._bidMaps[symbol] || state._bidMaps[altKey];
    const askMap = state._askMaps[symbol] || state._askMaps[altKey];
    if (!bidMap || !askMap) return;

    const currentBook = state.books[symbol] || state.books[altKey];
    const updatedBook: OrderBookState = {
      symbol,
      bids: sortedBids(bidMap),
      asks: sortedAsks(askMap),
      lastUpdateId: currentBook?.lastUpdateId ?? 0,
      isReady: true,
    };

    set(s => ({
      books: {
        ...s.books,
        [symbol]: updatedBook,
        [altKey]: { ...updatedBook, symbol: altKey },
      },
    }));
  },

  resetBook: symbol => {
    const altKey = getAlternateSymbolKey(symbol);
    set(state => {
      const books = { ...state.books };
      const bidMaps = { ...state._bidMaps };
      const askMaps = { ...state._askMaps };
      delete books[symbol];
      delete books[altKey];
      delete bidMaps[symbol];
      delete bidMaps[altKey];
      delete askMaps[symbol];
      delete askMaps[altKey];
      return { books, _bidMaps: bidMaps, _askMaps: askMaps };
    });
  },

  getOrderBook: symbol => {
    const state = get();
    const altKey = getAlternateSymbolKey(symbol);
    return state.books[symbol] || state.books[altKey];
  },

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
