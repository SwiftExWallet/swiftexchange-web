import { Check, Copy, ExternalLink, Mail, ShieldCheck } from 'lucide-react';
import type { ClipboardEvent, DragEvent, FC, FormEvent } from 'react';
import { useState } from 'react';

import { useWalletStore } from '@/modules/walletconnect/store/walletConnectStore';

import { useRecoveryStore } from '../store/recoveryStore';

interface ProtectWalletFormProps {
  onSuccess: () => void;
  onOpenHelp?: () => void;
}

export const ProtectWalletForm: FC<ProtectWalletFormProps> = ({ onSuccess, onOpenHelp }) => {
  const connectedWallets = useWalletStore(state => state.connectedWallets);
  const activeWallet =
    connectedWallets.evm?.address || connectedWallets.stellar?.address || '0x91a...f2c';

  const defaultEmail = useRecoveryStore(state => state.email || state.pendingEmail);
  const startSetup = useRecoveryStore(state => state.startSetup);
  const confirmEmailSetup = useRecoveryStore(state => state.confirmEmailSetup);

  const [email, setEmail] = useState(defaultEmail || '');
  const [confirmEmail, setConfirmEmail] = useState(defaultEmail || '');
  const [copied, setCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSent, setIsSent] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(activeWallet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const validateEmail = (val: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
  };

  const handlePreventPaste = (e: ClipboardEvent | DragEvent) => {
    e.preventDefault();
    setErrorMessage('Copy and paste is disabled for email fields. Please type manually.');
  };

  const handlePreventCopyCut = (e: ClipboardEvent) => {
    e.preventDefault();
    setErrorMessage('Copying and cutting are disabled for email fields.');
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!email.trim()) {
      setErrorMessage('Please enter an emergency recovery email address.');
      return;
    }

    if (!validateEmail(email.trim())) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    if (email.trim().toLowerCase() !== confirmEmail.trim().toLowerCase()) {
      setErrorMessage('Recovery email addresses do not match.');
      return;
    }

    startSetup(email.trim(), activeWallet);
    setIsSent(true);
  };

  const handleConfirmVerification = () => {
    confirmEmailSetup();
    onSuccess();
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <span className="font-mono text-xs font-semibold tracking-wider text-[var(--color-text-muted)] uppercase">
          WALLET SECURITY / RECOVERY GUARDIAN
        </span>
        <h1 className="font-['Space_Grotesk'] text-3xl sm:text-4xl font-bold tracking-tight text-[var(--color-text-primary)]">
          Protect your assets
        </h1>
        <p className="text-sm sm:text-base text-[var(--color-text-secondary)]">
          Add an emergency recovery email now, so you have a way back if you ever lose access.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/90 p-6 sm:p-8 shadow-xl">
            {!isSent ? (
              <>
                <div className="mb-6 space-y-1">
                  <h2 className="text-xl font-bold text-[var(--color-text-primary)] font-['Space_Grotesk']">
                    Add recovery email
                  </h2>
                  <p className="text-xs sm:text-sm text-[var(--color-text-secondary)]">
                    Choose an inbox that only you can access.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                      Current wallet
                    </label>
                    <div className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-4 py-3">
                      <span className="font-mono text-xs sm:text-sm text-[var(--color-text-primary)]">
                        {activeWallet}
                      </span>
                      <button
                        type="button"
                        onClick={handleCopy}
                        className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold text-blue-400 hover:bg-blue-500/10 transition-colors cursor-pointer"
                      >
                        {copied ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                            <span className="text-emerald-400">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                      Recovery email
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={e => {
                        setEmail(e.target.value);
                        if (errorMessage) setErrorMessage('');
                      }}
                      onPaste={handlePreventPaste}
                      onCopy={handlePreventCopyCut}
                      onCut={handlePreventCopyCut}
                      onDrop={handlePreventPaste}
                      autoComplete="off"
                      placeholder="alex.miller@gmail.com"
                      required
                      className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-4 py-3 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                      Confirm recovery email
                    </label>
                    <input
                      type="email"
                      value={confirmEmail}
                      onChange={e => {
                        setConfirmEmail(e.target.value);
                        if (errorMessage) setErrorMessage('');
                      }}
                      onPaste={handlePreventPaste}
                      onCopy={handlePreventCopyCut}
                      onCut={handlePreventCopyCut}
                      onDrop={handlePreventPaste}
                      autoComplete="off"
                      placeholder="alex.miller@gmail.com"
                      required
                      className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-4 py-3 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    />
                    <p className="text-[11px] text-[var(--color-text-muted)]">
                      Copy and paste is disabled. Please type your email to prevent typos.
                    </p>
                  </div>

                  {errorMessage && (
                    <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-400">
                      {errorMessage}
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row sm:items-center gap-4 pt-2">
                    <button
                      type="submit"
                      className="inline-flex h-11 items-center justify-center rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 transition-all hover:bg-blue-500 cursor-pointer"
                    >
                      Send authorization email
                    </button>
                    <span className="text-xs text-[var(--color-text-muted)]">
                      We'll send a cryptographic authorization link to confirm this email.
                    </span>
                  </div>

                  <div className="border-t border-[var(--color-border)]/60 pt-4">
                    <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                      Confirming your email enables guardian protection immediately. It does not
                      initiate a recovery request or a 7-day wait.
                    </p>
                  </div>
                </form>
              </>
            ) : (
              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-400">
                    <Mail className="h-6 w-6" />
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-xl font-bold text-[var(--color-text-primary)] font-['Space_Grotesk']">
                      Check your email
                    </h2>
                    <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] leading-relaxed">
                      We sent a secure authorization link to{' '}
                      <strong className="text-[var(--color-text-primary)]">{email}</strong>. Open
                      the message and confirm registration.
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4 text-xs text-[var(--color-text-secondary)] space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-[var(--color-text-primary)]">
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    <span>Zero-Knowledge Email Proof</span>
                  </div>
                  <p className="leading-relaxed">
                    Once authorized, the smart contract registers your emergency guardian hash via
                    DKIM verification without ever accessing your private keys.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleConfirmVerification}
                    className="inline-flex h-11 w-full sm:w-auto items-center justify-center rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500 transition-colors cursor-pointer"
                  >
                    Confirm authorization
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsSent(false)}
                    className="text-xs font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer"
                  >
                    Use different email
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="flex flex-col justify-between h-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/90 p-6 sm:p-8 shadow-xl space-y-6">
            <div className="space-y-5">
              <h3 className="text-lg font-bold text-[var(--color-text-primary)] font-['Space_Grotesk']">
                How it works
              </h3>

              <div className="space-y-4">
                <div className="flex items-start gap-3.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500/15 border border-blue-500/30 text-xs font-bold text-blue-400">
                    1
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
                      Authorize by email
                    </h4>
                    <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                      Confirm the prepared message in your inbox to register as guardian.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500/15 border border-blue-500/30 text-xs font-bold text-blue-400">
                    2
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
                      If you ever lose access
                    </h4>
                    <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                      Authorize a recovery request from your inbox. A 7-day safety wait begins.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500/15 border border-blue-500/30 text-xs font-bold text-blue-400">
                    3
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
                      Restore your funds
                    </h4>
                    <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                      After the wait, complete recovery to restore full access and balances.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4 pt-2">
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4">
                <div className="flex items-start gap-3">
                  <Mail className="h-4 w-4 text-[var(--color-text-muted)] shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h5 className="text-xs font-semibold text-[var(--color-text-primary)]">
                      Keep your inbox accessible
                    </h5>
                    <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                      Use recovery emails for wallet security, not marketing. Protect your email
                      account too.
                    </p>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={onOpenHelp}
                className="flex items-center gap-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
              >
                <span>Need help? Chat with Support</span>
                <ExternalLink className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
