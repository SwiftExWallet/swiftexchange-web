import { create } from 'zustand';

import type { AsterUserTrade, IncomeRecord } from '../../adapters/aster/types/account';
import type { AsterOrderResponse } from '../../adapters/aster/types/orders';

interface HistoryStoreState {
  orderHistory: AsterOrderResponse[];
  tradeHistory: AsterUserTrade[];
  transactionHistory: IncomeRecord[];

  hasFetchedOrderHistory: boolean;
  hasFetchedTradeHistory: boolean;
  hasFetchedTransactionHistory: boolean;

  hasMoreOrderHistory: boolean;
  hasMoreTradeHistory: boolean;
  hasMoreTransactionHistory: boolean;

  oldestOrderTime: number;
  oldestTradeTime: number;
  oldestIncomeTime: number;

  recentOrders: AsterOrderResponse[];
  recentTrades: AsterUserTrade[];
  recentIncome: IncomeRecord[];

  setHasFetchedOrderHistory: (val: boolean) => void;
  setHasFetchedTradeHistory: (val: boolean) => void;
  setHasFetchedTransactionHistory: (val: boolean) => void;

  setOrderHistory: (orders: AsterOrderResponse[], hasMore?: boolean) => void;
  loadPersistedOrderHistory: (orders: AsterOrderResponse[]) => void;
  appendOrderHistory: (orders: AsterOrderResponse[], hasMore?: boolean) => void;
  prependOrder: (order: AsterOrderResponse) => void;

  setTradeHistory: (trades: AsterUserTrade[], hasMore?: boolean) => void;
  loadPersistedTradeHistory: (trades: AsterUserTrade[]) => void;
  appendTradeHistory: (trades: AsterUserTrade[], hasMore?: boolean) => void;
  prependTrade: (trade: AsterUserTrade) => void;

  setTransactionHistory: (income: IncomeRecord[], hasMore?: boolean) => void;
  appendTransactionHistory: (income: IncomeRecord[], hasMore?: boolean) => void;
  prependIncome: (income: IncomeRecord) => void;

  addOrder: (order: AsterOrderResponse) => void;
  addTrade: (trade: AsterUserTrade) => void;
  addIncome: (income: IncomeRecord) => void;

  clear: () => void;
}

const getOrderTime = (o: AsterOrderResponse): number => o.updateTime || o.time || 0;
const getTradeTime = (t: AsterUserTrade): number => t.time || 0;
const getIncomeTime = (i: IncomeRecord): number => i.time || 0;

const getOrderId = (o: AsterOrderResponse): string => String(o.orderId || o.clientOrderId || '');
const getTradeId = (t: AsterUserTrade): string => String(t.id || '');
const getIncomeId = (i: IncomeRecord): string =>
  `${i.tranId || ''}_${i.time || ''}_${i.incomeType || ''}_${i.symbol || ''}`;

