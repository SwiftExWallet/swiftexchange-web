import type React from 'react';

import { playNotificationSound } from '@/utils/notificationSound';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type NotificationType =
  'EVM_SWAP' | 'SEND' | 'RECEIVE' | 'BRIDGE' | 'STELLAR' | 'DYDX' | 'SYSTEM';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: React.ReactNode;
  timestamp: number;
  read: boolean;
  dontSave?: boolean;
  status?: 'success' | 'error' | 'warning' | 'info';
  txHash?: string;
  explorerUrl?: string;
}

export type ToastNotification = AppNotification;

export const NOTIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours TTL
export const MAX_STORED_NOTIFICATIONS = 50; // Cap to keep localStorage ultra-light

export function pruneNotifications(notifications: AppNotification[]): AppNotification[] {
  if (!Array.isArray(notifications)) return [];
  const cutoff = Date.now() - NOTIFICATION_TTL_MS;
  return notifications
    .filter(n => n && typeof n.timestamp === 'number' && n.timestamp >= cutoff)
    .slice(0, MAX_STORED_NOTIFICATIONS);
}

interface NotificationState {
  notifications: AppNotification[];
  activeToasts: ToastNotification[];
  enabledTypes: Record<NotificationType, boolean>;
  isGlobalPanelOpen: boolean;
  soundEnabled: boolean;
  permission: NotificationPermission | 'default';
  addNotification: (notification: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => void;
  removeNotification: (id: string) => void;
  clearAll: () => void;
  clearExpiredNotifications: () => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  toggleType: (type: NotificationType, enabled: boolean) => void;
  setGlobalPanelOpen: (isOpen: boolean) => void;
  setSoundEnabled: (enabled: boolean) => void;
  disablePushNotifications: () => void;
  enableAllNotifications: () => void;
  removeToast: (id: string) => void;
  showToast: (notification: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => void;
  requestPermission: () => Promise<NotificationPermission | undefined>;
  showBrowserNotification: (title: string, options?: NotificationOptions) => Promise<void>;
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      notifications: [],
      activeToasts: [],
      soundEnabled: true,
      enabledTypes: {
        EVM_SWAP: true,
        SEND: true,
        RECEIVE: true,
        BRIDGE: true,
        STELLAR: true,
        DYDX: true,
        SYSTEM: true,
      },
      isGlobalPanelOpen: false,
      permission:
        typeof window !== 'undefined' && 'Notification' in window
          ? Notification.permission
          : 'default',

      requestPermission: async () => {
        if (typeof window === 'undefined' || !('Notification' in window)) {
          return;
        }
        try {
          const result = await Notification.requestPermission();
          set({ permission: result });
          return result;
        } catch (err) {
          console.error(err);
        }
      },

      showBrowserNotification: async (title, options = {}) => {
        if (typeof window === 'undefined' || !('Notification' in window)) return;

        let currentPerm = get().permission;

        if (currentPerm === 'default') {
          const requested = await get().requestPermission();
          if (requested) currentPerm = requested;
        }

        if (Notification.permission === 'granted') {
          try {
            new Notification(title, {
              body: options.body,
              icon: options.icon || '/favicon.ico',
              tag: options.tag || '',
              ...options,
            });
          } catch (err) {
            console.error(err);
          }
        }
      },

      addNotification: notif => {
        const state = get();
        if (state.enabledTypes && state.enabledTypes[notif.type] === false) {
          // Check if all types were accidentally disabled
          const allFalse = Object.values(state.enabledTypes).every(v => v === false);
          if (!allFalse) return;
        }

        const newNotif = {
          ...notif,
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          read: false,
        };

        if (!notif.dontSave) {
          set(state => ({
            notifications: pruneNotifications([newNotif, ...state.notifications]),
          }));

          const bodyText =
            typeof notif.message === 'string'
              ? notif.message
              : 'Update regarding your wallet transfer/swap status.';

          get()
            .showBrowserNotification(notif.title, {
              body: bodyText,
              icon: '/favicon.ico',
              tag: notif.type,
            })
            .catch(() => {});
        }
      },

      removeNotification: id =>
        set(state => ({
          notifications: state.notifications.filter(n => n.id !== id),
        })),

      clearAll: () => set({ notifications: [] }),

      clearExpiredNotifications: () =>
        set(state => ({
          notifications: pruneNotifications(state.notifications),
        })),

      markAsRead: id =>
        set(state => ({
          notifications: state.notifications.map(n => (n.id === id ? { ...n, read: true } : n)),
        })),

      markAllAsRead: () =>
        set(state => ({
          notifications: state.notifications.map(n => ({ ...n, read: true })),
        })),

      toggleType: (type, enabled) =>
        set(state => ({
          enabledTypes: { ...state.enabledTypes, [type]: enabled },
        })),

      setGlobalPanelOpen: isOpen => set({ isGlobalPanelOpen: isOpen }),

      setSoundEnabled: enabled => set({ soundEnabled: enabled }),

      disablePushNotifications: () =>
        set(() => ({
          soundEnabled: false,
        })),

      enableAllNotifications: () =>
        set(() => {
          const all: Record<string, boolean> = {
            EVM_SWAP: true,
            SEND: true,
            RECEIVE: true,
            BRIDGE: true,
            STELLAR: true,
            DYDX: true,
            SYSTEM: true,
          };
          return { enabledTypes: all as Record<NotificationType, boolean>, soundEnabled: true };
        }),

      removeToast: id =>
        set(state => ({
          activeToasts: state.activeToasts.filter(t => t.id !== id),
        })),

      showToast: notif => {
        const state = get();

        // Prevent duplicate toast spam within 1.5s (e.g. from both REST submit and WebSocket event)
        const isDuplicate = state.activeToasts.some(
          t =>
            t.title === notif.title &&
            String(t.message) === String(notif.message) &&
            Date.now() - t.timestamp < 1500
        );
        if (isDuplicate) return;

        const newNotif = {
          ...notif,
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          read: false,
        };

        // Play subtle premium notification sound if enabled
        if (state.soundEnabled !== false) {
          playNotificationSound(notif.status || notif.title || notif.type);
        }

        set(state => {
          const updates: Partial<NotificationState> = {
            activeToasts: [...state.activeToasts, newNotif],
          };
          if (!notif.dontSave) {
            updates.notifications = pruneNotifications([newNotif, ...state.notifications]);
          }
          return updates;
        });

        if (!notif.dontSave) {
          const bodyText =
            typeof notif.message === 'string'
              ? notif.message
              : 'Update regarding your wallet transfer/swap status.';

          get()
            .showBrowserNotification(notif.title, {
              body: bodyText,
              icon: '/favicon.ico',
              tag: notif.type,
            })
            .catch(() => {});
        }

        setTimeout(() => {
          get().removeToast(newNotif.id);
        }, 5000);
      },
    }),
    {
      name: 'notification-storage',
      partialize: state => ({
        notifications: pruneNotifications(state.notifications).map(n => ({
          ...n,
          message:
            typeof n.message === 'string'
              ? n.message
              : typeof (n.message as any)?.props?.children === 'string'
                ? (n.message as any).props.children
                : typeof n.message === 'object' && n.message !== null
                  ? 'Notification update'
                  : String(n.message || ''),
        })),
        enabledTypes: state.enabledTypes,
        soundEnabled: state.soundEnabled,
      }),
      onRehydrateStorage: () => state => {
        if (state) {
          const defaultTypes: Record<NotificationType, boolean> = {
            EVM_SWAP: true,
            SEND: true,
            RECEIVE: true,
            BRIDGE: true,
            STELLAR: true,
            DYDX: true,
            SYSTEM: true,
          };

          // Auto-heal enabledTypes if corrupt or all false from previous mute bug
          const hasNoActiveTypes =
            !state.enabledTypes || Object.values(state.enabledTypes).every(v => v === false);

          if (hasNoActiveTypes) {
            state.enabledTypes = { ...defaultTypes };
            state.soundEnabled = true;
          }

          if (typeof state.soundEnabled !== 'boolean') {
            state.soundEnabled = true;
          }

          if (Array.isArray(state.notifications)) {
            state.notifications = pruneNotifications(
              state.notifications.map(n => {
                if (
                  typeof n.message === 'object' &&
                  n.message !== null &&
                  !('$$typeof' in (n.message as any))
                ) {
                  const child = (n.message as any)?.props?.children;
                  const text =
                    typeof child === 'string'
                      ? child
                      : Array.isArray(child)
                        ? child
                            .map((c: any) => (typeof c === 'string' ? c : c?.props?.children || ''))
                            .filter(Boolean)
                            .join(' ')
                        : 'Notification update';
                  return { ...n, message: text || 'Notification update' };
                }
                return n;
              })
            );
          }
        }
      },
    }
  )
);
