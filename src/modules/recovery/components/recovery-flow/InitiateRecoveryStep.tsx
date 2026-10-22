import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Edit2,
  ExternalLink,
  FileText,
  HelpCircle,
  Loader2,
  Lock,
  Mail,
  RotateCcw,
  Send,
  Upload,
  Wallet,
} from 'lucide-react';
import type { DragEvent, FC, FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

import { getRecoveryRelayerEmail } from '@/service/apiConfig';

import { TESTNET_USDC_ISSUER } from '../../constants';
import type { TargetRegistrationStatus } from '../../hooks/useRecoverWalletFlow';
import {
  type LedgerAssetBalance,
  checkWalletUsdcTrustline,
} from '../../services/sparekeyContractService';
import type { ParsedEmlResult } from '../../services/zkRecoveryService';

interface InitiateRecoveryStepProps {
  ownerWallet: string;
  onOwnerWalletChange: (wallet: string) => void;
  recoveryEmail: string;
  onRecoveryEmailChange: (email: string) => void;
  targetRegistrationStatus?: TargetRegistrationStatus;
  destinationAddress: string;
  onDestinationAddressChange: (dest: string) => void;
  targetBalances?: LedgerAssetBalance[];
  isLoadingBalances?: boolean;
  targetWalletError?: boolean;
  emlFileName: string;
  parsedEml: ParsedEmlResult | null;
  onEmlFileSelected: (file: File) => void;
  onSubmitEml: () => void;
  onTrackStatus: () => void;
  isSubmitting: boolean;
  isCheckingStatus?: boolean;
  submitError: string;
  submitSuccess: string;
  activeStellarWallet?: string;
  hasAuthToken?: boolean;
  onConnectWallet?: () => void;
  onOpenHelp?: () => void;
}

export const InitiateRecoveryStep: FC<InitiateRecoveryStepProps> = ({
  ownerWallet,
  onOwnerWalletChange,
  recoveryEmail,
  onRecoveryEmailChange,
  targetRegistrationStatus = 'idle',
  destinationAddress,
  onDestinationAddressChange,
  isLoadingBalances = false,
  emlFileName,
  parsedEml,
  onEmlFileSelected,
  onSubmitEml,
  onTrackStatus,
  isSubmitting,
  isCheckingStatus = false,
  submitError,
  submitSuccess,
  activeStellarWallet,
  hasAuthToken = false,
  onConnectWallet,
  onOpenHelp,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showManualUpload, setShowManualUpload] = useState(false);
  const [copiedTo, setCopiedTo] = useState(false);
  const [copiedSubject, setCopiedSubject] = useState(false);

  // Custom Relayer Recipient State
  const defaultRelayerEmail = getRecoveryRelayerEmail() || 'claim@swiftexwallet.in';
  const [customRecipientEmail, setCustomRecipientEmail] = useState('');
  const [isEditingRecipient, setIsEditingRecipient] = useState(false);

  const activeRecipientEmail = (customRecipientEmail.trim() || defaultRelayerEmail).trim();
  const isUsingDefaultRelayer =
    activeRecipientEmail.toLowerCase() === defaultRelayerEmail.toLowerCase();

  // Stellar Address Validator (must start with G and be 56 uppercase chars)
  const isValidStellarAddress = (addr: string): boolean => {
    return typeof addr === 'string' && /^G[A-Z2-7]{55}$/.test(addr.trim());
  };

  const isOwnerWalletValid = isValidStellarAddress(ownerWallet);
  const isOwnerWalletDirty = Boolean(ownerWallet && ownerWallet.trim().length > 0);

  const isDestinationValid = isValidStellarAddress(destinationAddress);
  const isDestinationDirty = Boolean(destinationAddress && destinationAddress.trim().length > 0);

  const isEmailFormatValid =
    !recoveryEmail || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recoveryEmail.trim());

  const [destTrustlineStatus, setDestTrustlineStatus] = useState<
    'idle' | 'checking' | 'has_usdc_trustline' | 'missing_usdc_trustline' | 'unfunded'
  >('idle');

  useEffect(() => {
    let isMounted = true;
    if (isDestinationValid) {
      setDestTrustlineStatus('checking');
      checkWalletUsdcTrustline(destinationAddress)
        .then(res => {
          if (!isMounted) return;
          if (!res.accountExists) {
            setDestTrustlineStatus('unfunded');
          } else if (res.hasTrustline) {
            setDestTrustlineStatus('has_usdc_trustline');
          } else {
            setDestTrustlineStatus('missing_usdc_trustline');
          }
        })
        .catch(() => {
          if (!isMounted) return;
          setDestTrustlineStatus('idle');
        });
    } else {
      setDestTrustlineStatus('idle');
    }
    return () => {
      isMounted = false;
    };
  }, [isDestinationValid, destinationAddress]);

  // Email parameters
  const emailSubject = isDestinationValid ? destinationAddress.trim() : '';

  const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
    activeRecipientEmail
  )}&su=${encodeURIComponent(emailSubject)}&body=`;

  const mailtoUrl = `mailto:${encodeURIComponent(activeRecipientEmail)}?subject=${encodeURIComponent(
    emailSubject
  )}`;

  const handleCopy = (text: string, type: 'to' | 'subject') => {
    if (!text || !navigator?.clipboard?.writeText) return;
    navigator.clipboard.writeText(text).catch(() => {});
    if (type === 'to') {
      setCopiedTo(true);
      setTimeout(() => setCopiedTo(false), 2000);
    } else {
      setCopiedSubject(true);
      setTimeout(() => setCopiedSubject(false), 2000);
    }
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      onEmlFileSelected(file);
    }
  };

  const handleManualEmlSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmitEml();
  };

  const canTrackRelayerStatus =
    isOwnerWalletValid && isDestinationValid && !isCheckingStatus && hasAuthToken;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div className="lg:col-span-7 space-y-6">
        <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/90 p-6 sm:p-8 shadow-xl backdrop-blur-sm space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-xl font-bold font-['Space_Grotesk'] text-[var(--color-text-primary)]">
                Initiate Wallet Recovery
              </h2>
              <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] leading-relaxed">
                Restore your lost wallet using decentralized Zero-Knowledge email verification.
              </p>
            </div>
            {onOpenHelp && (
              <button
                type="button"
                onClick={onOpenHelp}
                className="flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors shrink-0"
              >
                <HelpCircle className="h-3.5 w-3.5" />
                <span>Help</span>
              </button>
            )}
          </div>

          {/* Missing Auth Token / Disconnected Wallet Banner */}
          {!hasAuthToken && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="space-y-0.5">
                  <h4 className="text-sm font-bold text-[var(--color-text-primary)]">
                    Wallet Not Connected (Auth Token Missing)
                  </h4>
                  <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                    You need an active wallet session with an auth token to verify guardian
                    registration and track recovery status with the relayer.
                  </p>
                </div>
              </div>
              {onConnectWallet && (
                <button
                  type="button"
                  onClick={onConnectWallet}
                  className="shrink-0 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white shadow-md shadow-blue-600/30 transition-all cursor-pointer"
                >
                  Connect Wallet
                </button>
              )}
            </div>
          )}

          <div className="space-y-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] flex items-center gap-2">
                  <span>Original (Lost) Stellar Wallet</span>
                  {isOwnerWalletValid && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-medium normal-case">
                      <Check className="h-3 w-3" /> Valid Address
                    </span>
                  )}
                </label>

                {isLoadingBalances && (
                  <span className="flex items-center gap-1 text-[11px] text-blue-400 font-normal">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Checking balances...
                  </span>
                )}
              </div>

              <div className="relative">
                <input
                  type="text"
                  value={ownerWallet}
                  onChange={e => onOwnerWalletChange(e.target.value.trim())}
                  placeholder="e.g. GAB..."
                  className={`w-full h-11 px-3.5 rounded-xl border font-mono text-xs sm:text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none transition-colors ${
                    isOwnerWalletDirty && !isOwnerWalletValid
                      ? 'border-rose-500/80 bg-rose-500/5 focus:border-rose-500'
                      : isOwnerWalletValid
                        ? 'border-emerald-500/50 bg-[var(--color-bg-primary)] focus:border-emerald-500'
                        : 'border-[var(--color-border)] bg-[var(--color-bg-primary)] focus:border-blue-500'
                  }`}
                />
              </div>

              {isOwnerWalletDirty && !isOwnerWalletValid && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-400 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    Invalid Stellar address. Must be a 56-character public key starting with 'G'
                    (e.g. <code>GAB...</code>). Email addresses or short words are not valid wallet
                    addresses.
                  </span>
                </div>
              )}

              {/* Target Wallet Guardian Registration Status Display */}
              {isOwnerWalletValid && (
                <div className="pt-0.5">
                  {targetRegistrationStatus === 'checking' && (
                    <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-2.5 text-xs text-blue-400 flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                      <span>Verifying guardian registration on recovery contract...</span>
                    </div>
                  )}

                  {targetRegistrationStatus === 'registered' && (
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-400 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                      <span>
                        Verified: Target wallet has active guardian protection registered.
                      </span>
                    </div>
                  )}

                  {targetRegistrationStatus === 'not_registered' && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-300 flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
                      <div className="space-y-0.5">
                        <span className="font-semibold block text-amber-200">
                          No Guardian Protection Record Found
                        </span>
                        <span className="text-[11px] text-amber-300/90 leading-relaxed block">
                          This wallet does not have an active recovery guardian registered on the
                          SpareKey smart contract. Make sure you entered the correct wallet address
                          that was previously protected.
                        </span>
                      </div>
                    </div>
                  )}

                  {(targetRegistrationStatus === 'unauthenticated' || !hasAuthToken) && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-300 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
                        <span>Connect wallet to verify guardian registration.</span>
                      </div>
                      {onConnectWallet && (
                        <button
                          type="button"
                          onClick={onConnectWallet}
                          className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-[11px] cursor-pointer"
                        >
                          Connect
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] flex items-center justify-between">
                <span>Registered Guardian Email</span>
                <span className="text-[11px] text-[var(--color-text-muted)] font-normal">
                  Linked during wallet setup
                </span>
              </label>

              <div className="relative">
                <input
                  type="email"
                  value={recoveryEmail}
                  onChange={e => onRecoveryEmailChange(e.target.value.trim())}
                  placeholder="e.g. yourname@gmail.com"
                  className={`w-full h-11 pl-9 pr-3.5 rounded-xl border bg-[var(--color-bg-primary)] text-xs sm:text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none transition-colors ${
                    !isEmailFormatValid
                      ? 'border-rose-500/80 focus:border-rose-500'
                      : 'border-[var(--color-border)] focus:border-blue-500'
                  }`}
                />
                <Mail className="absolute left-3 top-3.5 h-4 w-4 text-[var(--color-text-muted)]" />
              </div>

              {!isEmailFormatValid && (
                <p className="text-xs text-rose-400">Please enter a valid email address.</p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] flex items-center gap-2">
                  <span>New Destination Wallet Address</span>
                  {isDestinationValid && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-medium normal-case">
                      <Check className="h-3 w-3" /> Valid Address
                    </span>
                  )}
                </label>

                {activeStellarWallet && activeStellarWallet !== destinationAddress && (
                  <button
                    type="button"
                    onClick={() => onDestinationAddressChange(activeStellarWallet)}
                    className="text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
                  >
                    Use connected ({activeStellarWallet.slice(0, 6)}...
                    {activeStellarWallet.slice(-4)})
                  </button>
                )}
              </div>

              <input
                type="text"
                value={destinationAddress}
                onChange={e => onDestinationAddressChange(e.target.value.trim())}
                placeholder="e.g. G..."
                className={`w-full h-11 px-3.5 rounded-xl border font-mono text-xs sm:text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none transition-colors ${
                  isDestinationDirty && !isDestinationValid
                    ? 'border-rose-500/80 bg-rose-500/5 focus:border-rose-500'
                    : isDestinationValid
                      ? 'border-emerald-500/50 bg-[var(--color-bg-primary)] focus:border-emerald-500'
                      : 'border-[var(--color-border)] bg-[var(--color-bg-primary)] focus:border-blue-500'
                }`}
              />

              {isDestinationDirty && !isDestinationValid && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-400 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    Invalid Stellar address. Must be a 56-character public key starting with 'G'.
                  </span>
                </div>
              )}

              {isDestinationValid && destTrustlineStatus === 'checking' && (
                <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] py-0.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />
                  <span>Checking destination wallet trustlines on Stellar Testnet...</span>
                </div>
              )}

              {isDestinationValid && destTrustlineStatus === 'has_usdc_trustline' && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  <span>Destination wallet verified: active USDC trustline established.</span>
                </div>
              )}

              {isDestinationValid && destTrustlineStatus === 'missing_usdc_trustline' && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300 flex items-start gap-2.5">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                  <div className="space-y-1">
                    <span className="font-semibold text-amber-200 block">
                      USDC Trustline Notice
                    </span>
                    <span className="leading-relaxed">
                      This destination wallet does not currently have a USDC trustline. If USDC was
                      protected during registration, transfer of USDC will fail unless the
                      destination wallet establishes a trustline for USDC (
                      {TESTNET_USDC_ISSUER.slice(0, 6)}...{TESTNET_USDC_ISSUER.slice(-4)}).
                    </span>
                  </div>
                </div>
              )}

              {isDestinationValid && destTrustlineStatus === 'unfunded' && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300 flex items-start gap-2.5">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                  <div className="space-y-1">
                    <span className="font-semibold text-amber-200 block">
                      Destination Account Not Funded
                    </span>
                    <span className="leading-relaxed">
                      This destination wallet does not exist on Stellar Testnet yet. Please fund it
                      with friendbot and establish a USDC trustline so it can receive protected
                      assets.
                    </span>
                  </div>
                </div>
              )}
            </div>

            {submitError && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-400 flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{submitError}</span>
              </div>
            )}

            {submitSuccess && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-400 flex items-start gap-2.5">
                <Loader2 className="h-4 w-4 animate-spin shrink-0 mt-0.5" />
                <span className="leading-relaxed">{submitSuccess}</span>
              </div>
            )}

            {/* STEP 1: Send Recovery Email Card */}
            {!isOwnerWalletValid ? (
              <div className="relative rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/50 p-6 text-center space-y-3 shadow-md backdrop-blur-sm">
                <div className="mx-auto w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
                  <Lock className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-[var(--color-text-primary)]">
                    Step 1 Locked
                  </h4>
                  <p className="text-xs text-[var(--color-text-secondary)] max-w-md mx-auto leading-relaxed">
                    Please enter your valid <strong>Original (Lost) Stellar Wallet address</strong>{' '}
                    above first to unlock recovery instructions, relayer details, and verification
                    steps.
                  </p>
                </div>
              </div>
            ) : (
              <div className="relative p-[1.5px] rounded-2xl overflow-hidden shadow-[0_0_20px_rgba(59,130,246,0.2)] hover:shadow-[0_0_25px_rgba(59,130,246,0.35)] transition-all duration-300">
                <div className="absolute -inset-[200%] animate-[spin_4s_linear_infinite] bg-[conic-gradient(from_0deg_at_50%_50%,transparent_0%,#3b82f6_20%,#93c5fd_30%,#ffffff_35%,transparent_38%,transparent_50%,#3b82f6_70%,#93c5fd_80%,#ffffff_85%,transparent_88%)] will-change-transform opacity-95" />
                <div
                  style={{
                    background: 'var(--color-bg-secondary)',
                  }}
                  className="relative rounded-[15px] p-4 sm:p-5 space-y-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/20 text-blue-400">
                        <Send className="h-4 w-4" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-sm font-bold text-[var(--color-text-primary)]">
                          Step 1: Send Recovery Email
                        </h4>
                        <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                          Send an email from your registered guardian inbox to the recipient below.
                        </p>
                      </div>
                    </div>

                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-full border shrink-0 ${
                        isUsingDefaultRelayer
                          ? 'border-blue-500/30 bg-blue-500/10 text-blue-400'
                          : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                      }`}
                    >
                      {isUsingDefaultRelayer ? 'Auto-Relayer' : 'Custom Recipient'}
                    </span>
                  </div>

                  <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-3.5 space-y-2.5 text-xs">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[var(--color-text-muted)] font-mono">To:</span>
                        <div className="flex items-center gap-2">
                          {!isEditingRecipient ? (
                            <>
                              <span className="font-mono font-semibold text-[var(--color-text-primary)]">
                                {activeRecipientEmail}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCopy(activeRecipientEmail, 'to')}
                                className="text-[var(--color-text-muted)] hover:text-blue-400 transition-colors"
                                title="Copy email"
                              >
                                {copiedTo ? (
                                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => setIsEditingRecipient(true)}
                                className="text-[11px] text-blue-400 hover:text-blue-300 font-medium inline-flex items-center gap-1 transition-colors"
                                title="Change relayer email"
                              >
                                <Edit2 className="h-3 w-3" />
                                <span>Change</span>
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setCustomRecipientEmail('');
                                setIsEditingRecipient(false);
                              }}
                              className="text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] inline-flex items-center gap-1"
                            >
                              <RotateCcw className="h-3 w-3" />
                              <span>Reset to default</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {isEditingRecipient && (
                        <div className="pt-1 space-y-1.5">
                          <div className="flex items-center gap-2">
                            <input
                              type="email"
                              value={customRecipientEmail}
                              onChange={e => {
                                setCustomRecipientEmail(e.target.value.trim());
                                if (!showManualUpload) setShowManualUpload(true);
                              }}
                              placeholder={`Default: ${defaultRelayerEmail}`}
                              className="flex-1 h-8 px-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] font-mono text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-blue-500"
                            />
                            <button
                              type="button"
                              onClick={() => setIsEditingRecipient(false)}
                              className="h-8 px-3 rounded-lg bg-blue-600 text-xs font-semibold text-white hover:bg-blue-500"
                            >
                              Save
                            </button>
                          </div>
                          <p className="text-[11px] text-amber-400 leading-relaxed">
                            Notice: When sending to a custom email (instead of {defaultRelayerEmail}
                            ), you will need to download the delivered .eml file and upload it below
                            for ZK verification.
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-[var(--color-border)]/50">
                      <span className="text-[var(--color-text-muted)] font-mono">Subject:</span>
                      <div className="flex items-center gap-2 font-mono truncate">
                        {isDestinationValid ? (
                          <>
                            <span className="truncate text-emerald-400 font-semibold">
                              {destinationAddress}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopy(destinationAddress, 'subject')}
                              className="text-[var(--color-text-muted)] hover:text-blue-400 transition-colors shrink-0"
                              title="Copy destination address"
                            >
                              {copiedSubject ? (
                                <Check className="h-3.5 w-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </>
                        ) : (
                          <span className="text-amber-400/90 text-xs italic">
                            {isDestinationDirty
                              ? 'Invalid address above'
                              : 'Enter destination wallet above'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    <a
                      href={hasAuthToken && isDestinationValid ? gmailUrl : undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => {
                        if (!hasAuthToken) {
                          e.preventDefault();
                          onConnectWallet?.();
                          return;
                        }
                        if (!isDestinationValid) {
                          e.preventDefault();
                          alert(
                            'Please enter a valid 56-character Stellar destination wallet address first.'
                          );
                        }
                      }}
                      className={`flex items-center justify-center gap-1.5 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2.5 text-xs font-semibold transition-all text-center ${
                        hasAuthToken && isDestinationValid
                          ? 'text-blue-400 hover:bg-blue-500/20 cursor-pointer'
                          : 'text-blue-400/40 opacity-60 cursor-pointer'
                      }`}
                    >
                      <Mail className="h-3.5 w-3.5" />
                      <span>Open in Gmail</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>

                    <a
                      href={hasAuthToken && isDestinationValid ? mailtoUrl : undefined}
                      onClick={e => {
                        if (!hasAuthToken) {
                          e.preventDefault();
                          onConnectWallet?.();
                          return;
                        }
                        if (!isDestinationValid) {
                          e.preventDefault();
                          alert(
                            'Please enter a valid 56-character Stellar destination wallet address first.'
                          );
                        }
                      }}
                      className={`flex items-center justify-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-4 py-2.5 text-xs font-semibold transition-all text-center ${
                        hasAuthToken && isDestinationValid
                          ? 'text-[var(--color-text-primary)] hover:border-blue-500/40 cursor-pointer'
                          : 'text-[var(--color-text-muted)] opacity-60 cursor-pointer'
                      }`}
                    >
                      <Mail className="h-3.5 w-3.5" />
                      <span>Open Default Mail App</span>
                    </a>
                  </div>

                  <div className="space-y-1.5">
                    {!hasAuthToken ? (
                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={onConnectWallet}
                          className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 hover:from-blue-500 hover:to-indigo-500 active:scale-[0.99] transition-all cursor-pointer"
                        >
                          <Wallet className="h-4 w-4" />
                          <span>Connect Wallet to Proceed</span>
                        </button>
                        <p className="text-[11px] text-center text-amber-400/90 font-medium">
                          Wallet session required to authenticate with the recovery relayer.
                        </p>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={onTrackStatus}
                          disabled={!canTrackRelayerStatus}
                          className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                          {isCheckingStatus ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span>Checking Relayer Status...</span>
                            </>
                          ) : (
                            <span>I've Sent the Email — Track Progress</span>
                          )}
                        </button>

                        {!canTrackRelayerStatus && (
                          <p className="text-[11px] text-center text-[var(--color-text-muted)]">
                            {!isOwnerWalletValid
                              ? 'Enter a valid original Stellar wallet address starting with G'
                              : !isDestinationValid
                                ? 'Enter a valid new destination Stellar wallet address starting with G'
                                : ''}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowManualUpload(!showManualUpload)}
                className="flex items-center justify-between w-full py-2 text-xs font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer border-t border-[var(--color-border)]/50"
              >
                <span>
                  {!isUsingDefaultRelayer
                    ? 'Upload raw .eml file (Required for custom recipient)'
                    : "Don't want to use relayer email? Upload raw .eml file manually"}
                </span>
                {showManualUpload ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>

              {showManualUpload &&
                (!isOwnerWalletValid ? (
                  <div className="mt-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-300 flex items-center gap-2.5">
                    <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
                    <span>
                      Please enter your valid Original (Lost) Stellar Wallet address above before
                      uploading .eml files.
                    </span>
                  </div>
                ) : (
                  <form
                    onSubmit={handleManualEmlSubmit}
                    className="mt-3 space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)]/80 p-4 sm:p-5"
                  >
                    <div className="space-y-1">
                      <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] block">
                        Manual .EML Upload (Fallback)
                      </span>
                      <p className="text-xs text-[var(--color-text-secondary)]">
                        Upload the downloaded .eml message file from your email client to verify
                        DKIM proofs manually.
                      </p>
                    </div>

                    <div
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition-all cursor-pointer ${
                        isDragging
                          ? 'border-blue-500 bg-blue-500/10'
                          : emlFileName
                            ? 'border-emerald-500/40 bg-emerald-500/5'
                            : 'border-[var(--color-border)] bg-[var(--color-bg-secondary)] hover:border-blue-500/40'
                      }`}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".eml,message/rfc822"
                        className="hidden"
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (file) onEmlFileSelected(file);
                        }}
                      />

                      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400 mb-2">
                        {emlFileName ? (
                          <FileText className="h-5 w-5 text-emerald-400" />
                        ) : (
                          <Upload className="h-5 w-5" />
                        )}
                      </div>

                      <div className="space-y-0.5">
                        <p className="text-xs sm:text-sm font-semibold text-[var(--color-text-primary)]">
                          {emlFileName ? emlFileName : 'Drop your downloaded .eml file here'}
                        </p>
                        <p className="text-[11px] text-[var(--color-text-secondary)]">
                          {emlFileName
                            ? 'File selected. Ready to verify.'
                            : 'or click to browse from computer'}
                        </p>
                      </div>
                    </div>

                    {parsedEml && (
                      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[var(--color-text-muted)] font-medium">
                            DKIM Signature
                          </span>
                          <span
                            className={`font-semibold ${parsedEml.hasDkim ? 'text-emerald-400' : 'text-amber-400'}`}
                          >
                            {parsedEml.hasDkim ? 'Verified in headers' : 'Not detected'}
                          </span>
                        </div>
                        {parsedEml.extractedDestination && (
                          <div className="flex items-center justify-between">
                            <span className="text-[var(--color-text-muted)] font-medium">
                              Destination in Subject
                            </span>
                            <span className="font-mono text-[var(--color-text-primary)]">
                              {parsedEml.extractedDestination.slice(0, 8)}...
                              {parsedEml.extractedDestination.slice(-8)}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isSubmitting || !emlFileName || !isOwnerWalletValid}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-md hover:from-blue-500 hover:to-indigo-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Verifying & Submitting .EML...</span>
                        </>
                      ) : (
                        <span>Submit & Verify .EML File</span>
                      )}
                    </button>
                  </form>
                ))}
            </div>
          </div>
        </div>
      </div>
      <div className="lg:col-span-5 space-y-6">
        <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/90 p-6 sm:p-8 shadow-xl space-y-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
              <Mail className="h-5 w-5" />
            </div>
            <div className="space-y-0.5">
              <h3 className="text-base font-bold text-[var(--color-text-primary)] font-['Space_Grotesk']">
                How Email Recovery Works
              </h3>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Fully automated via relayer or manual proof
              </p>
            </div>
          </div>

          <div className="space-y-4 text-xs">
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)]/80 p-4 space-y-2">
              <span className="font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500/20 text-[11px] font-bold text-blue-400">
                  1
                </span>
                Send email to relayer
              </span>
              <p className="text-[var(--color-text-secondary)] leading-relaxed">
                Send an email from your registered guardian inbox to{' '}
                <span className="font-mono font-semibold text-blue-400">
                  {activeRecipientEmail}
                </span>{' '}
                with your new destination address in the Subject.
              </p>
            </div>

            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)]/80 p-4 space-y-1.5">
              <span className="font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500/20 text-[11px] font-bold text-blue-400">
                  2
                </span>
                Automatic ZK proof verification
              </span>
              <p className="text-[var(--color-text-secondary)] leading-relaxed">
                {isUsingDefaultRelayer
                  ? 'Our backend relayer verifies the DKIM cryptographic signature in your email headers and submits the proof on-chain.'
                  : 'Since you are using a custom recipient, download the delivered .eml message file and upload it manually.'}
              </p>
            </div>

            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)]/80 p-4 space-y-1.5">
              <span className="font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500/20 text-[11px] font-bold text-blue-400">
                  3
                </span>
                Execute sweep to new wallet
              </span>
              <p className="text-[var(--color-text-secondary)] leading-relaxed">
                Once verified, click <strong>"Execute Sweep Funds"</strong> in the tracker to
                transfer all protected assets to your new wallet.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
