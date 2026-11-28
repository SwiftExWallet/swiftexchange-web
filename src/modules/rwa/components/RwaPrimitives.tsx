import { AlertCircle, X } from 'lucide-react';
import React from 'react';

import type { MarketStatus } from '../types/rwa.types';

export const ModalShell: React.FC<{
  open: boolean;
  title: string;
  subtitle?: string;
  onClose?: () => void;
  children: React.ReactNode;
}> = ({ open, title, subtitle, onClose, children }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-secondary border border-divider/60 p-6 shadow-2xl space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-primary">{title}</h3>
            {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-white/5 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
};

export const MarketBadge: React.FC<{ status: MarketStatus; closedLabel?: string | null }> = ({
  status,
  closedLabel,
}) => (
  <span
    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
      status.open
        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
        : 'bg-amber-500/10 text-amber-400 border-amber-500/25'
    }`}
  >
    <span
      className={`w-1.5 h-1.5 rounded-full ${status.open ? 'bg-emerald-400' : 'bg-amber-400'}`}
    />
    {closedLabel || status.label}
  </span>
);

export const DetailRow: React.FC<{ label: string; value: React.ReactNode }> = ({
  label,
  value,
}) => (
  <div className="flex items-center justify-between text-xs gap-3">
    <span className="text-muted">{label}</span>
    <span className="text-primary font-medium text-right">{value}</span>
  </div>
);

export const AlertBanner: React.FC<{
  variant: 'error' | 'warning' | 'info';
  children: React.ReactNode;
}> = ({ variant, children }) => {
  const styles =
    variant === 'error'
      ? 'text-red-400 bg-red-500/10 border-red-500/30'
      : variant === 'warning'
        ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
        : 'text-brand bg-brand/10 border-brand/30';
  return (
    <div className={`flex items-start gap-2 text-xs rounded-xl border p-3 ${styles}`}>
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
      <div className="leading-relaxed">{children}</div>
    </div>
  );
};
