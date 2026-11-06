import React, { useCallback, useMemo, useState } from 'react';

import { type NotificationType, useNotificationStore } from '@/store/notificationStore';
import { playNotificationSound } from '@/utils/notificationSound';

const IGNORED_MESSAGE_PATTERNS = ['user cancelled', 'user rejected', 'action_rejected', '4001'];

export function renderSafeMessage(message: unknown): React.ReactNode {
  if (typeof message === 'string' || typeof message === 'number') {
    return message;
  }
  if (React.isValidElement(message)) {
    return message;
  }
  if (message && typeof message === 'object') {
    const msgObj = message as Record<string, any>;
    const children = msgObj.props?.children;

    if (typeof children === 'string') {
      return children;
    }
    if (Array.isArray(children)) {
      return children
        .map((c: any) => (typeof c === 'string' ? c : c?.props?.children || ''))
        .filter(Boolean)
        .join(' ');
    }
    if (typeof msgObj.text === 'string') return msgObj.text;
    if (typeof msgObj.message === 'string') return msgObj.message;
    return String(msgObj.title || '');
  }
  return null;
}

export function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return '';
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

export function useNotificationPanel(filterType?: NotificationType) {
  const [search, setSearch] = useState('');

  const { notifications, clearAll, markAsRead, removeNotification, soundEnabled, setSoundEnabled } =
    useNotificationStore();

  const toggleSound = useCallback(() => {
    const nextState = !soundEnabled;
    setSoundEnabled(nextState);
    if (nextState) {
      playNotificationSound('success');
    }
  }, [soundEnabled, setSoundEnabled]);

  const dismissNotification = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      removeNotification(id);
    },
    [removeNotification]
  );

  const displayNotifications = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return notifications.filter(n => {
      const msgStr = typeof n.message === 'string' ? n.message.toLowerCase() : '';

      // Filter noise out of user-facing history
      if (IGNORED_MESSAGE_PATTERNS.some(pattern => msgStr.includes(pattern))) {
        return false;
      }

      if (filterType && n.type !== filterType) {
        return false;
      }

      if (
        normalizedSearch &&
        !n.title.toLowerCase().includes(normalizedSearch) &&
        !msgStr.includes(normalizedSearch)
      ) {
        return false;
      }

      return true;
    });
  }, [notifications, filterType, search]);

  return {
    search,
    setSearch,
    soundEnabled,
    toggleSound,
    clearAll,
    markAsRead,
    dismissNotification,
    displayNotifications,
  };
}
