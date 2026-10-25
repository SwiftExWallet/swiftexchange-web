import {
  AlertCircle,
  Check,
  Copy,
  Loader2,
  Mail,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
} from 'lucide-react';
import type { FC, ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';

import { WalletType } from '@/modules/walletconnect/constants/Wallet';
import { useWalletConnect } from '@/modules/walletconnect/hooks/useWalletConnect';

import { SPAREKEY_CONFIG } from '../constants';
import {
  checkOnChainRegistration,
  isValidStellarPublicKey,
} from '../services/sparekeyContractService';
import { useRecoveryStore } from '../store/recoveryStore';
import { RecoveryFaqAccordion } from './RecoveryFaqAccordion';

interface RecoveryActiveStatusProps {
  onChangeEmail: () => void;
  onInitiateTestRecovery?: () => void;
}

const truncateHash = (str?: string, start = 8, end = 8): string => {
  if (!str) return '';
  if (str.length <= start + end) return str;
  return `${str.slice(0, start)}...${str.slice(-end)}`;
};

const SummaryRow: FC<{ label: string; children: ReactNode }> = ({ label, children }) => (
  <div className="flex items-center justify-between gap-3 py-3 text-xs sm:text-sm">
    <span className="text-[var(--color-text-muted)] shrink-0">{label}</span>
    <div className="font-medium text-[var(--color-text-primary)] text-right truncate">
      {children}
    </div>
  </div>
);

export const RecoveryActiveStatus: FC<RecoveryActiveStatusProps> = ({
  onChangeEmail,
  onInitiateTestRecovery,
}) => {
  const { connectedWallets, openModal } = useWalletConnect();

  const rawStellar =
    connectedWallets?.[WalletType.STELLAR]?.address || connectedWallets?.stellar?.address || '';
  const activeStellarWallet =
    typeof rawStellar === 'string' && rawStellar.startsWith('G') && rawStellar.length === 56
      ? rawStellar
      : '';

  const storedEmail = useRecoveryStore(state => state.email || '');

  const [copiedWallet, setCopiedWallet] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<{ message: string; statusCode?: number } | null>(null);
  const [isRegisteredOnChain, setIsRegisteredOnChain] = useState<boolean | null>(null);

  const verifyWalletStatus = useCallback(async (walletToCheck: string) => {
    if (!isValidStellarPublicKey(walletToCheck)) {
      setIsRegisteredOnChain(null);
      setSyncError(null);
      return;
    }

    setIsSyncing(true);
    setSyncError(null);

    try {
      const res = await checkOnChainRegistration(walletToCheck);

      if (res?.error) {
        setSyncError({
          message: res.error,
          statusCode: res.statusCode,
        });
        setIsRegisteredOnChain(null);
        return;
      }

      setSyncError(null);
      const isReg = Boolean(res?.isRegistered);
      setIsRegisteredOnChain(isReg);

      const store = useRecoveryStore.getState();
      if (isReg) {
        store.confirmOnChainSetup({
          email: res?.email || store.email || '',
          commitmentHex: res?.commitmentHex || '',
          saltHex: res?.saltHex || '',
          walletAddress: walletToCheck,
        });
      } else {
        store.resetAll();
      }
    } catch (err: unknown) {
      const errorObj = err as { message?: string; statusCode?: number; status?: number };
      setSyncError({
        message: errorObj?.message || 'Failed to check recovery status from server',
        statusCode: errorObj?.statusCode || errorObj?.status,
      });
      setIsRegisteredOnChain(null);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  useEffect(() => {
    if (activeStellarWallet) {
      verifyWalletStatus(activeStellarWallet);
    } else {
      setIsRegisteredOnChain(null);
      setSyncError(null);
    }
  }, [activeStellarWallet, verifyWalletStatus]);

  const copyText = (text: string, onCopied: (val: boolean) => void) => {
    if (!text || !navigator?.clipboard?.writeText) return;
    navigator.clipboard
      .writeText(text)
      .then(() => {
        onCopied(true);
        setTimeout(() => onCopied(false), 2000);
      })
      .catch(() => {});
  };

  const handleCopyWallet = () => copyText(activeStellarWallet, setCopiedWallet);

  const handleStartRecoveryForWallet = () => {
    if (activeStellarWallet) {
      useRecoveryStore.getState().setTargetWallet(activeStellarWallet);
    }
    onInitiateTestRecovery?.();
  };

  const isAuthError =
    syncError &&
    (syncError.statusCode === 401 || syncError.message.toLowerCase().includes('token'));

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {activeStellarWallet && (
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3.5 sm:p-4 shadow-sm flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[11px] font-medium text-[var(--color-text-muted)] block">
              Connected Stellar Wallet
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="font-mono text-xs sm:text-sm font-semibold text-[var(--color-text-primary)] truncate">
                {truncateHash(activeStellarWallet, 8, 6)}
              </span>
              <button
                type="button"
                onClick={handleCopyWallet}
                className="text-[var(--color-text-muted)] hover:text-blue-400 transition-colors cursor-pointer shrink-0 p-0.5"
                title="Copy address"
              >
                {copiedWallet ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>

          <button
            type="button"
            disabled={isSyncing}
            onClick={() => verifyWalletStatus(activeStellarWallet)}
            className="inline-flex h-8 sm:h-9 items-center justify-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh status"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin text-blue-400' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        <div className="lg:col-span-7">
          {!activeStellarWallet ? (
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-6 sm:p-10 text-center space-y-4 shadow-lg">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div className="space-y-1 max-w-sm mx-auto">
                <h3 className="text-base sm:text-lg font-bold font-['Space_Grotesk'] text-[var(--color-text-primary)]">
                  Wallet Protection Status
                </h3>
                <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] leading-relaxed">
                  Connect your Stellar wallet to view and manage its on-chain recovery status.
                </p>
              </div>
              <div className="pt-1">
                <button
                  type="button"
                  onClick={openModal}
                  className="inline-flex h-10 items-center justify-center rounded-xl bg-blue-600 px-5 text-xs font-semibold text-white hover:bg-blue-500 transition-colors cursor-pointer"
                >
                  Connect Wallet
                </button>
              </div>
            </div>
          ) : isSyncing && isRegisteredOnChain === null && !syncError ? (
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] py-16 text-center space-y-2.5 shadow-lg">
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-blue-400" />
              <p className="text-xs text-[var(--color-text-muted)]">
                Checking on-chain protection status...
              </p>
            </div>
          ) : syncError ? (
            <div className="rounded-2xl border border-rose-500/30 bg-[var(--color-bg-secondary)] p-5 sm:p-7 shadow-lg space-y-5">
              <div className="flex items-start gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-400">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-base sm:text-lg font-bold text-[var(--color-text-primary)] font-['Space_Grotesk']">
                    {isAuthError ? 'Authentication Required' : 'Unable to Check Status'}
                  </h2>
                  <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] leading-relaxed">
                    {isAuthError
                      ? 'Connect your Stellar wallet to verify protection status for this account.'
                      : 'Could not reach the recovery service. Please try again in a moment.'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={isSyncing}
                  onClick={() => verifyWalletStatus(activeStellarWallet)}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-4 text-xs font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin text-blue-400' : ''}`}
                  />
                  <span>Try Again</span>
                </button>
              </div>
            </div>
          ) : isRegisteredOnChain === false ? (
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-5 sm:p-7 shadow-lg space-y-6">
              <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)]/60 pb-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-muted)]">
                    <ShieldOff className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold font-['Space_Grotesk'] text-[var(--color-text-primary)]">
                      Not Protected
                    </h2>
                    <p className="mt-0.5 text-xs sm:text-sm text-[var(--color-text-muted)]">
                      No recovery email is linked to{' '}
                      <span className="font-mono text-[var(--color-text-secondary)]">
                        {truncateHash(activeStellarWallet)}
                      </span>
                      .
                    </p>
                  </div>
                </div>

                <span className="shrink-0 rounded-full bg-[var(--color-bg-primary)] border border-[var(--color-border)] px-2.5 py-1 text-xs font-medium text-[var(--color-text-muted)]">
                  Inactive
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-3.5 space-y-1">
                  <span className="font-semibold text-[var(--color-text-primary)] block">
                    Private Email Backup
                  </span>
                  <p className="text-[var(--color-text-muted)] leading-relaxed">
                    Only an encrypted hash is saved on-chain. Your email stays private.
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-3.5 space-y-1">
                  <span className="font-semibold text-[var(--color-text-primary)] block">
                    Automatic Balance Transfer
                  </span>
                  <p className="text-[var(--color-text-muted)] leading-relaxed">
                    Recover your XLM and tokens safely if you ever lose your wallet keys.
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <button
                  type="button"
                  onClick={onChangeEmail}
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-blue-600 px-6 text-xs sm:text-sm font-semibold text-white hover:bg-blue-500 transition-colors cursor-pointer"
                >
                  Set Up Recovery Email
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-5 sm:p-7 shadow-lg space-y-5">
              <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)]/60 pb-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base sm:text-lg font-bold text-[var(--color-text-primary)] font-['Space_Grotesk']">
                        Wallet Protected
                      </h2>
                      {isSyncing && (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-400" />
                      )}
                    </div>
                    <p className="mt-0.5 text-xs sm:text-sm text-[var(--color-text-muted)]">
                      On-chain email recovery is active on Stellar Soroban.
                    </p>
                  </div>
                </div>

                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Active
                </span>
              </div>

              <div className="divide-y divide-[var(--color-border)]/50 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-4">
                <SummaryRow label="Protected Wallet">
                  <div className="inline-flex items-center gap-2">
                    <span className="font-mono">{truncateHash(activeStellarWallet)}</span>
                    <button
                      type="button"
                      onClick={handleCopyWallet}
                      className="text-[var(--color-text-muted)] hover:text-blue-400 transition-colors cursor-pointer"
                    >
                      {copiedWallet ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </SummaryRow>

                <SummaryRow label="Recovery Email">
                  {storedEmail ? storedEmail : 'Encrypted on-chain'}
                </SummaryRow>

                <SummaryRow label="Network">Stellar Testnet</SummaryRow>

                <SummaryRow label="Transfer Delay">
                  {SPAREKEY_CONFIG.minDelaySeconds} seconds
                </SummaryRow>
              </div>

              <div className="flex items-start gap-3 rounded-xl bg-[var(--color-bg-primary)]/60 p-3.5 text-xs text-[var(--color-text-secondary)]">
                <Mail className="h-4 w-4 shrink-0 text-blue-400 mt-0.5" />
                <div className="space-y-1 leading-relaxed">
                  <span className="font-semibold text-[var(--color-text-primary)] block">
                    How to recover your funds
                  </span>
                  <p>
                    Email{' '}
                    <span className="font-mono text-[var(--color-text-primary)]">
                      claim@swiftexwallet.in
                    </span>{' '}
                    from your recovery inbox with your new Stellar wallet address in the subject
                    line.
                  </p>
                </div>
              </div>

              {onInitiateTestRecovery && (
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={handleStartRecoveryForWallet}
                    className="inline-flex h-11 items-center justify-center rounded-xl bg-blue-600 px-6 text-xs sm:text-sm font-semibold text-white hover:bg-blue-500 transition-colors cursor-pointer"
                  >
                    Recover Funds
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="lg:col-span-5">
          <RecoveryFaqAccordion />
        </div>
      </div>
    </div>
  );
};
