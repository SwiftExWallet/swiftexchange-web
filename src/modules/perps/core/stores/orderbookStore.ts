import { create } from 'zustand';

import type { OrderBookLevel } from '../models';

export interface DepthBufferMessage {
  U: number;
  u: number;
  pu?: number;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

export interface OrderBookSide {
  levels: Map<string, string>;
}

export interface OrderBookState {
  symbol: string;
  bids: { price: string; size: string }[];
  asks: { price: string; size: string }[];
  lastUpdateId: number;
  isReady: boolean;
  isSyncing: boolean;
}

interface OrderbookStoreState {
  books: Record<string, OrderBookState>;
  syncBuffers: Record<string, DepthBufferMessage[]>;
  _bidMaps: Record<string, Map<string, string>>;
  _askMaps: Record<string, Map<string, string>>;

  startSync: (symbol: string) => void;
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
    u: number,
    U?: number,
    pu?: number
  ) => void;
  reconcileAndFlush: (symbol: string, lastUpdateId: number) => number;
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

let rafPending = false;
const pendingFlushes = new Set<string>();
let isPageVisible = typeof document !== 'undefined' ? !document.hidden : true;
let hasBackgroundPending = false;

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    isPageVisible = !document.hidden;
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
  syncBuffers: {},
  _bidMaps: {},
  _askMaps: {},

  startSync: symbol => {
    const altKey = getAlternateSymbolKey(symbol);
    set(state => {
      const existing = state.books[symbol] || state.books[altKey];
      const entry: OrderBookState = {
        symbol,
        bids: existing?.bids ?? [],
        asks: existing?.asks ?? [],
        lastUpdateId: existing?.lastUpdateId ?? 0,
        isReady: existing?.isReady ?? false,
        isSyncing: true,
      };
      return {
        syncBuffers: {
          ...state.syncBuffers,
          [symbol]: [],
          [altKey]: [],
        },
        books: {
          ...state.books,
          [symbol]: entry,
          [altKey]: { ...entry, symbol: altKey },
        },
      };
    });

    setTimeout(() => {
      const current = get().books[symbol];
      if (current?.isSyncing) {
        get().reconcileAndFlush(symbol, 0);
      }
    }, 4000);
  },

