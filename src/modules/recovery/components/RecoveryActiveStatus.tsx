import { Check, Shield, Trash2 } from 'lucide-react';
import type { FC } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ROUTES } from '@/constants/routes';

import { useRecoveryStore } from '../store/recoveryStore';
import { RecoveryFaqAccordion } from './RecoveryFaqAccordion';

interface RecoveryActiveStatusProps {
  onChangeEmail: () => void;
  onInitiateTestRecovery?: () => void;
}

export const RecoveryActiveStatus: FC<RecoveryActiveStatusProps> = ({ onChangeEmail }) => {
  const navigate = useNavigate();
  const email = useRecoveryStore(state => state.email || 'alex.miller@gmail.com');
  const walletAddress = useRecoveryStore(state => state.walletAddress || '0x91a...f2c');
  const disableRecovery = useRecoveryStore(state => state.disableRecovery);

  const [showConfirmDisable, setShowConfirmDisable] = useState(false);

  const handleDisable = () => {
    disableRecovery();
    setShowConfirmDisable(false);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <span className="font-mono text-xs font-semibold tracking-wider text-[var(--color-text-muted)] uppercase">
          WALLET SECURITY / RECOVERY SETTINGS
        </span>

        <h1 className="font-['Space_Grotesk'] text-3xl sm:text-4xl font-bold tracking-tight text-[var(--color-text-primary)]">
          Recovery is on
        </h1>

        <p className="text-sm sm:text-base text-[var(--color-text-secondary)]">
          Your email is confirmed. Recovery protection is active for this wallet.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/90 p-6 sm:p-8 shadow-xl space-y-6">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-400">
                <Check className="h-6 w-6 stroke-[2.5]" />
              </div>
              <div className="space-y-1">
                <h2 className="text-lg sm:text-xl font-bold text-[var(--color-text-primary)] font-['Space_Grotesk']">
                  A way back, ready when you need it
                </h2>
                <p className="text-xs sm:text-sm text-[var(--color-text-secondary)]">
                  No recovery is in progress. Your wallet access is unchanged.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)]/80 divide-y divide-[var(--color-border)]/50 text-xs sm:text-sm">
              <div className="flex items-center justify-between px-4 py-3.5">
                <span className="text-[var(--color-text-muted)] font-medium">Wallet</span>
                <span className="font-mono font-semibold text-[var(--color-text-primary)]">
                  {walletAddress}
                </span>
              </div>
              <div className="flex items-center justify-between px-4 py-3.5">
                <span className="text-[var(--color-text-muted)] font-medium">Recovery email</span>
                <span className="font-medium text-[var(--color-text-primary)]">{email}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3.5">
                <span className="text-[var(--color-text-muted)] font-medium">
                  Email confirmation
                </span>
                <span className="font-semibold text-emerald-400">Verified</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3.5">
                <span className="text-[var(--color-text-muted)] font-medium">
                  Safety wait when recovering
                </span>
                <span className="font-medium text-[var(--color-text-primary)]">
                  7 days · mandatory
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <button
                type="button"
                onClick={onChangeEmail}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-4 text-xs font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] hover:border-[var(--color-border-dark)] transition-colors cursor-pointer"
              >
                Change recovery email
              </button>

              <button
                type="button"
                onClick={() => setShowConfirmDisable(true)}
                className="text-xs font-semibold text-rose-400 hover:text-rose-300 transition-colors cursor-pointer"
              >
                Turn off recovery
              </button>
            </div>

            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)]/60 p-4">
              <div className="flex items-start gap-3">
                <Shield className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs font-semibold text-[var(--color-text-primary)]">
                    If you lose access
                  </h4>
                  <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                    Choose Recover my funds on the welcome page. Use this linked email to authorize
                    the request, wait seven days, then complete recovery.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => navigate(ROUTES.DASHBOARD)}
                className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 transition-all hover:bg-blue-500 cursor-pointer"
              >
                Done · Return to wallet
              </button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5">
          <RecoveryFaqAccordion />
        </div>
      </div>

      {showConfirmDisable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="max-w-md w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-500/15">
                <Trash2 className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-bold text-[var(--color-text-primary)]">
                Turn off recovery protection?
              </h3>
            </div>
            <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] leading-relaxed">
              If you turn off email recovery, you will have no email backup to restore funds if you
              lose access to this device or wallet session.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmDisable(false)}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDisable}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500 cursor-pointer"
              >
                Yes, turn off
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
