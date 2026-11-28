import { create } from 'zustand';

import type { Order } from '../models';

interface OrderStoreState {
  orders: Record<string, Order>;
  setOrders: (orders: Order[]) => void;
  updateOrder: (order: Order) => void;
  removeOrder: (orderId: string) => void;
  getOpenOrders: () => Order[];
  clear: () => void;
}

const TERMINAL_STATUSES = new Set(['filled', 'canceled', 'rejected']);

export const useOrderStore = create<OrderStoreState>((set, get) => ({
  orders: {},
  setOrders: orders => {
    set(state => {
      const nextOrders: Record<string, Order> = {};
      orders.forEach(o => {
        const existing = state.orders[o.id];
        if (
          existing &&
          TERMINAL_STATUSES.has(existing.status) &&
          !TERMINAL_STATUSES.has(o.status)
        ) {
          nextOrders[o.id] = existing;
        } else {
          nextOrders[o.id] = o;
        }
      });
      return { orders: nextOrders };
    });
  },
  updateOrder: order =>
    set(state => {
      const existing = state.orders[order.id];
      if (
        existing &&
        TERMINAL_STATUSES.has(existing.status) &&
        !TERMINAL_STATUSES.has(order.status)
      ) {
        return state;
      }
      return {
        orders: {
          ...state.orders,
          [order.id]: order,
        },
      };
    }),
  removeOrder: orderId =>
    set(state => {
      const newOrders = { ...state.orders };
      delete newOrders[orderId];
      return { orders: newOrders };
    }),
  getOpenOrders: () =>
    Object.values(get().orders).filter(o => o.status === 'new' || o.status === 'partially_filled'),
  clear: () => set({ orders: {} }),
}));