  applySnapshot: (symbol, bids, asks, lastUpdateId) => {
    const state = get();
    const altKey = getAlternateSymbolKey(symbol);

    let bidMap = state._bidMaps[symbol] || state._bidMaps[altKey];
    let askMap = state._askMaps[symbol] || state._askMaps[altKey];

    if (!bidMap) bidMap = new Map<string, string>();
    else bidMap.clear();

    if (!askMap) askMap = new Map<string, string>();
    else askMap.clear();

    for (const { price, size } of bids) {
      if (size !== '0' && parseFloat(size) !== 0) {
        bidMap.set(price, size);
      }
    }
    for (const { price, size } of asks) {
      if (size !== '0' && parseFloat(size) !== 0) {
        askMap.set(price, size);
      }
    }

    const formattedBids = sortedBids(bidMap, 50);
    const formattedAsks = sortedAsks(askMap, 50);

    const existing = state.books[symbol] || state.books[altKey];
    const bookEntry: OrderBookState = {
      symbol,
      bids: formattedBids,
      asks: formattedAsks,
      lastUpdateId,
      isReady: true,
      isSyncing: existing?.isSyncing ?? true,
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

  applyDiff: (symbol, bids, asks, u, U, pu) => {
    const state = get();
    const altKey = getAlternateSymbolKey(symbol);
    const book = state.books[symbol] || state.books[altKey];

    if (book?.isSyncing) {
      const msg: DepthBufferMessage = {
        U: U ?? u,
        u,
        pu,
        bids,
        asks,
      };
      const currentBuf = state.syncBuffers[symbol] || state.syncBuffers[altKey] || [];
      const nextBuf = [...currentBuf, msg];
      if (nextBuf.length > 500) {
        nextBuf.splice(0, nextBuf.length - 500);
      }
      set(s => ({
        syncBuffers: {
          ...s.syncBuffers,
          [symbol]: nextBuf,
          [altKey]: nextBuf,
        },
      }));
      return;
    }

    if (book && u <= book.lastUpdateId) {
      return;
    }

    let bidMap = state._bidMaps[symbol] || state._bidMaps[altKey];
    let askMap = state._askMaps[symbol] || state._askMaps[altKey];
    if (!bidMap) {
      bidMap = new Map<string, string>();
      state._bidMaps[symbol] = bidMap;
      state._bidMaps[altKey] = bidMap;
    }
    if (!askMap) {
      askMap = new Map<string, string>();
      state._askMaps[symbol] = askMap;
      state._askMaps[altKey] = askMap;
    }

    applyLevelsToMap(bidMap, bids);
    applyLevelsToMap(askMap, asks);

    if (book) {
      book.lastUpdateId = u;
    }

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

  reconcileAndFlush: (symbol, lastUpdateId) => {
    const state = get();
    const altKey = getAlternateSymbolKey(symbol);
    const buffer = state.syncBuffers[symbol] || state.syncBuffers[altKey] || [];
    let bidMap = state._bidMaps[symbol] || state._bidMaps[altKey];
    let askMap = state._askMaps[symbol] || state._askMaps[altKey];

    if (!bidMap) bidMap = new Map<string, string>();
    if (!askMap) askMap = new Map<string, string>();

    let currentLastUpdateId = lastUpdateId;

    const newerEvents = lastUpdateId > 0 ? buffer.filter(msg => msg.u > lastUpdateId) : buffer;
    for (const msg of newerEvents) {
      applyLevelsToMap(bidMap, msg.bids);
      applyLevelsToMap(askMap, msg.asks);
      if (msg.u > currentLastUpdateId) {
        currentLastUpdateId = msg.u;
      }
    }

    const finalBids = sortedBids(bidMap, 50);
    const finalAsks = sortedAsks(askMap, 50);

    const updatedBook: OrderBookState = {
      symbol,
      bids: finalBids,
      asks: finalAsks,
      lastUpdateId: currentLastUpdateId,
      isReady: true,
      isSyncing: false,
    };

    set(s => {
      const nextBuffers = { ...s.syncBuffers };
      delete nextBuffers[symbol];
      delete nextBuffers[altKey];
      return {
        _bidMaps: { ...s._bidMaps, [symbol]: bidMap, [altKey]: bidMap },
        _askMaps: { ...s._askMaps, [symbol]: askMap, [altKey]: askMap },
        syncBuffers: nextBuffers,
        books: {
          ...s.books,
          [symbol]: updatedBook,
          [altKey]: { ...updatedBook, symbol: altKey },
        },
      };
    });
    return currentLastUpdateId;
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
      bids: sortedBids(bidMap, 50),
      asks: sortedAsks(askMap, 50),
      lastUpdateId: currentBook?.lastUpdateId ?? 0,
      isReady: true,
      isSyncing: currentBook?.isSyncing ?? false,
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
      const syncBuffers = { ...state.syncBuffers };
      const bidMaps = { ...state._bidMaps };
      const askMaps = { ...state._askMaps };
      delete books[symbol];
      delete books[altKey];
      delete syncBuffers[symbol];
      delete syncBuffers[altKey];
      delete bidMaps[symbol];
      delete bidMaps[altKey];
      delete askMaps[symbol];
      delete askMaps[altKey];
      return { books, syncBuffers, _bidMaps: bidMaps, _askMaps: askMaps };
    });
  },

  getOrderBook: symbol => {
    const state = get();
    const altKey = getAlternateSymbolKey(symbol);
    return state.books[symbol] || state.books[altKey];
  },

  clear: () => set({ books: {}, syncBuffers: {}, _bidMaps: {}, _askMaps: {} }),
}));

export const orderBookStore = {
  startSync: (symbol: string) => useOrderbookStore.getState().startSync(symbol),
  applySnapshot: (
    symbol: string,
    bids: OrderBookLevel[],
    asks: OrderBookLevel[],
    lastUpdateId: number
  ) => useOrderbookStore.getState().applySnapshot(symbol, bids, asks, lastUpdateId),
  applyDiff: (
    symbol: string,
    bids: OrderBookLevel[],
    asks: OrderBookLevel[],
    u: number,
    U?: number,
    pu?: number
  ) => useOrderbookStore.getState().applyDiff(symbol, bids, asks, u, U, pu),
  reconcileAndFlush: (symbol: string, lastUpdateId: number): number =>
    useOrderbookStore.getState().reconcileAndFlush(symbol, lastUpdateId),
  flushToState: (symbol: string) => useOrderbookStore.getState().flushToState(symbol),
  resetBook: (symbol: string) => useOrderbookStore.getState().resetBook(symbol),
  getOrderBook: (symbol: string) => useOrderbookStore.getState().getOrderBook(symbol),
  clear: () => useOrderbookStore.getState().clear(),
};
