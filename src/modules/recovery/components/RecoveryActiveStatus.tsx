import {
  AlertCircle,
  Check,
  Clock,
  Copy,
  ExternalLink,
  Loader2,
  Mail,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldOff,
  X,
} from 'lucide-react';
import type { FC, FormEvent } from 'react';
import { useCallback, useEffect, useState } from 'react';

import { WalletType } from '@/modules/walletconnect/constants/Wallet';
import { useWalletConnect } from '@/modules/walletconnect/hooks/useWalletConnect';

import { SPAREKEY_CONFIG } from '../constants';
import { checkOnChainRegistration } from '../services/sparekeyContractService';
import { useRecoveryStore } from '../store/recoveryStore';
import { RecoveryFaqAccordion } from './RecoveryFaqAccordion';

interface RecoveryActiveStatusProps {
  onChangeEmail: () => void;
  onInitiateTestRecovery?: () => void;
}

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
  const storedWallet = useRecoveryStore(state => state.walletAddress || '');
  const storedCommitment = useRecoveryStore(state => state.commitmentHex || '');
  const isConfigured = useRecoveryStore(state => state.isConfigured);
  const isOnChainVerified = useRecoveryStore(state => state.isOnChainVerified);

  const [searchAddress, setSearchAddress] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [searchError, setSearchError] = useState('');
  const [isSearchingAnother, setIsSearchingAnother] = useState(false);

  const activeWallet = (
    searchAddress.trim() ||
    activeStellarWallet ||
    (storedWallet && storedWallet.startsWith('G') && storedWallet.length === 56 ? storedWallet : '')
  ).trim();

  const isLookingUpExternal = Boolean(
    searchAddress.trim() &&
    (!activeStellarWallet ||
      searchAddress.trim().toLowerCase() !== activeStellarWallet.toLowerCase())
  );

  const isCurrentTargetStored =
    Boolean(activeWallet) &&
    Boolean(storedWallet) &&
    activeWallet.toLowerCase() === storedWallet.toLowerCase() &&
    (isConfigured || isOnChainVerified || Boolean(storedCommitment));

  const [copiedCommitment, setCopiedCommitment] = useState(false);
  const [copiedWallet, setCopiedWallet] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<{ message: string; statusCode?: number } | null>(null);
  const [isRegisteredOnChain, setIsRegisteredOnChain] = useState<boolean | null>(
    isCurrentTargetStored ? true : null
  );

  const verifyWalletStatus = useCallback(async (walletToCheck: string) => {
    if (!walletToCheck || !walletToCheck.startsWith('G') || walletToCheck.length !== 56) {
      setIsRegisteredOnChain(null);
      setSyncError(null);
      return;
    }

    const store = useRecoveryStore.getState();
    if (
      store.walletAddress &&
      store.walletAddress.toLowerCase() === walletToCheck.toLowerCase() &&
      (store.isConfigured || store.isOnChainVerified || Boolean(store.commitmentHex))
    ) {
      setIsRegisteredOnChain(true);
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
      setIsRegisteredOnChain(Boolean(res?.isRegistered));

      if (res?.isRegistered && store.walletAddress.toLowerCase() === walletToCheck.toLowerCase()) {
        store.confirmOnChainSetup({
          email: res?.owner === walletToCheck && store.email ? store.email : '',
          commitmentHex: res?.commitmentHex || store.commitmentHex,
          saltHex: res?.saltHex || '',
          walletAddress: walletToCheck,
        });
      }
    } catch (err: any) {
      console.warn('Failed to query on-chain registration in active status:', err);
      setSyncError({
        message: err?.message || 'Failed to check recovery status from server',
        statusCode: err?.statusCode || err?.status,
      });
      setIsRegisteredOnChain(null);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  useEffect(() => {
    if (activeWallet) {
      verifyWalletStatus(activeWallet);
    } else {
      setIsRegisteredOnChain(null);
      setSyncError(null);
    }
  }, [activeWallet, verifyWalletStatus]);

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    const clean = searchInput.trim();
    if (!clean || !clean.startsWith('G') || clean.length !== 56) {
      setSearchError('Please enter a valid 56-character Stellar public address starting with G.');
      return;
    }
    setSearchError('');
    setSearchAddress(clean);
    setIsSearchingAnother(false);
  };

  const handleClearSearch = () => {
    setSearchAddress('');
    setSearchInput('');
    setSearchError('');
    setIsSearchingAnother(false);
  };

  const handleCopyCommitment = () => {
    const val = storedCommitment;
    if (val && navigator?.clipboard?.writeText) {
      navigator.clipboard
        .writeText(val)
        .then(() => {
          setCopiedCommitment(true);
          setTimeout(() => setCopiedCommitment(false), 2000);
        })
        .catch(() => {});
    }
  };

  const handleCopyWallet = () => {
    if (activeWallet && navigator?.clipboard?.writeText) {
      navigator.clipboard
        .writeText(activeWallet)
        .then(() => {
          setCopiedWallet(true);
          setTimeout(() => setCopiedWallet(false), 2000);
        })
        .catch(() => {});
    }
  };

  const handleStartRecoveryForWallet = () => {
    if (activeWallet) {
      useRecoveryStore.getState().setTargetWallet(activeWallet);
    }
    onInitiateTestRecovery?.();
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Wallet Lookup & Switcher Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/80 p-3 sm:p-4 backdrop-blur-sm">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                Protection Status
              </span>
              {isLookingUpExternal && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                  Lookup
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 pt-0.5">
              <span className="font-mono text-xs sm:text-sm font-semibold text-[var(--color-text-primary)] truncate">
                {activeWallet
                  ? `${activeWallet.slice(0, 10)}...${activeWallet.slice(-8)}`
                  : 'No wallet selected'}
              </span>
              {activeWallet && (
                <button
                  type="button"
                  onClick={handleCopyWallet}
                  className="text-[var(--color-text-muted)] hover:text-blue-400 transition-colors cursor-pointer p-0.5"
                  title="Copy address"
                >
                  {copiedWallet ? (
                    <Check className="h-3 w-3 text-emerald-400" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {isLookingUpExternal && activeStellarWallet && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] transition-colors cursor-pointer"
              title="Return to connected wallet"
            >
              <X className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">My Wallet</span>
            </button>
          )}

          {activeWallet && (
            <button
              type="button"
              disabled={isSyncing}
              onClick={() => verifyWalletStatus(activeWallet)}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] transition-colors cursor-pointer disabled:opacity-50"
              title="Refresh ledger verification"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin text-blue-400' : ''}`}
              />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setIsSearchingAnother(v => !v);
              setSearchError('');
            }}
            className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-colors cursor-pointer ${
              isSearchingAnother
                ? 'border-blue-500/40 bg-blue-500/10 text-blue-400'
                : 'border-[var(--color-border)] bg-[var(--color-bg-primary)] text-blue-400 hover:bg-[var(--color-bg-tertiary)] hover:border-blue-500/40'
            }`}
          >
            <Search className="h-3.5 w-3.5" />
            <span>{isSearchingAnother ? 'Close' : 'Lookup Any Address'}</span>
          </button>
        </div>
      </div>

      {/* Address Search Panel if toggled or if no wallet is selected */}
      {(isSearchingAnother || !activeWallet) && (
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/95 p-4 sm:p-6 shadow-xl space-y-3.5 animate-in fade-in duration-200">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)] font-['Space_Grotesk']">
                Verify Any Stellar Address
              </h3>
              <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                Enter any 56-character Stellar public key (starts with G) to inspect smart contract
                guardian protection.
              </p>
            </div>
            {isSearchingAnother && activeWallet && (
              <button
                type="button"
                onClick={() => setIsSearchingAnother(false)}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] p-1 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <form onSubmit={handleSearchSubmit} className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={searchInput}
                onChange={e => {
                  setSearchInput(e.target.value.trim());
                  if (searchError) setSearchError('');
                }}
                placeholder="e.g. GAVWVHXX7JTT2HGFTZXZV2BAQ3ZLHMKMP2Y4GMGVQZO6DDBO7XIXT5OV"
                className="flex-1 h-11 px-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] font-mono text-xs sm:text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-blue-500 transition-colors"
              />
              <button
                type="submit"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-xs font-semibold text-white shadow-lg shadow-blue-600/25 hover:bg-blue-500 transition-colors cursor-pointer shrink-0"
              >
                <Search className="h-3.5 w-3.5" />
                <span>Verify Status</span>
              </button>
            </div>

            {searchError && <p className="text-xs text-rose-400 font-medium">{searchError}</p>}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              {activeStellarWallet ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput(activeStellarWallet);
                    setSearchError('');
                  }}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors cursor-pointer font-mono"
                >
                  Paste connected wallet ({activeStellarWallet.slice(0, 6)}...
                  {activeStellarWallet.slice(-4)})
                </button>
              ) : (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-[var(--color-text-muted)]">
                    Have Freighter or WalletConnect?
                  </span>
                  <button
                    type="button"
                    onClick={openModal}
                    className="font-semibold text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
                  >
                    Connect Wallet →
                  </button>
                </div>
              )}
            </div>
          </form>
        </div>
      )}

      {/* Main Status Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7 space-y-6">
          {!activeWallet ? (
            /* Empty state: No wallet selected */
            <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/90 p-8 sm:p-12 shadow-xl text-center space-y-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
                <Search className="h-7 w-7" />
              </div>
              <div className="space-y-1.5 max-w-md mx-auto">
                <h3 className="text-lg font-bold font-['Space_Grotesk'] text-[var(--color-text-primary)]">
                  Lookup Wallet Guardian Status
                </h3>
                <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] leading-relaxed">
                  Enter any Stellar wallet address above or connect your wallet to inspect active
                  smart contract protection.
                </p>
              </div>
              {!activeStellarWallet && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={openModal}
                    className="inline-flex h-11 items-center justify-center rounded-xl bg-blue-600 px-6 text-xs font-semibold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500 transition-all cursor-pointer"
                  >
                    <span>Connect Stellar Wallet</span>
                  </button>
                </div>
              )}
            </div>
          ) : isSyncing && isRegisteredOnChain === null && !syncError ? (
            /* Loading state */
            <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/90 p-12 text-center space-y-4 shadow-xl">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-400" />
              <p className="text-sm text-[var(--color-text-muted)]">
                Querying recovery guardian status...
              </p>
            </div>
          ) : syncError ? (
            /* CLEAN ERROR STATE WITH RED BORDER */
            <div className="rounded-3xl border border-rose-500/40 bg-[var(--color-bg-secondary)]/90 p-6 sm:p-8 shadow-xl backdrop-blur-sm space-y-6 animate-in fade-in duration-200">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400">
                  <AlertCircle className="h-5 w-5 stroke-[2.2]" />
                </div>
                <div className="space-y-1 min-w-0 pt-0.5">
                  <h2 className="text-lg sm:text-xl font-bold text-[var(--color-text-primary)] font-['Space_Grotesk']">
                    {syncError.statusCode === 401 ||
                    syncError.message.toLowerCase().includes('token')
                      ? 'Authentication Required'
                      : 'Unable to Verify Protection Status'}
                  </h2>
                  <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] leading-relaxed">
                    {syncError.statusCode === 401 ||
                    syncError.message.toLowerCase().includes('token')
                      ? 'Please connect your Stellar wallet to authenticate and inspect active guardian protection.'
                      : 'Unable to reach the recovery service. Please try again shortly or check another address.'}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                {!activeStellarWallet && (
                  <button
                    type="button"
                    onClick={openModal}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 text-xs font-semibold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500 transition-all cursor-pointer"
                  >
                    <span>Connect Wallet to Authenticate</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={isSyncing}
                  onClick={() => verifyWalletStatus(activeWallet)}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-5 text-xs font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] transition-all cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin text-blue-400' : ''}`}
                  />
                  <span>Retry Check</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsSearchingAnother(true);
                    setSearchInput('');
                  }}
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-transparent px-4 text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
                >
                  <span>Check Another Address</span>
                </button>
              </div>
            </div>
          ) : isRegisteredOnChain === false ? (
            /* CLEAN NOT REGISTERED STATE */
            <div className="relative overflow-hidden rounded-3xl border border-[var(--color-border)] bg-gradient-to-b from-[var(--color-bg-secondary)]/95 to-[var(--color-bg-primary)] p-6 sm:p-8 shadow-xl space-y-6">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
                  <ShieldOff className="h-6 w-6 stroke-[2]" />
                </div>
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg sm:text-xl font-bold font-['Space_Grotesk'] text-[var(--color-text-primary)]">
                      No Guardian Registered
                    </h2>
                    <span className="rounded-full bg-slate-500/10 border border-slate-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-[var(--color-text-muted)]">
                      Unprotected
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] leading-relaxed">
                    Wallet{' '}
                    <span className="font-mono font-semibold text-[var(--color-text-primary)]">
                      {activeWallet
                        ? `${activeWallet.slice(0, 8)}...${activeWallet.slice(-8)}`
                        : ''}
                    </span>{' '}
                    does not have a recovery guardian registered on the SpareKey smart contract.
                  </p>
                </div>
              </div>

              {/* Informative Security Perks */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)]/60 p-3.5 space-y-1">
                  <span className="font-semibold text-[var(--color-text-primary)] flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                    Zero-Knowledge Privacy
                  </span>
                  <p className="text-[var(--color-text-muted)] leading-relaxed">
                    Email address is protected via cryptographic Poseidon hashing on Soroban.
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)]/60 p-3.5 space-y-1">
                  <span className="font-semibold text-[var(--color-text-primary)] flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                    Autonomous Asset Sweep
                  </span>
                  <p className="text-[var(--color-text-muted)] leading-relaxed">
                    Recover your XLM & Soroban tokens automatically if secret keys are lost.
                  </p>
                </div>
              </div>

              <div className="pt-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <button
                  type="button"
                  onClick={onChangeEmail}
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-blue-600 px-7 text-xs font-semibold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500 transition-all cursor-pointer"
                >
                  <span>Register Guardian Protection</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsSearchingAnother(true);
                    setSearchInput('');
                  }}
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-5 text-xs font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] transition-all cursor-pointer"
                >
                  <span>Check Another Address</span>
                </button>
              </div>
            </div>
          ) : (
            /* REGISTERED & PROTECTED STATE */
            <div className="relative overflow-hidden rounded-3xl border border-emerald-500/30 bg-gradient-to-b from-[var(--color-bg-secondary)]/95 to-[var(--color-bg-primary)] p-6 sm:p-8 shadow-xl backdrop-blur-sm space-y-6">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shadow-lg shadow-emerald-500/10">
                  <ShieldCheck className="h-6 w-6 stroke-[2.2]" />
                </div>
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg sm:text-xl font-bold text-[var(--color-text-primary)] font-['Space_Grotesk']">
                      Secured by SpareKey Guardian
                    </h2>
                    {isSyncing && <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-400" />}
                  </div>
                  <p className="text-xs sm:text-sm text-[var(--color-text-secondary)]">
                    Zero-Knowledge cryptographic commitment is active on Stellar Soroban.
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] divide-y divide-[var(--color-border)]/60 text-xs sm:text-sm overflow-hidden">
                <div className="flex items-center justify-between p-4">
                  <span className="text-[var(--color-text-muted)] font-medium">
                    Protected Wallet
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-[var(--color-text-primary)]">
                      {activeWallet
                        ? `${activeWallet.slice(0, 8)}...${activeWallet.slice(-8)}`
                        : 'None'}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyWallet}
                      className="text-[var(--color-text-muted)] hover:text-blue-400 cursor-pointer p-0.5"
                    >
                      {copiedWallet ? (
                        <Check className="h-3 w-3 text-emerald-400" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4">
                  <span className="text-[var(--color-text-muted)] font-medium">Recovery Email</span>
                  <span className="font-medium text-[var(--color-text-primary)]">
                    {storedEmail &&
                    (!storedWallet || storedWallet.toLowerCase() === activeWallet.toLowerCase())
                      ? storedEmail
                      : 'Protected on-chain (Poseidon hash)'}
                  </span>
                </div>

                <div className="flex items-center justify-between p-4">
                  <span className="text-[var(--color-text-muted)] font-medium">Smart Contract</span>
                  {SPAREKEY_CONFIG?.contractId ? (
                    <a
                      href={`https://stellar.expert/explorer/testnet/contract/${SPAREKEY_CONFIG.contractId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 hover:border-blue-500/40 transition-colors"
                    >
                      <span className="font-mono">
                        {SPAREKEY_CONFIG.contractId.length >= 12
                          ? `${SPAREKEY_CONFIG.contractId.slice(0, 6)}...${SPAREKEY_CONFIG.contractId.slice(-6)}`
                          : SPAREKEY_CONFIG.contractId}
                      </span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                      <span>Soroban Smart Contract (Testnet)</span>
                    </span>
                  )}
                </div>

                {storedCommitment && (
                  <div className="flex items-center justify-between p-4">
                    <span className="text-[var(--color-text-muted)] font-medium">
                      ZK Poseidon Commitment
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyCommitment}
                      className="font-mono text-xs text-[var(--color-text-secondary)] hover:text-blue-400 flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>
                        {storedCommitment.length >= 16
                          ? `${storedCommitment.slice(0, 8)}...${storedCommitment.slice(-8)}`
                          : storedCommitment}
                      </span>
                      {copiedCommitment ? (
                        <Check className="h-3 w-3 text-emerald-400" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                )}

                <div className="flex items-center justify-between p-4">
                  <span className="text-[var(--color-text-muted)] font-medium">
                    On-Chain Status
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-400 text-xs">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    Verified On-Chain
                  </span>
                </div>

                <div className="flex items-center justify-between p-4">
                  <span className="text-[var(--color-text-muted)] font-medium">Timelock Delay</span>
                  <div className="flex items-center gap-1.5 font-medium text-[var(--color-text-primary)]">
                    <Clock className="h-3.5 w-3.5 text-blue-400" />
                    <span>{SPAREKEY_CONFIG.minDelaySeconds} seconds</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                {onInitiateTestRecovery && (
                  <button
                    type="button"
                    onClick={handleStartRecoveryForWallet}
                    className="inline-flex h-11 items-center justify-center rounded-xl bg-blue-600 px-6 text-xs font-semibold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500 transition-colors cursor-pointer"
                  >
                    <span>Recover Funds</span>
                  </button>
                )}
              </div>

              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)]/70 p-4.5 space-y-3">
                <div className="flex items-start gap-3">
                  <Mail className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="text-xs font-semibold text-[var(--color-text-primary)]">
                      In Case of Lost Access
                    </h4>
                    <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                      Send an email from your linked inbox to claim@swiftexwallet.in with your new
                      destination address in the Subject. Zero-Knowledge proofs verify the DKIM
                      signature and sweep your balances automatically.
                    </p>
                  </div>
                </div>
                {onInitiateTestRecovery && (
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={handleStartRecoveryForWallet}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
                    >
                      <span>Simulate Lost Access & Test Recovery</span>
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-5 space-y-6">
          <RecoveryFaqAccordion />
        </div>
      </div>
    </div>
  );
};
