import { AlertCircle, RefreshCw } from 'lucide-react';
import React from 'react';

import { type WalletConfig } from '../constants/Wallet';

export interface WalletConnectFallbackProps {
  walletConfig: WalletConfig | null;
  pairingUri: string | null;
  isMobile: boolean;
  error: string | null;
  isExtension: boolean;
  onRetry: () => void;
  onCancel: () => void;
}

export const WalletConnectFallback: React.FC<WalletConnectFallbackProps> = ({
  walletConfig,
  isMobile,
  error,
  isExtension,
  onRetry,
  onCancel,
}) => {
  const walletName = walletConfig?.name || 'Wallet';

  if (error) {
    return (
      <div
        style={{
          background: 'color-mix(in srgb, var(--color-danger) 12%, var(--color-bg-tertiary))',
          borderColor: 'color-mix(in srgb, var(--color-danger) 30%, transparent)',
        }}
        className="w-full p-3 rounded-2xl border space-y-2.5 text-left animate-fade-in"
      >
        <div className="flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-[var(--color-danger)] flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-[var(--color-danger)]">Connection Failed</p>
            <p
              style={{ color: 'var(--color-text-muted)' }}
              className="text-[11px] mt-0.5 leading-relaxed break-words"
            >
              {error}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={onRetry}
            style={{ background: 'var(--color-brand-primary)', color: '#fff' }}
            className="flex-1 py-1.5 px-3 rounded-xl text-xs font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Retry</span>
          </button>
          <button
            onClick={onCancel}
            style={{
              background: 'var(--color-bg-secondary)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-secondary)',
            }}
            className="py-1.5 px-3 rounded-xl border text-xs font-medium hover:opacity-80 transition-opacity"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full text-center space-y-1">
      <p style={{ color: 'var(--color-text-muted)' }} className="text-xs">
        {isExtension
          ? `Please approve the prompt in your ${walletName} browser extension.`
          : isMobile
            ? `Please approve the connection request in your ${walletName} app.`
            : `Please approve the connection request in your wallet.`}
      </p>
    </div>
  );
};
