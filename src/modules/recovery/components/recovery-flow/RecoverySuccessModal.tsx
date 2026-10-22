import { Check, CheckCircle2, Copy, ExternalLink, Wallet, X } from 'lucide-react';
import type { FC } from 'react';
import { useEffect, useState } from 'react';

import {
  type LedgerAssetBalance,
  fetchWalletLedgerBalances,
} from '../../services/sparekeyContractService';

interface RecoverySuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  ownerAddress: string;
  destinationAddress: string;
  txHash?: string;
  balances?: LedgerAssetBalance[];
  onNavigateHome?: () => void;
}

export const RecoverySuccessModal: FC<RecoverySuccessModalProps> = ({
  isOpen,
  onClose,
  ownerAddress,
  destinationAddress,
  txHash,
  balances = [],
  onNavigateHome,
}) => {
  const [copiedHash, setCopiedHash] = useState(false);
  const [copiedDest, setCopiedDest] = useState(false);
  const [destBalances, setDestBalances] = useState<LedgerAssetBalance[]>(balances);
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);

  useEffect(() => {
    if (
      isOpen &&
      destinationAddress &&
      destinationAddress.startsWith('G') &&
      destinationAddress.length === 56
    ) {
      let isCurrent = true;
      setIsLoadingBalances(true);
      fetchWalletLedgerBalances(destinationAddress)
        .then(b => {
          if (!isCurrent) return;
          if (b && b.length > 0) {
            setDestBalances(b);
          }
        })
        .catch(() => {})
        .finally(() => {
          if (isCurrent) setIsLoadingBalances(false);
        });
      return () => {
        isCurrent = false;
      };
    }
  }, [isOpen, destinationAddress]);

  if (!isOpen) return null;

  const explorerUrl = txHash
    ? `https://stellar.expert/explorer/testnet/tx/${txHash}`
    : destinationAddress
      ? `https://stellar.expert/explorer/testnet/account/${destinationAddress}`
      : undefined;

  const handleCopyHash = () => {
    if (txHash && navigator?.clipboard?.writeText) {
      navigator.clipboard
        .writeText(txHash)
        .then(() => {
          setCopiedHash(true);
          setTimeout(() => setCopiedHash(false), 2000);
        })
        .catch(() => {});
    }
  };

  const handleCopyDest = () => {
    if (destinationAddress && navigator?.clipboard?.writeText) {
      navigator.clipboard
        .writeText(destinationAddress)
        .then(() => {
          setCopiedDest(true);
          setTimeout(() => setCopiedDest(false), 2000);
        })
        .catch(() => {});
    }
  };

  const truncate = (addr: string) => {
    if (!addr) return '';
    return `${addr.slice(0, 8)}...${addr.slice(-8)}`;
  };

  const displayBalances = destBalances.length > 0 ? destBalances : balances;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-3xl border border-emerald-500/30 bg-[var(--color-bg-secondary)] p-6 sm:p-8 shadow-2xl space-y-6">
        {/* Close Button */}
        <button
          type="button"
          onClick={() => {
            onClose();
            onNavigateHome?.();
          }}
          className="absolute right-5 top-5 flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--color-bg-primary)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] transition-colors cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="text-center space-y-2 pt-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400">
            <CheckCircle2 className="h-8 w-8 stroke-[2.2]" />
          </div>

          <h2 className="text-xl sm:text-2xl font-bold text-[var(--color-text-primary)] font-['Space_Grotesk']">
            Wallet Access Restored
          </h2>
          <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] max-w-sm mx-auto leading-relaxed">
            Recovery executed successfully on-chain. Protected funds have been transferred to your
            destination wallet.
          </p>
        </div>

        {/* HERO CARD: Destination Wallet (Priority) */}
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5" />
              Destination Wallet (Funds Delivered)
            </span>
            <span className="text-[10px] text-emerald-400 font-mono">Recipient</span>
          </div>

          <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[var(--color-bg-primary)] border border-emerald-500/20 font-mono text-xs sm:text-sm">
            <span className="truncate text-emerald-300 font-semibold">{destinationAddress}</span>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={handleCopyDest}
                className="p-1 rounded text-[var(--color-text-muted)] hover:text-emerald-400 transition-colors cursor-pointer"
                title="Copy Destination Address"
              >
                {copiedDest ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
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

          {/* Destination Wallet Ledger Balances */}
          {displayBalances.length > 0 && (
            <div className="space-y-1.5 pt-1 border-t border-emerald-500/15">
              <div className="flex items-center justify-between text-[11px] text-[var(--color-text-muted)]">
                <span>Destination Wallet Ledger Balances</span>
                {isLoadingBalances && (
                  <span className="text-[10px] text-emerald-400">Refreshing...</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {displayBalances.map(b => (
                  <span
                    key={b.code}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] px-2.5 py-1 font-mono text-xs font-semibold text-[var(--color-text-primary)]"
                  >
                    <span>{parseFloat(b.balance).toLocaleString()}</span>
                    <span className="text-emerald-400">{b.code}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Secondary Details: Source Wallet & Transaction */}
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)]/80 divide-y divide-[var(--color-border)]/60 text-xs overflow-hidden">
          <div className="flex items-center justify-between p-3 sm:p-3.5">
            <span className="text-[var(--color-text-muted)] font-medium">
              Source (Recovered) Account
            </span>
            <span className="font-mono text-[var(--color-text-secondary)]">
              {ownerAddress ? truncate(ownerAddress) : 'None'}
            </span>
          </div>

          {txHash && (
            <div className="flex items-center justify-between p-3 sm:p-3.5">
              <span className="text-[var(--color-text-muted)] font-medium">Transaction Hash</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[var(--color-text-secondary)] truncate max-w-[150px] sm:max-w-[200px]">
                  {truncate(txHash)}
                </span>
                <button
                  type="button"
                  onClick={handleCopyHash}
                  className="text-[var(--color-text-muted)] hover:text-blue-400 p-0.5 cursor-pointer"
                  title="Copy transaction hash"
                >
                  {copiedHash ? (
                    <Check className="h-3 w-3 text-emerald-400" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
          {explorerUrl && (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-4 text-xs font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] transition-colors cursor-pointer"
            >
              <span>View On Stellar Explorer</span>
              <ExternalLink className="h-3.5 w-3.5 text-blue-400" />
            </a>
          )}

          <button
            type="button"
            onClick={() => {
              onClose();
              onNavigateHome?.();
            }}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-xs font-semibold text-white shadow-lg shadow-emerald-600/30 hover:bg-emerald-500 transition-all cursor-pointer"
          >
            <span>Done</span>
          </button>
        </div>
      </div>
    </div>
  );
};