export const useHistoryStore = create<HistoryStoreState>((set, get) => ({
  orderHistory: [],
  tradeHistory: [],
  transactionHistory: [],

  hasFetchedOrderHistory: false,
  hasFetchedTradeHistory: false,
  hasFetchedTransactionHistory: false,

  hasMoreOrderHistory: true,
  hasMoreTradeHistory: true,
  hasMoreTransactionHistory: true,

  oldestOrderTime: 0,
  oldestTradeTime: 0,
  oldestIncomeTime: 0,

  recentOrders: [],
  recentTrades: [],
  recentIncome: [],

  setHasFetchedOrderHistory: val => set({ hasFetchedOrderHistory: val }),
  setHasFetchedTradeHistory: val => set({ hasFetchedTradeHistory: val }),
  setHasFetchedTransactionHistory: val => set({ hasFetchedTransactionHistory: val }),

  setOrderHistory: (orders, hasMore = false) => {
    const seen = new Set<string>();
    const deduped: AsterOrderResponse[] = [];
    for (const o of orders) {
      const id = getOrderId(o);
      if (!seen.has(id)) {
        seen.add(id);
        deduped.push(o);
      }
    }
    deduped.sort((a, b) => getOrderTime(b) - getOrderTime(a));
    const oldest = deduped.length > 0 ? getOrderTime(deduped[deduped.length - 1]) : Date.now();

    set({
      orderHistory: deduped,
      recentOrders: deduped.slice(0, 100),
      hasFetchedOrderHistory: true,
      hasMoreOrderHistory: hasMore,
      oldestOrderTime: oldest,
    });
  },

  loadPersistedOrderHistory: orders => {
    const seen = new Set<string>();
    const deduped: AsterOrderResponse[] = [];
    for (const o of orders) {
      const id = getOrderId(o);
      if (!seen.has(id)) {
        seen.add(id);
        deduped.push(o);
      }
    }
    deduped.sort((a, b) => getOrderTime(b) - getOrderTime(a));
    const oldest = deduped.length > 0 ? getOrderTime(deduped[deduped.length - 1]) : Date.now();

    set({
      orderHistory: deduped,
      recentOrders: deduped.slice(0, 100),
      hasMoreOrderHistory: true,
      oldestOrderTime: oldest,
    });
  },

  appendOrderHistory: (newOrders, hasMore = false) => {
    const existing = get().orderHistory;
    const seen = new Set<string>();
    const combined: AsterOrderResponse[] = [];

    for (const o of existing) {
      const id = getOrderId(o);
      if (!seen.has(id)) {
        seen.add(id);
        combined.push(o);
      }
    }
    for (const o of newOrders) {
      const id = getOrderId(o);
      if (!seen.has(id)) {
        seen.add(id);
        combined.push(o);
      }
    }
    combined.sort((a, b) => getOrderTime(b) - getOrderTime(a));
    const oldest = combined.length > 0 ? getOrderTime(combined[combined.length - 1]) : Date.now();

    set({
      orderHistory: combined,
      recentOrders: combined.slice(0, 100),
      hasMoreOrderHistory: hasMore,
      oldestOrderTime: oldest,
    });
  },

  prependOrder: order => {
    set(state => {
      const id = getOrderId(order);
      const existingIndex = state.orderHistory.findIndex(o => getOrderId(o) === id);

      let nextOrderHistory: AsterOrderResponse[];
      if (existingIndex >= 0) {
        nextOrderHistory = [...state.orderHistory];
        nextOrderHistory[existingIndex] = { ...nextOrderHistory[existingIndex], ...order };
        nextOrderHistory.sort((a, b) => getOrderTime(b) - getOrderTime(a));
      } else {
        nextOrderHistory = [order, ...state.orderHistory];
      }

      return {
        orderHistory: nextOrderHistory,
        recentOrders: nextOrderHistory.slice(0, 100),
      };
    });
  },

  setTradeHistory: (trades, hasMore = false) => {
    const seen = new Set<string>();
    const deduped: AsterUserTrade[] = [];
    for (const t of trades) {
      const id = getTradeId(t);
      if (!seen.has(id)) {
        seen.add(id);
        deduped.push(t);
      }
    }
    deduped.sort((a, b) => getTradeTime(b) - getTradeTime(a));
    const oldest = deduped.length > 0 ? getTradeTime(deduped[deduped.length - 1]) : Date.now();

    set({
      tradeHistory: deduped,
      recentTrades: deduped.slice(0, 100),
      hasFetchedTradeHistory: true,
      hasMoreTradeHistory: hasMore,
      oldestTradeTime: oldest,
    });
  },

  loadPersistedTradeHistory: trades => {
    const seen = new Set<string>();
    const deduped: AsterUserTrade[] = [];
    for (const t of trades) {
      const id = getTradeId(t);
      if (!seen.has(id)) {
        seen.add(id);
        deduped.push(t);
      }
    }
    deduped.sort((a, b) => getTradeTime(b) - getTradeTime(a));
    const oldest = deduped.length > 0 ? getTradeTime(deduped[deduped.length - 1]) : Date.now();

    set({
      tradeHistory: deduped,
      recentTrades: deduped.slice(0, 100),
      hasMoreTradeHistory: true,
      oldestTradeTime: oldest,
    });
  },

  appendTradeHistory: (newTrades, hasMore = false) => {
    const existing = get().tradeHistory;
    const seen = new Set<string>();
    const combined: AsterUserTrade[] = [];

    for (const t of existing) {
      const id = getTradeId(t);
      if (!seen.has(id)) {
        seen.add(id);
        combined.push(t);
      }
    }
    for (const t of newTrades) {
      const id = getTradeId(t);
      if (!seen.has(id)) {
        seen.add(id);
        combined.push(t);
      }
    }
    combined.sort((a, b) => getTradeTime(b) - getTradeTime(a));
    const oldest = combined.length > 0 ? getTradeTime(combined[combined.length - 1]) : Date.now();

    set({
      tradeHistory: combined,
      recentTrades: combined.slice(0, 100),
      hasMoreTradeHistory: hasMore,
      oldestTradeTime: oldest,
    });
  },

  prependTrade: trade => {
    set(state => {
      const id = getTradeId(trade);
      const existingIndex = state.tradeHistory.findIndex(t => getTradeId(t) === id);

      let nextTrades: AsterUserTrade[];
      if (existingIndex >= 0) {
        nextTrades = [...state.tradeHistory];
        nextTrades[existingIndex] = { ...nextTrades[existingIndex], ...trade };
        nextTrades.sort((a, b) => getTradeTime(b) - getTradeTime(a));
      } else {
        nextTrades = [trade, ...state.tradeHistory];
      }

      return {
        tradeHistory: nextTrades,
        recentTrades: nextTrades.slice(0, 100),
      };
    });
  },

  setTransactionHistory: (income, hasMore = false) => {
    const seen = new Set<string>();
    const deduped: IncomeRecord[] = [];
    for (const i of income) {
      const id = getIncomeId(i);
      if (!seen.has(id)) {
        seen.add(id);
        deduped.push(i);
      }
    }
    deduped.sort((a, b) => getIncomeTime(b) - getIncomeTime(a));
    const oldest = deduped.length > 0 ? getIncomeTime(deduped[deduped.length - 1]) : Date.now();

    set({
      transactionHistory: deduped,
      recentIncome: deduped.slice(0, 100),
      hasFetchedTransactionHistory: true,
      hasMoreTransactionHistory: hasMore,
      oldestIncomeTime: oldest,
    });
  },

  appendTransactionHistory: (newIncome, hasMore = false) => {
    const existing = get().transactionHistory;
    const seen = new Set<string>();
    const combined: IncomeRecord[] = [];

    for (const i of existing) {
      const id = getIncomeId(i);
      if (!seen.has(id)) {
        seen.add(id);
        combined.push(i);
      }
    }
    for (const i of newIncome) {
      const id = getIncomeId(i);
      if (!seen.has(id)) {
        seen.add(id);
        combined.push(i);
      }
    }
    combined.sort((a, b) => getIncomeTime(b) - getIncomeTime(a));
    const oldest = combined.length > 0 ? getIncomeTime(combined[combined.length - 1]) : Date.now();

    set({
      transactionHistory: combined,
      recentIncome: combined.slice(0, 100),
      hasMoreTransactionHistory: hasMore,
      oldestIncomeTime: oldest,
    });
  },

  prependIncome: income => {
    set(state => {
      const id = getIncomeId(income);
      const existingIndex = state.transactionHistory.findIndex(i => getIncomeId(i) === id);

      let nextIncome: IncomeRecord[];
      if (existingIndex >= 0) {
        nextIncome = [...state.transactionHistory];
        nextIncome[existingIndex] = { ...nextIncome[existingIndex], ...income };
        nextIncome.sort((a, b) => getIncomeTime(b) - getIncomeTime(a));
      } else {
        nextIncome = [income, ...state.transactionHistory];
      }

      return {
        transactionHistory: nextIncome,
        recentIncome: nextIncome.slice(0, 100),
      };
    });
  },

  addOrder: order => get().prependOrder(order),
  addTrade: trade => get().prependTrade(trade),
  addIncome: income => get().prependIncome(income),

  clear: () =>
    set({
      orderHistory: [],
      tradeHistory: [],
      transactionHistory: [],
      recentOrders: [],
      recentTrades: [],
      recentIncome: [],
      hasFetchedOrderHistory: false,
      hasFetchedTradeHistory: false,
      hasFetchedTransactionHistory: false,
      hasMoreOrderHistory: true,
      hasMoreTradeHistory: true,
      hasMoreTransactionHistory: true,
      oldestOrderTime: 0,
      oldestTradeTime: 0,
      oldestIncomeTime: 0,
    }),
}));
