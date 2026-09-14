import {
  Activity,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  Layers,
  Search,
  Settings,
  Sliders,
  Sparkles,
  X,
  XCircle,
} from 'lucide-react';
import React, { useState } from 'react';

import { type NotificationType, useNotificationStore } from '@/store/notificationStore';

function renderSafeMessage(message: any): React.ReactNode {
  if (typeof message === 'string' || typeof message === 'number') {
    return message;
  }
  if (React.isValidElement(message)) {
    return message;
  }
  if (message && typeof message === 'object') {
    if (message.props && message.props.children) {
      if (typeof message.props.children === 'string') {
        return message.props.children;
      }
      if (Array.isArray(message.props.children)) {
        return message.props.children
          .map((c: any) => (typeof c === 'string' ? c : c?.props?.children || ''))
          .filter(Boolean)
          .join(' ');
      }
    }
    if (typeof message.text === 'string') return message.text;
    if (typeof message.message === 'string') return message.message;
    return String(message.title || '');
  }
  return null;
}

function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return '';
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  filterType?: NotificationType;
}

const typeConfig: Record<
  NotificationType,
  { icon: React.ReactNode; color: string; label: string }
> = {
  EVM_SWAP: {
    icon: (
      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.15)]">
        <ArrowLeftRight size={15} />
      </div>
    ),
    color: 'text-cyan-400',
    label: 'Swap',
  },
  SEND: {
    icon: (
      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.15)]">
        <ArrowUpRight size={15} />
      </div>
    ),
    color: 'text-emerald-400',
    label: 'Send',
  },
  RECEIVE: {
    icon: (
      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400 shadow-[0_0_12px_rgba(139,92,246,0.15)]">
        <ArrowDownLeft size={15} />
      </div>
    ),
    color: 'text-violet-400',
    label: 'Receive',
  },
  BRIDGE: {
    icon: (
      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shadow-[0_0_12px_rgba(99,102,241,0.15)]">
        <Layers size={15} />
      </div>
    ),
    color: 'text-indigo-400',
    label: 'Bridge',
  },
  STELLAR: {
    icon: (
      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.15)]">
        <Sparkles size={15} />
      </div>
    ),
    color: 'text-amber-400',
    label: 'Stellar',
  },
  DYDX: {
    icon: (
      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 shadow-[0_0_12px_rgba(249,115,22,0.15)]">
        <Activity size={15} />
      </div>
    ),
    color: 'text-orange-400',
    label: 'Perps',
  },
  SYSTEM: {
    icon: (
      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-500/10 border border-slate-500/20 text-slate-400 shadow-[0_0_12px_rgba(148,163,184,0.15)]">
        <Sliders size={15} />
      </div>
    ),
    color: 'text-slate-400',
    label: 'System',
  },
};

