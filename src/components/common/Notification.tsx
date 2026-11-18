import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import React, { useEffect } from 'react';

import { playNotificationSound } from '@/utils/notificationSound';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface NotificationProps {
  type: NotificationType;
  message: string;
  title?: string;
  onClose?: () => void;
  autoClose?: boolean;
  autoCloseDuration?: number;
  className?: string;
  playSound?: boolean;
}

export const Notification: React.FC<NotificationProps> = ({
  type,
  message,
  title,
  onClose,
  autoClose = true,
  autoCloseDuration = 5000,
  className = '',
  playSound = true,
}) => {
  useEffect(() => {
    if (playSound) {
      playNotificationSound(type);
    }
  }, [type, playSound]);

  useEffect(() => {
    if (autoClose && onClose) {
      const timer = setTimeout(() => {
        onClose();
      }, autoCloseDuration);

      return () => clearTimeout(timer);
    }
  }, [autoClose, autoCloseDuration, onClose]);

  const config = {
    success: {
      icon: <CheckCircle2 size={16} className="text-emerald-400" />,
      badgeBg: 'bg-emerald-500/10 border-emerald-500/20 shadow-[0_0_12px_rgba(16,185,129,0.15)]',
      borderAccent: 'border-l-emerald-500',
    },
    error: {
      icon: <XCircle size={16} className="text-rose-400" />,
      badgeBg: 'bg-rose-500/10 border-rose-500/20 shadow-[0_0_12px_rgba(244,63,94,0.15)]',
      borderAccent: 'border-l-rose-500',
    },
    warning: {
      icon: <AlertTriangle size={16} className="text-amber-400" />,
      badgeBg: 'bg-amber-500/10 border-amber-500/20 shadow-[0_0_12px_rgba(245,158,11,0.15)]',
      borderAccent: 'border-l-amber-500',
    },
    info: {
      icon: <Info size={16} className="text-cyan-400" />,
      badgeBg: 'bg-cyan-500/10 border-cyan-500/20 shadow-[0_0_12px_rgba(6,182,212,0.15)]',
      borderAccent: 'border-l-cyan-500',
    },
  };

  const current = config[type] || config.info;

  return (
    <div
      className={`fixed top-4 right-4 z-50 p-4 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] ${current.borderAccent} border-l-[3px] rounded-2xl text-[var(--color-text-primary)] text-sm flex items-start gap-3.5 shadow-2xl max-w-md animate-slideIn transition-all ${className}`}
      role="alert"
    >
      <div
        className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-xl border ${current.badgeBg}`}
      >
        {current.icon}
      </div>

      <div className="flex-1 min-w-0 pt-0.5">
        {title && (
          <div className="font-bold text-[13px] tracking-tight text-[var(--color-text-primary)] mb-0.5">
            {title}
          </div>
        )}
        <div className="break-words text-[12px] text-[var(--color-text-secondary)] font-normal leading-relaxed">
          {message}
        </div>
      </div>

      {onClose && (
        <button
          onClick={onClose}
          className="flex-shrink-0 p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] rounded-lg transition-all active:scale-90 cursor-pointer"
          aria-label="Close notification"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
};
