import {
  Bell,
  Check,
  Copy,
  ExternalLink,
  FastForward,
  Mail,
  Shield,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { ClipboardEvent, DragEvent, FC, FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ROUTES } from '@/constants/routes';

import { SEVEN_DAYS_MS, useRecoveryStore } from '../store/recoveryStore';

interface RecoverWalletFlowProps {
  onBackToWelcome: () => void;
  onOpenHelp?: () => void;
}

export const RecoverWalletFlow: FC<RecoverWalletFlowProps> = ({ onBackToWelcome, onOpenHelp }) => {
  const navigate = useNavigate();

  const currentStep = useRecoveryStore(state => state.currentStep);
  const setCurrentStep = useRecoveryStore(state => state.setCurrentStep);
  const registeredEmail = useRecoveryStore(state => state.email);
  const targetWallet = useRecoveryStore(
    state => state.targetWallet || state.walletAddress || '0x91a...f2c'
  );
  const requestId = useRecoveryStore(state => state.requestId || 'REC-9824-A');
  const initiatedAt = useRecoveryStore(state => state.initiatedAt || 'Today, 14:49 UTC');
  const recoveryStartedAt = useRecoveryStore(state => state.recoveryStartedAt);
  const recoveryDurationMs = useRecoveryStore(state => state.recoveryDurationMs);
  const startRecoveryRequest = useRecoveryStore(state => state.startRecoveryRequest);
  const authorizeRecoveryEmail = useRecoveryStore(state => state.authorizeRecoveryEmail);
  const cancelRecovery = useRecoveryStore(state => state.cancelRecovery);
  const completeRestore = useRecoveryStore(state => state.completeRestore);
  const fastForwardWait = useRecoveryStore(state => state.fastForwardWait);

  const [inputEmail, setInputEmail] = useState(registeredEmail || '');
  const [errorMessage, setErrorMessage] = useState('');
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [copiedEmailDetails, setCopiedEmailDetails] = useState(false);

  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    isElapsed: boolean;
  }>({
    days: 6,
    hours: 23,
    minutes: 59,
    isElapsed: false,
  });

  const maskEmail = (mail: string) => {
    if (!mail) return 'a***@gmail.com';
    const [name, domain] = mail.split('@');
    if (!domain) return mail;
    return `${name.charAt(0)}***@${domain}`;
  };

  useEffect(() => {
    if (currentStep !== 'recover-timelock' || !recoveryStartedAt) return;

    const calculateRemaining = () => {
      const now = Date.now();
      const finishTime = recoveryStartedAt + (recoveryDurationMs || SEVEN_DAYS_MS);
      const diff = finishTime - now;

      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, isElapsed: true });
        setCurrentStep('recover-ready');
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      setTimeLeft({ days, hours, minutes, isElapsed: false });
    };

    calculateRemaining();
    const interval = setInterval(calculateRemaining, 1000);
    return () => clearInterval(interval);
  }, [currentStep, recoveryStartedAt, recoveryDurationMs, setCurrentStep]);

  const handlePreventPaste = (e: ClipboardEvent | DragEvent) => {
    e.preventDefault();
    setErrorMessage('Copy and paste is disabled for email fields. Please type manually.');
  };

  const handlePreventCopyCut = (e: ClipboardEvent) => {
    e.preventDefault();
    setErrorMessage('Copying and cutting are disabled for email fields.');
  };

  const handleSubmitEmail = (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!inputEmail.trim()) {
      setErrorMessage('Please enter your recovery email address.');
      return;
    }

    startRecoveryRequest(inputEmail.trim());
  };

  const handleConfirmCancel = () => {
    cancelRecovery();
    setIsCancelModalOpen(false);
  };

  const emailTo = 'recovery@swiftex.io';
  const emailSubject = `Recover wallet ${targetWallet}`;

  const mailtoUrl = `mailto:${emailTo}?subject=${encodeURIComponent(emailSubject)}`;
  const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(emailTo)}&su=${encodeURIComponent(emailSubject)}`;
  const outlookUrl = `https://outlook.live.com/mail/0/deeplink/compose?to=${encodeURIComponent(emailTo)}&subject=${encodeURIComponent(emailSubject)}`;

  const handleCopyEmailDetails = () => {
    const fullText = `To: ${emailTo}\nSubject: ${emailSubject}`;
    navigator.clipboard.writeText(fullText);
    setCopiedEmailDetails(true);
    setTimeout(() => setCopiedEmailDetails(false), 2000);
  };

  const handleOpenPreparedEmail = () => {
    window.location.href = mailtoUrl;
  };

  if (currentStep === 'recover-completed') {
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <span className="font-mono text-xs font-semibold tracking-wider text-[var(--color-text-muted)] uppercase">
            EMAIL RECOVERY / COMPLETE
          </span>

          <h1 className="font-['Space_Grotesk'] text-3xl sm:text-4xl font-bold tracking-tight text-[var(--color-text-primary)]">
            Your wallet is back
          </h1>

          <p className="text-sm sm:text-base text-[var(--color-text-secondary)]">
            Your wallet access and funds are restored. You're ready to use your wallet again.
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
                    Welcome back to your wallet
                  </h2>
                  <p className="text-xs sm:text-sm text-[var(--color-text-secondary)]">
                    Recovery request {requestId} is complete.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)]/80 divide-y divide-[var(--color-border)]/50 text-xs sm:text-sm">
                <div className="flex items-center justify-between px-4 py-3.5">
                  <span className="text-[var(--color-text-muted)] font-medium">Main account</span>
                  <span className="font-mono font-semibold text-[var(--color-text-primary)]">
                    {targetWallet}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-3.5">
                  <span className="text-[var(--color-text-muted)] font-medium">Wallet access</span>
                  <span className="font-semibold text-emerald-400">Restored</span>
                </div>
                <div className="flex items-center justify-between px-4 py-3.5">
                  <span className="text-[var(--color-text-muted)] font-medium">Funds</span>
                  <span className="font-medium text-[var(--color-text-primary)]">
                    Available in your wallet
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-3.5">
                  <span className="text-[var(--color-text-muted)] font-medium">Recovery email</span>
                  <span className="font-medium text-[var(--color-text-primary)]">
                    {maskEmail(registeredEmail || inputEmail)}
                  </span>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => navigate(ROUTES.DASHBOARD)}
                  className="inline-flex h-12 w-full sm:w-auto items-center justify-center rounded-xl bg-blue-600 px-8 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 transition-all hover:bg-blue-500 cursor-pointer"
                >
                  Go to wallet
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 space-y-6">
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/90 p-6 sm:p-8 shadow-xl space-y-5">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Protection Active
              </div>

              <div className="space-y-1">
                <h3 className="text-xl font-bold text-[var(--color-text-primary)] font-['Space_Grotesk']">
                  Your wallet is secured
                </h3>
                <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] leading-relaxed">
                  Email recovery is actively guarding your wallet. If you ever switch devices or
                  clear browser storage, your linked email provides a secure path back.
                </p>
              </div>

              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--color-text-muted)]">Recovery email</span>
                  <span className="font-semibold text-[var(--color-text-primary)]">
                    {maskEmail(registeredEmail || inputEmail)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--color-text-muted)]">Safety timelock</span>
                  <span className="text-emerald-400 font-medium">7-day delay enabled</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--color-text-muted)]">Custody status</span>
                  <span className="text-[var(--color-text-secondary)] font-medium">
                    Self-custodial
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setCurrentStep('active')}
                className="text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
              >
                View recovery settings →
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (currentStep === 'recover-ready') {
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <span className="font-mono text-xs font-semibold tracking-wider text-[var(--color-text-muted)] uppercase">
            EMAIL RECOVERY / REQUEST {requestId}
          </span>

          <h1 className="font-['Space_Grotesk'] text-3xl sm:text-4xl font-bold tracking-tight text-[var(--color-text-primary)]">
            You're ready to restore
          </h1>

          <p className="text-sm sm:text-base text-[var(--color-text-secondary)]">
            The 7-day safety wait has completed. You can now restore wallet access.
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
                    One last step to get back in
                  </h2>
                  <p className="text-xs sm:text-sm text-[var(--color-text-secondary)]">
                    Review your wallet and verified email, then complete recovery. Access is not
                    restored until you finish this step.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)]/80 divide-y divide-[var(--color-border)]/50 text-xs sm:text-sm">
                <div className="flex items-center justify-between px-4 py-3.5">
                  <span className="text-[var(--color-text-muted)] font-medium">Target wallet</span>
                  <span className="font-mono font-semibold text-[var(--color-text-primary)]">
                    {targetWallet}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-3.5">
                  <span className="text-[var(--color-text-muted)] font-medium">
                    Verified recovery email
                  </span>
                  <span className="font-medium text-[var(--color-text-primary)]">
                    {maskEmail(registeredEmail || inputEmail)}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-3.5">
                  <span className="text-[var(--color-text-muted)] font-medium">Safety wait</span>
                  <span className="font-semibold text-emerald-400">7 days · completed</span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
                <button
                  type="button"
                  onClick={completeRestore}
                  className="inline-flex h-12 items-center justify-center rounded-xl bg-blue-600 px-8 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 transition-all hover:bg-blue-500 cursor-pointer"
                >
                  Complete recovery
                </button>

                <button
                  type="button"
                  onClick={() => setIsCancelModalOpen(true)}
                  className="text-xs font-semibold text-rose-400 hover:text-rose-300 transition-colors cursor-pointer text-left sm:text-right"
                >
                  Cancel recovery request
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 space-y-6">
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/90 p-6 sm:p-8 shadow-xl space-y-5">
              <h3 className="text-lg font-bold text-[var(--color-text-primary)] font-['Space_Grotesk']">
                What happens next
              </h3>

              <div className="space-y-4">
                <div className="flex items-start gap-3.5">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                    <Check className="h-3.5 w-3.5" />
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
                      Email authorization
                    </h4>
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      Your linked inbox has been verified.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                    <Check className="h-3.5 w-3.5" />
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
                      Seven-day safety wait
                    </h4>
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      The security timelock period has ended.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500/15 border border-blue-500/30 text-xs font-bold text-blue-400">
                    3
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
                      Restore wallet access
                    </h4>
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      Click Complete recovery to re-link this device.
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t border-[var(--color-border)]/50 pt-3 flex items-center justify-between text-xs">
                <span className="text-[var(--color-text-muted)] font-medium">Target wallet</span>
                <span className="font-mono font-semibold text-[var(--color-text-primary)]">
                  {targetWallet}
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/70 p-5">
              <div className="flex items-start gap-3">
                <Shield className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs font-semibold text-[var(--color-text-primary)]">
                    Non-custodial restore
                  </h4>
                  <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                    No private keys were ever transmitted or stored on central servers.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {isCancelModalOpen && renderCancelModal()}
      </div>
    );
  }

  if (currentStep === 'recover-awaiting-email') {
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <span className="font-mono text-xs font-semibold tracking-wider text-[var(--color-text-muted)] uppercase">
            EMAIL RECOVERY / AUTHORIZATION
          </span>

          <h1 className="font-['Space_Grotesk'] text-3xl sm:text-4xl font-bold tracking-tight text-[var(--color-text-primary)]">
            Waiting for your recovery email
          </h1>

          <p className="text-sm sm:text-base text-[var(--color-text-secondary)]">
            We've prepared a message to authorize your recovery. Open it and press Send from{' '}
            <strong className="text-[var(--color-text-primary)]">
              {registeredEmail || inputEmail}
            </strong>
            . Keep the subject line exact; the message body should remain empty.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-8 space-y-6">
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/90 p-6 sm:p-8 shadow-xl space-y-6">
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-5 space-y-4 font-mono text-xs">
                <span className="font-mono text-[11px] font-bold tracking-widest text-[var(--color-text-muted)] uppercase block">
                  PREPARED RECOVERY EMAIL
                </span>

                <div className="space-y-2 border-b border-[var(--color-border)]/60 pb-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--color-text-muted)] font-mono">From</span>
                    <span className="text-[var(--color-text-primary)] font-semibold">
                      {maskEmail(registeredEmail || inputEmail)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--color-text-muted)] font-mono">To</span>
                    <span className="text-[var(--color-text-primary)] font-semibold">
                      {emailTo}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--color-text-muted)] font-mono">Subject</span>
                    <span className="text-[var(--color-text-primary)] font-semibold">
                      {emailSubject}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--color-text-muted)] font-mono">Body</span>
                    <span className="text-[var(--color-text-muted)] italic">
                      (Empty — wallet address is in subject)
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleOpenPreparedEmail}
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 transition-all hover:bg-blue-500 cursor-pointer"
                >
                  Open prepared email
                </button>

                <button
                  type="button"
                  onClick={() => window.open(gmailUrl, '_blank')}
                  className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-4 text-xs font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] transition-colors cursor-pointer"
                >
                  <span>Open Gmail</span>
                  <ExternalLink className="h-3 w-3" />
                </button>

                <button
                  type="button"
                  onClick={() => window.open(outlookUrl, '_blank')}
                  className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-4 text-xs font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] transition-colors cursor-pointer"
                >
                  <span>Open Outlook</span>
                  <ExternalLink className="h-3 w-3" />
                </button>

                <button
                  type="button"
                  onClick={handleCopyEmailDetails}
                  className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-4 text-xs font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] transition-colors cursor-pointer"
                >
                  {copiedEmailDetails ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copied details</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copy details</span>
                    </>
                  )}
                </button>
              </div>

              <div className="border-t border-[var(--color-border)]/50 pt-5 space-y-4">
                <h3 className="text-sm font-bold text-[var(--color-text-primary)] font-['Space_Grotesk']">
                  Next steps
                </h3>

                <div className="space-y-3">
                  <div className="flex items-start gap-3.5">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500/15 border border-blue-500/30 text-xs font-bold text-blue-400">
                      1
                    </div>
                    <div className="space-y-0.5">
                      <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
                        Send the prepared email
                      </h4>
                      <p className="text-xs text-[var(--color-text-secondary)]">
                        Open your email client and send the message with the exact subject line.
                        Keep the message body empty.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3.5">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-bg-tertiary)] text-xs font-semibold text-[var(--color-text-muted)]">
                      2
                    </div>
                    <div className="space-y-0.5">
                      <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
                        Wait for email verification
                      </h4>
                      <p className="text-xs text-[var(--color-text-secondary)]">
                        The contract verifies the incoming message DKIM signature automatically.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3.5">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-bg-tertiary)] text-xs font-semibold text-[var(--color-text-muted)]">
                      3
                    </div>
                    <div className="space-y-0.5">
                      <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
                        Start the 7-day safety wait
                      </h4>
                      <p className="text-xs text-[var(--color-text-secondary)]">
                        Once verified, the mandatory safety wait begins automatically.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-[var(--color-border)]/60 pt-4 text-xs">
                <button
                  type="button"
                  onClick={authorizeRecoveryEmail}
                  className="font-semibold text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
                >
                  Simulate email sent & verified →
                </button>

                <button
                  type="button"
                  onClick={onOpenHelp}
                  className="flex items-center gap-1 font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
                >
                  <span>Need help? Chat with Support</span>
                  <ExternalLink className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-4 space-y-6">
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/90 p-6 shadow-xl space-y-4">
              <div className="flex items-start gap-3">
                <Mail className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
                    Send from your linked email
                  </h4>
                  <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                    Make sure to send this message from{' '}
                    <strong className="text-[var(--color-text-primary)]">
                      {maskEmail(registeredEmail || inputEmail)}
                    </strong>
                    . Keep the subject line intact and the body empty for automatic smart contract
                    verification.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/70 p-5">
              <div className="flex items-start gap-3">
                <Shield className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs font-semibold text-[var(--color-text-primary)]">
                    Non-custodial guardian proof
                  </h4>
                  <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                    Your sent email creates a zero-knowledge cryptographic signature proving you own
                    the recovery address.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (currentStep === 'recover-timelock') {
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <span className="font-mono text-xs font-semibold tracking-wider text-[var(--color-text-muted)] uppercase">
            EMAIL RECOVERY / REQUEST {requestId}
          </span>
          <h1 className="font-['Space_Grotesk'] text-3xl sm:text-4xl font-bold tracking-tight text-[var(--color-text-primary)]">
            Your safety wait is underway
          </h1>
          <p className="text-sm sm:text-base text-[var(--color-text-secondary)]">
            Your email is verified. Complete recovery becomes available when the seven-day wait
            ends.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/90 p-6 sm:p-8 shadow-xl space-y-6">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)] font-mono">
                  7-DAY SAFETY WAIT
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-400 border border-blue-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                  In progress
                </span>
              </div>

              <div className="space-y-3 py-1">
                <span className="text-xs text-[var(--color-text-muted)] font-medium">
                  Time remaining
                </span>
                <div className="font-['Space_Grotesk'] text-5xl sm:text-6xl font-bold tracking-tight text-[var(--color-text-primary)]">
                  {timeLeft.days}d {timeLeft.hours}h {timeLeft.minutes}m
                </div>
                <div className="h-1.5 w-full rounded-full bg-[var(--color-bg-tertiary)] overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full w-1/12" />
                </div>
              </div>

              <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] leading-relaxed">
                This mandatory wait gives you time to stop an unauthorized recovery. You can cancel
                any time before it completes.
              </p>

              <div className="rounded-xl border border-[var(--color-border)]/70 bg-[var(--color-bg-primary)]/80 p-4">
                <div className="flex items-start gap-3">
                  <Bell className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <h4 className="text-xs font-semibold text-[var(--color-text-primary)]">
                      You don't need to keep this page open
                    </h4>
                    <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                      The countdown continues securely on-chain. We will notify your recovery email
                      when access is ready to restore.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled
                    className="inline-flex h-11 items-center justify-center rounded-xl bg-[var(--color-bg-tertiary)]/70 px-5 text-xs font-semibold text-[var(--color-text-muted)] opacity-60 cursor-not-allowed"
                  >
                    Available after safety wait
                  </button>

                  <button
                    type="button"
                    onClick={fastForwardWait}
                    title="Simulate wait passed for testing"
                    className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 text-xs font-medium text-blue-400 hover:bg-[var(--color-bg-tertiary)] transition-colors cursor-pointer"
                  >
                    <FastForward className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Simulate wait passed</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setIsCancelModalOpen(true)}
                  className="text-xs font-semibold text-rose-400 hover:text-rose-300 transition-colors cursor-pointer text-left sm:text-right"
                >
                  Cancel recovery request
                </button>
              </div>

              <div className="flex items-center justify-between border-t border-[var(--color-border)]/50 pt-4 text-xs text-[var(--color-text-muted)]">
                <div>
                  <span>Request ID: </span>
                  <span className="font-mono font-semibold text-[var(--color-text-primary)]">
                    {requestId}
                  </span>
                </div>
                <div>
                  <span>Initiated: </span>
                  <span className="text-[var(--color-text-primary)]">{initiatedAt}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 space-y-6">
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/90 p-6 sm:p-8 shadow-xl space-y-5">
              <h3 className="text-lg font-bold text-[var(--color-text-primary)] font-['Space_Grotesk']">
                Recovery progress
              </h3>

              <div className="space-y-4">
                <div className="flex items-start gap-3.5">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                    <Check className="h-3.5 w-3.5" />
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
                      Email prepared & sent
                    </h4>
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      Authorized from {maskEmail(registeredEmail || inputEmail)}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                    <Check className="h-3.5 w-3.5" />
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
                      Email verified
                    </h4>
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      Your recovery request is authorized.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500/15 border border-blue-500/30 text-xs font-bold text-blue-400">
                    3
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
                      7-day safety wait
                    </h4>
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      In progress · cancellation is available
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-bg-tertiary)] text-xs font-semibold text-[var(--color-text-muted)]">
                    4
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
                      Restore wallet access
                    </h4>
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      You'll complete this after the wait.
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t border-[var(--color-border)]/50 pt-3 flex items-center justify-between text-xs">
                <span className="text-[var(--color-text-muted)] font-medium">Target wallet</span>
                <span className="font-mono font-semibold text-[var(--color-text-primary)]">
                  {targetWallet}
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/70 p-5">
              <div className="flex items-start gap-3">
                <Shield className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs font-semibold text-[var(--color-text-primary)]">
                    Didn't request this recovery?
                  </h4>
                  <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                    Cancel this request from here or an existing wallet session. Your original
                    wallet and session remain intact.
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onOpenHelp}
              className="text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
            >
              Why seven days? · View recovery help →
            </button>
          </div>
        </div>

        {isCancelModalOpen && renderCancelModal()}
      </div>
    );
  }

  function renderCancelModal() {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-3xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-400">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <button
              type="button"
              onClick={() => setIsCancelModalOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-2">
            <h3 className="font-['Space_Grotesk'] text-xl font-bold text-[var(--color-text-primary)]">
              Cancel recovery?
            </h3>
            <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] leading-relaxed">
              This stops the recovery request and its safety countdown. To recover later, you'll
              need to start a new request and wait seven days again.
            </p>
          </div>

          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-xs font-semibold text-[var(--color-text-primary)]">
                  Your original wallet stays intact
                </h4>
                <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                  Your current wallet and existing session remain unchanged. Recovery protection
                  stays on.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)] border-t border-[var(--color-border)]/50 pt-3">
            <span>Recovery request</span>
            <div className="font-mono text-right">
              <span className="font-semibold text-[var(--color-text-primary)]">{requestId}</span>
              <span className="mx-1.5">·</span>
              <span>{targetWallet}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsCancelModalOpen(false)}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] px-4 text-xs font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-colors cursor-pointer"
            >
              Keep waiting
            </button>

            <button
              type="button"
              onClick={handleConfirmCancel}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-rose-600 px-4 text-xs font-semibold text-white shadow-lg shadow-rose-600/30 hover:bg-rose-500 transition-colors cursor-pointer"
            >
              Yes, cancel recovery
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <span className="font-mono text-xs font-semibold tracking-wider text-[var(--color-text-muted)] uppercase">
          EMAIL RECOVERY / GET STARTED
        </span>
        <h1 className="font-['Space_Grotesk'] text-3xl sm:text-4xl font-bold tracking-tight text-[var(--color-text-primary)]">
          Recover your wallet
        </h1>
        <p className="text-sm sm:text-base text-[var(--color-text-secondary)]">
          Use the email you linked during setup. We'll guide you through the rest.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/90 p-6 sm:p-8 shadow-xl space-y-6">
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-[var(--color-text-primary)] font-['Space_Grotesk']">
                Enter your recovery email
              </h2>
              <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] leading-relaxed">
                This must be the previously linked email, not a new address. You will need access to
                that inbox.
              </p>
            </div>

            <form onSubmit={handleSubmitEmail} className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                  Recovery email
                </label>
                <input
                  type="email"
                  value={inputEmail}
                  onChange={e => {
                    setInputEmail(e.target.value);
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
                  Copy and paste is disabled to prevent typos. Please enter your email manually.
                </p>
              </div>

              {errorMessage && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-400">
                  {errorMessage}
                </div>
              )}

              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="text-xs font-semibold text-[var(--color-text-primary)]">
                      This starts a recovery, not email setup
                    </h4>
                    <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                      You'll authorize this request from your inbox. The mandatory 7-day safety wait
                      starts only after your email is verified.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 pt-1">
                <button
                  type="submit"
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-blue-600 px-7 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 transition-all hover:bg-blue-500 cursor-pointer"
                >
                  Continue
                </button>

                <button
                  type="button"
                  onClick={onBackToWelcome}
                  className="text-xs font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
                >
                  Back to welcome
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/90 p-6 sm:p-8 shadow-xl space-y-5">
            <h3 className="text-lg font-bold text-[var(--color-text-primary)] font-['Space_Grotesk']">
              Your path back
            </h3>

            <div className="space-y-4">
              <div className="flex items-start gap-3.5">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500/15 border border-blue-500/30 text-xs font-bold text-blue-400">
                  1
                </div>
                <div className="space-y-0.5">
                  <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
                    Authorize by email
                  </h4>
                  <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                    Send the prepared message from your linked inbox. Keep its subject line
                    unchanged and body empty.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3.5">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500/15 border border-blue-500/30 text-xs font-bold text-blue-400">
                  2
                </div>
                <div className="space-y-0.5">
                  <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
                    Wait seven days
                  </h4>
                  <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                    A safety window gives you time to cancel an unwanted request.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3.5">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500/15 border border-blue-500/30 text-xs font-bold text-blue-400">
                  3
                </div>
                <div className="space-y-0.5">
                  <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
                    Complete recovery
                  </h4>
                  <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                    Return here when the wait ends to restore access and funds.
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t border-[var(--color-border)]/50 pt-3 space-y-1">
              <h4 className="text-xs font-semibold text-[var(--color-text-primary)]">
                Lost access to this email?
              </h4>
              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                Try your email provider's account recovery. If you still have an active wallet
                session, update your recovery email there. Otherwise, use your recovery phrase if
                available.
              </p>
            </div>

            <button
              type="button"
              onClick={onOpenHelp}
              className="flex items-center gap-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
            >
              <span>Chat with Support</span>
              <ExternalLink className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