export const NotificationPanel: React.FC<NotificationPanelProps> = ({
  isOpen,
  onClose,
  filterType,
}) => {
  const [search, setSearch] = useState('');

  const { notifications, clearAll, markAsRead, disablePushNotifications } = useNotificationStore();

  if (!isOpen) return null;

  const displayNotifications = notifications.filter(n => {
    // Filter noise out of user-facing history
    const msgStr = typeof n.message === 'string' ? n.message.toLowerCase() : '';
    if (
      msgStr.includes('user cancelled') ||
      msgStr.includes('user rejected') ||
      msgStr.includes('action_rejected') ||
      msgStr.includes('4001')
    ) {
      return false;
    }

    if (filterType && n.type !== filterType) return false;
    if (
      search &&
      !n.title.toLowerCase().includes(search.toLowerCase()) &&
      !msgStr.includes(search.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  return (
    <div className="fixed right-0 top-0 z-50 flex h-full w-[380px] max-w-full flex-col border-l border-white/10 bg-secondary/95 backdrop-blur-xl font-sans shadow-2xl animate-in slide-in-from-right duration-200">
      <div className="flex flex-col gap-4 border-b border-white/10 p-4 bg-secondary/60 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-[16px] font-bold tracking-tight text-primary">Activity</h2>
            {displayNotifications.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-brand/10 text-brand border border-brand/20">
                {displayNotifications.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button className="p-1.5 text-muted hover:text-primary hover:bg-white/5 rounded-lg transition-colors cursor-pointer">
              <Settings size={16} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-muted hover:text-primary hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Search size={13} className="text-muted" />
          </div>
          <input
            type="text"
            placeholder="Search activity..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-tertiary/60 py-2 pl-9 pr-3 text-[12px] font-medium text-primary placeholder:text-muted/60 outline-none transition-all focus:border-brand/40 focus:bg-tertiary"
          />
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto overflow-x-hidden"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <style dangerouslySetInnerHTML={{ __html: `::-webkit-scrollbar { display: none; }` }} />

        {displayNotifications.length > 0 ? (
          <div className="flex flex-col divide-y divide-white/5">
            <div className="px-5 py-2.5 text-[11px] font-black uppercase tracking-wider text-muted/70">
              Recent Transactions
            </div>

            {displayNotifications.map(notif => {
              const isError =
                notif.status === 'error' ||
                notif.title?.toLowerCase().includes('failed') ||
                notif.title?.toLowerCase().includes('error');
              const isPending =
                notif.status === 'info' ||
                notif.title?.toLowerCase().includes('sent') ||
                notif.title?.toLowerCase().includes('submitted');

              return (
                <div
                  key={notif.id}
                  onClick={() => markAsRead(notif.id)}
                  className={`flex cursor-pointer gap-3.5 px-5 py-4 transition-all hover:bg-white/[0.03] group/item ${
                    notif.read ? 'opacity-65' : ''
                  }`}
                >
                  <div className="mt-0.5 shrink-0">{typeConfig[notif.type]?.icon}</div>
                  <div className="min-w-0 flex-1 relative">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-[13px] font-bold text-primary truncate">
                        {notif.title}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isError ? (
                          <XCircle size={13} className="text-rose-400" />
                        ) : isPending ? (
                          <Clock size={13} className="text-amber-400 animate-pulse" />
                        ) : (
                          <CheckCircle2 size={13} className="text-emerald-400" />
                        )}
                        <span className="text-[10px] text-muted font-medium">
                          {formatRelativeTime(notif.timestamp)}
                        </span>
                      </div>
                    </div>

                    <div className="break-words text-[12px] text-muted font-medium leading-relaxed pr-5">
                      {renderSafeMessage(notif.message)}
                    </div>

                    {notif.explorerUrl && (
                      <div className="mt-2 flex items-center gap-1">
                        <a
                          href={notif.explorerUrl}
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
                      onClick={e => {
                        e.stopPropagation();
                        useNotificationStore.getState().removeNotification(notif.id);
                      }}
                      className="absolute top-0 right-0 p-1 opacity-0 transition-opacity hover:text-primary group-hover/item:opacity-100 text-muted cursor-pointer"
                      title="Dismiss"
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center p-6 text-center text-muted">
            <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-2.5 text-muted/60">
              <Clock size={18} />
            </div>
            <p className="text-[13px] font-semibold text-primary">No recent activity</p>
            <p className="text-[11px] text-muted mt-0.5">
              Your swap and bridge transactions will appear here.
            </p>
          </div>
        )}
      </div>

      <div className="mt-auto flex gap-2.5 border-t border-white/10 p-4 bg-tertiary/20 backdrop-blur-md">
        <button
          onClick={disablePushNotifications}
          className="flex-1 rounded-xl border border-white/10 py-2 px-3 text-[11px] font-bold text-muted transition-all hover:bg-white/5 hover:text-primary bg-secondary/80 cursor-pointer"
        >
          Mute Alerts
        </button>
        <button
          onClick={clearAll}
          className="rounded-xl border border-rose-500/20 py-2 px-4 text-[11px] font-bold text-rose-400 transition-all hover:bg-rose-500/10 bg-secondary/80 cursor-pointer"
        >
          Clear All
        </button>
      </div>
    </div>
  );
};
