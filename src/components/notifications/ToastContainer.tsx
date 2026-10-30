import { ExternalLink, X } from 'lucide-react';
import React from 'react';

import { useNotificationStore } from '@/store/notificationStore';

import { getFintechNotificationBadge } from './NotificationBadgeHelper';

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

export const ToastContainer: React.FC = () => {
  const { activeToasts, removeToast } = useNotificationStore();

  if (activeToasts.length === 0) return null;

  return (
    <div className="fixed top-4 left-3 right-3 sm:left-auto sm:right-4 z-[99999] flex flex-col items-center sm:items-end gap-2.5 pointer-events-none">
      {activeToasts.map(toast => {
        const badge = getFintechNotificationBadge(toast);

        return (
          <div
            key={toast.id}
            className="pointer-events-auto flex w-full max-w-[370px] sm:w-[380px] items-start gap-3.5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 shadow-2xl transition-all duration-300 translate-x-0"
          >
            {/* Fintech Icon Badge */}
            <div
              className={`mt-0.5 shrink-0 flex h-8 w-8 items-center justify-center rounded-xl border ${badge.badgeBg}`}
            >
              {badge.icon}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[13px] font-semibold text-[var(--color-text-primary)] tracking-tight truncate">
                    {toast.title}
                  </span>
                  {badge.tag && (
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded border leading-none ${badge.tagColor}`}
                    >
                      {badge.tag}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => removeToast(toast.id)}
                  className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors ml-1 p-0.5 cursor-pointer"
                  aria-label="Dismiss toast"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="mt-1 break-words text-[12px] text-[var(--color-text-secondary)] font-normal leading-relaxed">
                {renderSafeMessage(toast.message)}
              </div>

              {toast.explorerUrl && (
                <div className="mt-2">
                  <a
                    href={toast.explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-brand hover:underline font-mono"
                    onClick={e => e.stopPropagation()}
                  >
                    <span>View on Aster Explorer</span>
                    <ExternalLink size={10} />
                  </a>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
