import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Wallet,
} from 'lucide-react';
import type { FC } from 'react';
import { useState } from 'react';

import type { LedgerAssetBalance } from '../../services/sparekeyContractService';
import { RecoveryStatusTracker } from './RecoveryStatusTracker';

interface TrackingRecoveryStepProps {
  ownerWallet: string;
  destinationAddress: string;
  status: string; // 'STARTED' | 'PENDING' | 'EXECUTING' | 'COMPLETED'
  statusNotice?: string;
  isPolling?: boolean;
  onRefresh?: () => void;
  onExecute?: () => void;
  isExecuting?: boolean;
  errorMessage?: string;
  onResetOrBack?: () => void;
  destinationBalances?: LedgerAssetBalance[];
  isLoadingDestinationBalances?: boolean;
  hasAuthToken?: boolean;
  onConnectWallet?: () => void;
}

export const TrackingRecoveryStep: FC<TrackingRecoveryStepProps> = ({
  ownerWallet,
  destinationAddress,
  status,
  statusNotice,
  isPolling = false,
  onRefresh,
  onExecute,
  isExecuting = false,
  errorMessage,
  onResetOrBack,
  destinationBalances = [],
  isLoadingDestinationBalances = false,
  hasAuthToken = false,
  onConnectWallet,
}) => {
  const [copiedTarget, setCopiedTarget] = useState(false);
  const [copiedDest, setCopiedDest] = useState(false);

  const currentStatus = (status || '').toUpperCase();
  const isPending = currentStatus === 'PENDING';
  const isExecutingState = isExecuting || currentStatus === 'EXECUTING';
  const isCompleted = currentStatus === 'COMPLETED';

  const copyToClipboard = (text: string, type: 'target' | 'dest') => {
    if (!text || !navigator?.clipboard?.writeText) return;
    navigator.clipboard.writeText(text).catch(() => {});
    if (type === 'target') {
      setCopiedTarget(true);
      setTimeout(() => setCopiedTarget(false), 2000);
    } else {
      setCopiedDest(true);
      setTimeout(() => setCopiedDest(false), 2000);
    }
  };

  const truncate = (addr: string) => {
    if (!addr) return '';
    return `${addr.slice(0, 8)}...${addr.slice(-8)}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--color-border)]/50 pb-4">
        <div>
          <h2 className="font-['Space_Grotesk'] text-lg sm:text-2xl font-bold tracking-tight text-[var(--color-text-primary)]">
            Live Recovery Progress
          </h2>
          <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] mt-0.5">
            Tracking your decentralized ZK wallet recovery in real-time.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isPolling}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-all disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isPolling ? 'animate-spin text-blue-400' : ''}`}
              />
              <span>{isPolling ? 'Checking...' : 'Refresh Status'}</span>
            </button>
          )}

          {onResetOrBack && (
            <button
              type="button"
              onClick={onResetOrBack}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-all cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Back / New</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <RecoveryStatusTracker
            status={currentStatus}
            destinationAddress={destinationAddress}
            isExecuting={isExecutingState}
          />
        </div>

        <div className="lg:col-span-5 space-y-5">
          <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/90 p-5 sm:p-6 shadow-xl backdrop-blur-sm space-y-5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                Action Required
              </span>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                  isPending
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                    : isExecutingState
                      ? 'border-blue-500/30 bg-blue-500/10 text-blue-400 animate-pulse'
                      : isCompleted
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                        : 'border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-muted)]'
                }`}
              >
                {currentStatus || 'INITIALIZING'}
              </span>
            </div>

            {statusNotice && (
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)]/80 p-3.5 text-xs text-[var(--color-text-secondary)] leading-relaxed">
                <span className="font-semibold text-[var(--color-text-primary)] block mb-0.5">
                  Current Status Notice:
                </span>
                {statusNotice}
              </div>
            )}

            {errorMessage && (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-300 flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-red-200">Execution Error</p>
                  <p className="leading-relaxed">{errorMessage}</p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {isPending ? (
                !hasAuthToken ? (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={onConnectWallet}
                      className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:from-blue-500 hover:to-indigo-500 active:scale-[0.99] transition-all cursor-pointer"
                    >
                      <Wallet className="h-4 w-4" />
                      <span>Connect Wallet to Execute Sweep</span>
                    </button>
                    <p className="text-[11px] text-center text-[var(--color-text-muted)]">
                      Active wallet connection required to sign and execute on-chain recovery sweep.
                    </p>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={onExecute}
                    disabled={isExecutingState}
                    className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:from-blue-500 hover:to-indigo-500 active:scale-[0.99] transition-all disabled:opacity-60 cursor-pointer"
                  >
                    {isExecutingState ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Sweeping Protected Funds...</span>
                      </>
                    ) : (
                      <>
                        <span>Execute Sweep Funds</span>
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                )
              ) : isExecutingState ? (
                <div className="w-full flex items-center justify-center gap-2 rounded-2xl bg-blue-600/20 border border-blue-500/30 px-5 py-3.5 text-sm font-medium text-blue-300">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                  <span>Sweep Transaction in Progress...</span>
                </div>
              ) : isCompleted ? (
                <div className="space-y-2.5">
                  <div className="w-full flex items-center justify-center gap-2 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 px-5 py-3.5 text-sm font-semibold text-emerald-400">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span>Recovery Completed Successfully</span>
                  </div>
                  {onResetOrBack && (
                    <button
                      type="button"
                      onClick={onResetOrBack}
                      className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-4 py-2.5 text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-hover)] transition-all cursor-pointer"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>Start New Recovery Session</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="w-full flex items-center justify-center gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-5 py-3.5 text-xs text-[var(--color-text-muted)] text-center">
                  <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400" />
                  <span>Waiting for backend email verification before sweep...</span>
                </div>
              )}
            </div>
          </div>

          {/* Recovery Addresses Card - DESTINATION WALLET IS HERO PRIORITY */}
          <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/90 p-5 sm:p-6 shadow-xl backdrop-blur-sm space-y-4">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              Recovery Addresses
            </span>

            <div className="space-y-3 text-xs">
              {/* HERO CARD: New Destination Wallet (Recipient) */}
              <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Wallet className="h-3.5 w-3.5 text-emerald-400" />
                    Destination Wallet (Funds Recipient)
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400 font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                    Recipient
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[var(--color-bg-primary)] border border-emerald-500/20 font-mono text-[var(--color-text-primary)]">
                  <span className="truncate text-emerald-300 font-semibold">
                    {truncate(destinationAddress)}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => copyToClipboard(destinationAddress, 'dest')}
                      className="p-1 rounded text-[var(--color-text-muted)] hover:text-emerald-400 transition-colors cursor-pointer"
                      title="Copy Destination Address"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    {destinationAddress && (
                      <a
                        href={`https://stellar.expert/explorer/testnet/account/${destinationAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1 rounded text-[var(--color-text-muted)] hover:text-emerald-400 transition-colors"
                        title="View on StellarExpert"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </div>

                {copiedDest && (
                  <span className="text-[10px] text-emerald-400 block font-medium">
                    Destination address copied!
                  </span>
                )}

                {/* Destination Wallet Ledger Balances */}
                <div className="pt-2 border-t border-emerald-500/20 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[11px] font-semibold text-emerald-300">
                      Destination Wallet Ledger Balances
                    </span>
                    {isLoadingDestinationBalances && (
                      <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                        Refreshing
                      </span>
                    )}
                  </div>

                  {destinationBalances.length > 0 ? (
                    <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                      {destinationBalances.map((asset, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between text-xs rounded-xl bg-[var(--color-bg-primary)] px-3 py-2 border border-emerald-500/20"
                        >
                          <span className="font-semibold text-[var(--color-text-primary)]">
                            {asset.code}
                          </span>
                          <span className="font-mono text-emerald-300 font-semibold">
                            {Number(asset.balance).toLocaleString(undefined, {
                              maximumFractionDigits: 4,
                            })}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-[var(--color-text-muted)] italic">
                      {isLoadingDestinationBalances
                        ? 'Fetching balances from ledger...'
                        : 'No asset balances found yet on ledger.'}
                    </p>
                  )}
                </div>
              </div>

              {/* SECONDARY CARD: Lost / Owner Wallet */}
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)]/80 p-3.5 space-y-1.5">
                <span className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider block">
                  Wallet Being Recovered (Owner)
                </span>
                <div className="flex items-center justify-between gap-2 font-mono text-xs text-[var(--color-text-secondary)]">
                  <span className="truncate">{truncate(ownerWallet)}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => copyToClipboard(ownerWallet, 'target')}
                      className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
                      title="Copy Address"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                    <a
                      href={`https://stellar.expert/explorer/testnet/account/${ownerWallet}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                      title="View on StellarExpert"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
                {copiedTarget && (
                  <span className="text-[10px] text-emerald-400 block font-medium">
                    Owner address copied!
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
