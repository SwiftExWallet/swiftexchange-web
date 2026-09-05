import { Check, Copy, Shield, Wallet } from 'lucide-react';
import React, { memo, useState } from 'react';

import { WalletType } from '../../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../../walletconnect/hooks/useWalletConnect';

interface StellarAccountPanelProps {
  xlmBalance?: string;
  spendableXlm?: string;
  subentryCount?: number;
}

export const StellarAccountPanel: React.FC<StellarAccountPanelProps> = memo(
  ({ xlmBalance = '0.00', spendableXlm = '0.00', subentryCount = 0 }) => {
    const { connectedWallets } = useWalletConnect();
    const stellarWallet = connectedWallets[WalletType.STELLAR];
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
      if (stellarWallet?.address) {
        navigator.clipboard.writeText(stellarWallet.address);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    };

    const reserveLocked = (1 + subentryCount * 0.5).toFixed(2);

    return (
      <div className="bg-[var(--color-bg-secondary)] rounded-2xl border border-[var(--color-border)]/60 shadow-sm p-4 text-xs select-none">
        <div className="space-y-2 border-t border-white/5 pt-3">
          <div className="flex justify-between items-center text-muted text-[11px]">
            <span className="flex items-center gap-1">
              <Wallet size={12} className="text-muted" />
              <span>Stellar Account</span>
            </span>
            {stellarWallet?.address ? (
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 text-primary hover:text-brand font-mono font-medium transition-colors cursor-pointer"
                title="Click to copy address"
              >
                <span>
                  {stellarWallet.address.slice(0, 4)}...{stellarWallet.address.slice(-4)}
                </span>
                {copied ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
              </button>
            ) : (
              <span className="text-muted">Not Connected</span>
            )}
          </div>

          <div className="flex justify-between items-center text-[11px]">
            <span className="text-muted">Total XLM Balance</span>
            <span className="text-primary font-mono font-semibold tabular-nums">
              {xlmBalance} XLM
            </span>
          </div>

          <div className="flex justify-between items-center text-[11px]">
            <span className="text-muted">Spendable XLM</span>
            <span className="text-green-400 font-mono font-bold tabular-nums">
              {spendableXlm} XLM
            </span>
          </div>

          <div className="flex justify-between items-center text-[11px]">
            <span className="text-muted flex items-center gap-1">
              <span>Locked Reserve</span>
              <Shield size={10} className="text-muted/60" />
            </span>
            <span className="text-muted font-mono tabular-nums">{reserveLocked} XLM</span>
          </div>

          <div className="flex justify-between items-center text-[11px]">
            <span className="text-muted">Active Trustlines & Offers</span>
            <span className="text-muted font-mono tabular-nums">{subentryCount} entries</span>
          </div>
        </div>
      </div>
    );
  }
);
