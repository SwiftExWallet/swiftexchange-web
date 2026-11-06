import { Clock, ExternalLink, Search, Volume2, VolumeX, X } from 'lucide-react';
import React from 'react';

import { type NotificationType } from '@/store/notificationStore';

import {
  formatRelativeTime,
  renderSafeMessage,
  useNotificationPanel,
} from '../../hook/useNotificationPanel';
import { getFintechNotificationBadge } from './NotificationBadgeHelper';

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  filterType?: NotificationType;
}

// ============================================================================
// Sub-Components
// ============================================================================

interface HeaderProps {
  count: number;
  soundEnabled: boolean;
  search: string;
  onSearchChange: (val: string) => void;
  onToggleSound: () => void;
  onClose: () => void;
}

const NotificationHeader: React.FC<HeaderProps> = ({
  count,
  soundEnabled,
  search,
  onSearchChange,
  onToggleSound,
  onClose,
}) => {
  const soundLabel = soundEnabled ? 'Mute notification sound' : 'Enable notification sound';

  return (
    <div className="flex flex-col gap-3.5 border-b border-[var(--color-border)] p-4 bg-[var(--color-bg-secondary)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <h2 className="text-[15px] font-bold tracking-tight text-[var(--color-text-primary)]">
            Activity
          </h2>
          {count > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand/15 text-brand border border-brand/30">
              {count}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onToggleSound}
            title={soundLabel}
            aria-label={soundLabel}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              soundEnabled
                ? 'text-brand bg-brand/10 hover:bg-brand/20'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]'
            }`}
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
          <button
            onClick={onClose}
            aria-label="Close activity panel"
            className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] rounded-lg transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <Search size={13} className="text-[var(--color-text-muted)]" />
        </div>
        <input
          type="text"
          placeholder="Search activity..."
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] py-2 pl-9 pr-3 text-[12px] font-medium text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] outline-none transition-all focus:border-brand focus:bg-[var(--color-bg-secondary)]"
        />
      </div>
    </div>
  );
};

interface ItemProps {
  notification: any;
  onMarkAsRead: (id: string) => void;
  onDismiss: (e: React.MouseEvent, id: string) => void;
}

const NotificationItem: React.FC<ItemProps> = ({ notification, onMarkAsRead, onDismiss }) => {
  const badge = getFintechNotificationBadge(notification);

  return (
    <div
      onClick={() => onMarkAsRead(notification.id)}
      className={`flex cursor-pointer gap-3.5 px-5 py-3.5 transition-all hover:bg-[var(--color-bg-hover)]/30 group/item ${
        notification.read ? 'opacity-60' : 'opacity-100'
      }`}
    >
      <div
        className={`mt-0.5 shrink-0 flex h-8 w-8 items-center justify-center rounded-xl border ${badge.badgeBg}`}
      >
        {badge.icon}
      </div>

      <div className="min-w-0 flex-1 relative">
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[13px] font-semibold text-[var(--color-text-primary)] tracking-tight truncate">
              {notification.title}
            </span>
            {badge.tag && (
              <span
                className={`text-[9px] font-bold px-1.5 py-0.5 rounded border leading-none ${badge.tagColor}`}
              >
                {badge.tag}
              </span>
            )}
          </div>
          <span className="text-[11px] text-[var(--color-text-muted)] font-medium shrink-0 ml-auto">
            {formatRelativeTime(notification.timestamp)}
          </span>
        </div>

        <div className="break-words text-[12px] text-[var(--color-text-secondary)] font-normal leading-relaxed pr-6">
          {renderSafeMessage(notification.message)}
        </div>

        {notification.explorerUrl && (
          <div className="mt-1.5 flex items-center gap-1">
            <a
              href={notification.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-brand font-semibold hover:underline"
              onClick={e => e.stopPropagation()}
            >
              <span>Explorer</span>
              <ExternalLink size={11} />
            </a>
          </div>
        )}

        <button
          onClick={e => onDismiss(e, notification.id)}
          className="absolute top-0 right-0 p-1 opacity-0 transition-opacity hover:text-[var(--color-text-primary)] group-hover/item:opacity-100 text-[var(--color-text-muted)] cursor-pointer"
          title="Dismiss"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
};

const EmptyNotificationState: React.FC = () => (
  <div className="flex h-full flex-col items-center justify-center p-6 text-center text-[var(--color-text-muted)]">
    <div className="w-11 h-11 rounded-2xl bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] flex items-center justify-center mb-3 text-[var(--color-text-muted)]">
      <Clock size={20} />
    </div>
    <p className="text-[14px] font-semibold text-[var(--color-text-primary)]">No recent activity</p>
    <p className="text-[12px] text-[var(--color-text-muted)] mt-1 max-w-[240px]">
      Your trading, swap, and transfer orders will appear here.
    </p>
  </div>
);

interface FooterProps {
  soundEnabled: boolean;
  onToggleSound: () => void;
  onClearAll: () => void;
}

const NotificationFooter: React.FC<FooterProps> = ({ soundEnabled, onToggleSound, onClearAll }) => (
  <div className="mt-auto flex gap-2.5 border-t border-[var(--color-border)] p-4 bg-[var(--color-bg-secondary)]">
    <button
      onClick={onToggleSound}
      className="flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] py-2 px-3 text-[11px] font-semibold text-[var(--color-text-secondary)] transition-all hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] cursor-pointer"
    >
      {soundEnabled ? 'Mute Sound' : 'Unmute Sound'}
    </button>
    <button
      onClick={onClearAll}
      className="rounded-xl border border-rose-500/25 bg-rose-500/10 py-2 px-4 text-[11px] font-semibold text-rose-500 hover:bg-rose-500/20 transition-all cursor-pointer"
    >
      Clear All
    </button>
  </div>
);

// ============================================================================
// Main Component
// ============================================================================

export const NotificationPanel: React.FC<NotificationPanelProps> = ({
  isOpen,
  onClose,
  filterType,
}) => {
  const {
    search,
    setSearch,
    soundEnabled,
    toggleSound,
    clearAll,
    markAsRead,
    dismissNotification,
    displayNotifications,
  } = useNotificationPanel(filterType);

  if (!isOpen) return null;

  return (
    <div className="fixed right-0 top-0 z-[100] flex h-full w-[390px] max-w-full flex-col border-l border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] font-sans shadow-2xl animate-in slide-in-from-right duration-200">
      <NotificationHeader
        count={displayNotifications.length}
        soundEnabled={soundEnabled}
        search={search}
        onSearchChange={setSearch}
        onToggleSound={toggleSound}
        onClose={onClose}
      />

      <div
        className="flex-1 overflow-y-auto overflow-x-hidden [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {displayNotifications.length > 0 ? (
          <div className="flex flex-col divide-y divide-[var(--color-border)]/60">
            <div className="px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] bg-[var(--color-bg-secondary)]/60 border-b border-[var(--color-border)]/50">
              Recent Transactions
            </div>
            {displayNotifications.map(notif => (
              <NotificationItem
                key={notif.id}
                notification={notif}
                onMarkAsRead={markAsRead}
                onDismiss={dismissNotification}
              />
            ))}
          </div>
        ) : (
          <EmptyNotificationState />
        )}
      </div>

      <NotificationFooter
        soundEnabled={soundEnabled}
        onToggleSound={toggleSound}
        onClearAll={clearAll}
      />
    </div>
  );
};
