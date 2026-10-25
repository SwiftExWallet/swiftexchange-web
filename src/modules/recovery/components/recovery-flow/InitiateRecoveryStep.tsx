import {
  AlertCircle,
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
  Upload,
} from 'lucide-react';
import type { DragEvent, FC, FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

import { getRecoveryRelayerEmail } from '@/service/apiConfig';

import { TESTNET_USDC_ISSUER } from '../../constants';
import {
  type LedgerAssetBalance,
  checkWalletUsdcTrustline,
  isValidStellarPublicKey,
} from '../../services/sparekeyContractService';
import type { ParsedEmlResult } from '../../services/zkRecoveryService';

interface InitiateRecoveryStepProps {
  ownerWallet: string;
  onOwnerWalletChange: (wallet: string) => void;
  recoveryEmail: string;
  onRecoveryEmailChange: (email: string) => void;
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

const truncateHash = (str?: string, start = 6, end = 4): string => {
  if (!str) return '';
  if (str.length <= start + end) return str;
  return `${str.slice(0, start)}...${str.slice(-end)}`;
};

export const InitiateRecoveryStep: FC<InitiateRecoveryStepProps> = ({
  ownerWallet,
  onOwnerWalletChange,
  recoveryEmail,
  onRecoveryEmailChange,
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

  const defaultRelayerEmail = getRecoveryRelayerEmail() || 'claim@swiftexwallet.in';
  const [customRecipientEmail, setCustomRecipientEmail] = useState('');
  const [isEditingRecipient, setIsEditingRecipient] = useState(false);

  const activeRecipientEmail = (customRecipientEmail.trim() || defaultRelayerEmail).trim();
  const isUsingDefaultRelayer =
    activeRecipientEmail.toLowerCase() === defaultRelayerEmail.toLowerCase();

  const isOwnerWalletValid = isValidStellarPublicKey(ownerWallet);
  const isOwnerWalletDirty = Boolean(ownerWallet && ownerWallet.trim().length > 0);

  const isDestinationValid = isValidStellarPublicKey(destinationAddress);
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

  const recoverySteps = [
    {
      title: 'Send Recovery Email',
      desc: `Email ${activeRecipientEmail} from your registered recovery inbox with your new Stellar wallet address as the subject.`,
    },
    {
      title: 'Signature Verification',
      desc: isUsingDefaultRelayer
        ? 'The relayer verifies your email signature automatically and submits the proof on-chain.'
        : 'Download the delivered .eml file from your custom inbox and upload it manually below.',
    },
    {
      title: 'Transfer Funds',
      desc: 'Once verified, complete the transfer in the tracker to move your protected balances to your new wallet.',
    },
  ];

  return (
    <div className="max-w-5xl mx-auto">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        <div className="lg:col-span-7 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-5 sm:p-7 shadow-lg space-y-6">
          <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)]/60 pb-4">
            <div>
              <h2 className="text-lg sm:text-xl font-bold font-['Space_Grotesk'] text-[var(--color-text-primary)]">
                Recover Wallet Funds
              </h2>
              <p className="mt-0.5 text-xs sm:text-sm text-[var(--color-text-muted)]">
                Verify your recovery email to move balances to a new Stellar address.
              </p>
            </div>
            {onOpenHelp && (
              <button
                type="button"
                onClick={onOpenHelp}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors shrink-0 cursor-pointer"
              >
                <HelpCircle className="h-3.5 w-3.5" />
                <span>Help</span>
              </button>
            )}
          </div>

          {!hasAuthToken && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5">
              <span className="text-xs text-amber-400 leading-relaxed">
                Connect any Stellar wallet to authenticate with the recovery relayer.
              </span>
              {onConnectWallet && (
                <button
                  type="button"
                  onClick={onConnectWallet}
                  className="shrink-0 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 transition-colors cursor-pointer"
                >
                  Connect
                </button>
              )}
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-[var(--color-text-secondary)]">
                  Lost Wallet Address
                </label>
                {isLoadingBalances && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-blue-400">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Checking...
                  </span>
                )}
              </div>

              <input
                type="text"
                value={ownerWallet}
                onChange={e => onOwnerWalletChange(e.target.value.trim())}
                placeholder="Enter 56-character Stellar address (G...)"
                className={`w-full h-11 px-3.5 rounded-xl border font-mono text-xs sm:text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none transition-colors ${
                  isOwnerWalletDirty && !isOwnerWalletValid
                    ? 'border-rose-500/80 bg-rose-500/5 focus:border-rose-500'
                    : 'border-[var(--color-border)] bg-[var(--color-bg-primary)] focus:border-blue-500'
                }`}
              />

              {isOwnerWalletDirty && !isOwnerWalletValid && (
                <p className="text-xs text-rose-400">
                  Enter a valid 56-character Stellar public key starting with G.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-[var(--color-text-secondary)]">
                  Recovery Email
                </label>
                <span className="text-[11px] text-[var(--color-text-muted)]">
                  Linked during setup
                </span>
              </div>

              <input
                type="email"
                value={recoveryEmail}
                onChange={e => onRecoveryEmailChange(e.target.value.trim())}
                placeholder="name@example.com"
                className={`w-full h-11 px-3.5 rounded-xl border bg-[var(--color-bg-primary)] text-xs sm:text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none transition-colors ${
                  !isEmailFormatValid
                    ? 'border-rose-500/80 focus:border-rose-500'
                    : 'border-[var(--color-border)] focus:border-blue-500'
                }`}
              />

              {!isEmailFormatValid && (
                <p className="text-xs text-rose-400">Please enter a valid email address.</p>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-[var(--color-text-secondary)]">
                  New Destination Wallet
                </label>

                {activeStellarWallet && activeStellarWallet !== destinationAddress ? (
                  <button
                    type="button"
                    onClick={() => onDestinationAddressChange(activeStellarWallet)}
                    className="text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors cursor-pointer font-mono"
                  >
                    Use connected ({truncateHash(activeStellarWallet)})
                  </button>
                ) : isDestinationValid && destTrustlineStatus === 'has_usdc_trustline' ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" />
                    USDC Trustline Active
                  </span>
                ) : isDestinationValid && destTrustlineStatus === 'checking' ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-blue-400">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Checking trustline...
                  </span>
                ) : null}
              </div>

              <input
                type="text"
                value={destinationAddress}
                onChange={e => onDestinationAddressChange(e.target.value.trim())}
                placeholder="Enter new 56-character Stellar address (G...)"
                className={`w-full h-11 px-3.5 rounded-xl border font-mono text-xs sm:text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none transition-colors ${
                  isDestinationDirty && !isDestinationValid
                    ? 'border-rose-500/80 bg-rose-500/5 focus:border-rose-500'
                    : 'border-[var(--color-border)] bg-[var(--color-bg-primary)] focus:border-blue-500'
                }`}
              />

              {isDestinationDirty && !isDestinationValid && (
                <p className="text-xs text-rose-400">
                  Enter a valid 56-character Stellar public key starting with G.
                </p>
              )}

              {isDestinationValid && destTrustlineStatus === 'missing_usdc_trustline' && (
                <p className="text-[11px] text-amber-400 leading-relaxed">
                  Note: This wallet has no USDC trustline ({truncateHash(TESTNET_USDC_ISSUER)}). Add
                  a trustline before sweeping if USDC was protected.
                </p>
              )}

              {isDestinationValid && destTrustlineStatus === 'unfunded' && (
                <p className="text-[11px] text-amber-400 leading-relaxed">
                  Note: This destination wallet is not funded on Testnet yet. Fund it via Friendbot
                  before recovering assets.
                </p>
              )}
            </div>
          </div>

          {submitError && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-400 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{submitError}</span>
            </div>
          )}

          {submitSuccess && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-400 flex items-start gap-2">
              <Loader2 className="h-4 w-4 animate-spin shrink-0 mt-0.5" />
              <span className="leading-relaxed">{submitSuccess}</span>
            </div>
          )}

          <div className="pt-2 border-t border-[var(--color-border)]/60">
            {!isOwnerWalletValid ? (
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-5 text-center space-y-2">
                <div className="mx-auto h-9 w-9 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
                  <Lock className="h-4 w-4" />
                </div>
                <div className="space-y-0.5">
                  <h4 className="text-xs sm:text-sm font-semibold text-[var(--color-text-primary)]">
                    Enter Lost Wallet Address First
                  </h4>
                  <p className="text-xs text-[var(--color-text-muted)] max-w-sm mx-auto">
                    Provide the Stellar address you want to recover above to view email verification
                    details.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
                      Send Verification Email
                    </h4>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      Send from your registered recovery email inbox.
                    </p>
                  </div>

                  <span
                    className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full shrink-0 ${
                      isUsingDefaultRelayer
                        ? 'bg-blue-500/10 text-blue-400'
                        : 'bg-amber-500/10 text-amber-400'
                    }`}
                  >
                    {isUsingDefaultRelayer ? 'Auto-Relayer' : 'Custom Recipient'}
                  </span>
                </div>

                <div className="divide-y divide-[var(--color-border)]/50 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3.5 text-xs">
                  <div className="py-2.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[var(--color-text-muted)]">To</span>
                      <div className="flex items-center gap-2">
                        {!isEditingRecipient ? (
                          <>
                            <span className="font-mono font-medium text-[var(--color-text-primary)]">
                              {activeRecipientEmail}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopy(activeRecipientEmail, 'to')}
                              className="text-[var(--color-text-muted)] hover:text-blue-400 transition-colors cursor-pointer"
                              title="Copy recipient"
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
                              className="text-[11px] text-blue-400 hover:text-blue-300 font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <Edit2 className="h-3 w-3" />
                              <span>Edit</span>
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setCustomRecipientEmail('');
                              setIsEditingRecipient(false);
                            }}
                            className="text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] inline-flex items-center gap-1 cursor-pointer"
                          >
                            <RotateCcw className="h-3 w-3" />
                            <span>Reset</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {isEditingRecipient && (
                      <div className="space-y-1.5 pt-1">
                        <div className="flex items-center gap-2">
                          <input
                            type="email"
                            value={customRecipientEmail}
                            onChange={e => {
                              setCustomRecipientEmail(e.target.value.trim());
                              if (!showManualUpload) setShowManualUpload(true);
                            }}
                            placeholder={`Default: ${defaultRelayerEmail}`}
                            className="flex-1 h-8 px-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] font-mono text-xs text-[var(--color-text-primary)] outline-none focus:border-blue-500"
                          />
                          <button
                            type="button"
                            onClick={() => setIsEditingRecipient(false)}
                            className="h-8 px-3 rounded-lg bg-blue-600 text-xs font-semibold text-white hover:bg-blue-500 cursor-pointer"
                          >
                            Save
                          </button>
                        </div>
                        <p className="text-[11px] text-amber-400">
                          Custom recipients require downloading and uploading the .eml file below.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-3 py-2.5">
                    <span className="text-[var(--color-text-muted)] shrink-0">Subject</span>
                    <div className="flex items-center gap-2 font-mono min-w-0">
                      {isDestinationValid ? (
                        <>
                          <span className="truncate text-[var(--color-text-primary)] font-medium">
                            {truncateHash(destinationAddress, 10, 8)}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopy(destinationAddress, 'subject')}
                            className="text-[var(--color-text-muted)] hover:text-blue-400 transition-colors shrink-0 cursor-pointer"
                            title="Copy subject"
                          >
                            {copiedSubject ? (
                              <Check className="h-3.5 w-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </>
                      ) : (
                        <span className="text-[var(--color-text-muted)] font-sans text-xs">
                          {isDestinationDirty
                            ? 'Invalid destination address'
                            : 'Enter destination wallet above'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
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
                    className={`flex h-10 items-center justify-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-4 text-xs font-medium transition-colors ${
                      hasAuthToken && isDestinationValid
                        ? 'text-[var(--color-text-primary)] hover:border-blue-500/40 cursor-pointer'
                        : 'text-[var(--color-text-muted)] opacity-60 cursor-pointer'
                    }`}
                  >
                    <Mail className="h-3.5 w-3.5 text-blue-400" />
                    <span>Open in Gmail</span>
                    <ExternalLink className="h-3 w-3 text-[var(--color-text-muted)]" />
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
                    className={`flex h-10 items-center justify-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-4 text-xs font-medium transition-colors ${
                      hasAuthToken && isDestinationValid
                        ? 'text-[var(--color-text-primary)] hover:border-blue-500/40 cursor-pointer'
                        : 'text-[var(--color-text-muted)] opacity-60 cursor-pointer'
                    }`}
                  >
                    <Mail className="h-3.5 w-3.5 text-blue-400" />
                    <span>Default Mail App</span>
                  </a>
                </div>

                {!hasAuthToken ? (
                  <button
                    type="button"
                    onClick={onConnectWallet}
                    className="w-full h-11 flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-xs sm:text-sm font-semibold text-white hover:bg-blue-500 transition-colors cursor-pointer"
                  >
                    Connect Wallet to Proceed
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onTrackStatus}
                    disabled={!canTrackRelayerStatus}
                    className="w-full h-11 flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-xs sm:text-sm font-semibold text-white hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isCheckingStatus ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Checking Status...</span>
                      </>
                    ) : (
                      <span>I've Sent the Email — Track Status</span>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-[var(--color-border)]/60">
            <button
              type="button"
              onClick={() => setShowManualUpload(!showManualUpload)}
              className="flex items-center justify-between w-full py-1.5 text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
            >
              <span>
                {!isUsingDefaultRelayer
                  ? 'Upload .eml file (Required for custom recipient)'
                  : 'Or upload raw .eml file manually'}
              </span>
              {showManualUpload ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>

            {showManualUpload &&
              (!isOwnerWalletValid ? (
                <p className="mt-2 text-xs text-amber-400">
                  Enter your Lost Wallet Address above before uploading an .eml file.
                </p>
              ) : (
                <form onSubmit={handleManualEmlSubmit} className="mt-3 space-y-3">
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`flex flex-col items-center justify-center rounded-xl border border-dashed p-5 text-center transition-colors cursor-pointer ${
                      isDragging
                        ? 'border-blue-500 bg-blue-500/10'
                        : emlFileName
                          ? 'border-emerald-500/40 bg-emerald-500/5'
                          : 'border-[var(--color-border)] bg-[var(--color-bg-primary)] hover:border-blue-500/40'
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

                    <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400 mb-2">
                      {emlFileName ? (
                        <FileText className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                    </div>

                    <p className="text-xs font-medium text-[var(--color-text-primary)]">
                      {emlFileName || 'Drop your .eml file here or click to browse'}
                    </p>
                  </div>

                  {parsedEml && (
                    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3.5 py-2.5 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[var(--color-text-muted)]">DKIM Signature</span>
                        <span
                          className={`font-medium ${parsedEml.hasDkim ? 'text-emerald-400' : 'text-amber-400'}`}
                        >
                          {parsedEml.hasDkim ? 'Verified' : 'Not detected'}
                        </span>
                      </div>
                      {parsedEml.extractedDestination && (
                        <div className="flex items-center justify-between">
                          <span className="text-[var(--color-text-muted)]">Destination</span>
                          <span className="font-mono text-[var(--color-text-primary)]">
                            {truncateHash(parsedEml.extractedDestination, 8, 8)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting || !emlFileName || !isOwnerWalletValid}
                    className="w-full h-10 flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Verifying .EML...</span>
                      </>
                    ) : (
                      <span>Verify & Submit .EML</span>
                    )}
                  </button>
                </form>
              ))}
          </div>
        </div>

        <div className="lg:col-span-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-6 sm:p-7 shadow-lg space-y-5">
          <div>
            <h3 className="text-base font-bold text-[var(--color-text-primary)] font-['Space_Grotesk']">
              How Recovery Works
            </h3>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              Automated via email relayer or manual .eml proof.
            </p>
          </div>

          <div className="space-y-4">
            {recoverySteps.map((step, idx) => (
              <div key={step.title} className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-xs font-semibold text-blue-400">
                  {idx + 1}
                </span>
                <div className="space-y-0.5">
                  <h4 className="text-xs sm:text-sm font-semibold text-[var(--color-text-primary)]">
                    {step.title}
                  </h4>
                  <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                    {step.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
