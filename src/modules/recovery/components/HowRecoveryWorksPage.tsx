import { ShieldCheck, Timer } from 'lucide-react';
import type { FC } from 'react';

interface HowRecoveryWorksPageProps {
  onBack?: () => void;
  onGoToSetup: () => void;
  onStartRecovery: () => void;
}

const steps = [
  {
    num: '01',
    title: 'Register Guardian Email',
    summary:
      'Link your emergency recovery email. The email is hashed and stored on-chain as a recovery guardian. Your private keys never leave your device.',
  },
  {
    num: '02',
    title: 'Initiate Recovery Request',
    summary:
      'If access to your wallet or device is lost, connect any new wallet to designate as the recipient of your recovered funds.',
  },
  {
    num: '03',
    title: 'On-Chain Email Verification',
    summary:
      'Send an email from your linked inbox. The smart contract verifies the cryptographic DKIM header without exposing your password or keys.',
  },
  {
    num: '04',
    title: '7-Day Safety Timelock & Sweep',
    summary:
      'A 7-day challenge window begins. If unauthorized, the owner can cancel immediately. Once expired, all guarded assets sweep to the new address.',
  },
];

export const HowRecoveryWorksPage: FC<HowRecoveryWorksPageProps> = ({
  onGoToSetup,
  onStartRecovery,
}) => {
  return (
    <div className="mx-auto max-w-5xl space-y-6 py-2">
      <div className="space-y-4">
        <h2 className="text-xs font-mono font-semibold tracking-wider text-[var(--color-text-muted)] uppercase">
          Recovery Lifecycle
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {steps.map(step => (
            <div
              key={step.num}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-6 space-y-4 transition-all hover:border-[var(--color-border-dark)]"
            >
              <span className="font-['Space_Grotesk'] text-2xl font-bold text-blue-400">
                {step.num}
              </span>
              <h3 className="font-['Space_Grotesk'] text-base font-bold text-[var(--color-text-primary)] leading-snug">
                {step.title}
              </h3>
              <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] leading-relaxed">
                {step.summary}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-7 space-y-3">
          <div className="flex items-center gap-2.5 text-blue-400">
            <ShieldCheck className="h-5 w-5" />
            <h3 className="text-base font-bold text-[var(--color-text-primary)] font-['Space_Grotesk']">
              Why the original private key cannot be restored
            </h3>
          </div>
          <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] leading-relaxed">
            In self-custodial Web3, private keys are generated locally and never leave your device.
            SwiftEx never knows your seed phrase or password. Recovery works by executing an
            authorized smart contract sweep that transfers guarded balances into a freshly connected
            wallet under your control.
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-7 space-y-3">
          <div className="flex items-center gap-2.5 text-blue-400">
            <Timer className="h-5 w-5" />
            <h3 className="text-base font-bold text-[var(--color-text-primary)] font-['Space_Grotesk']">
              Why the 7-day safety timelock is mandatory
            </h3>
          </div>
          <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] leading-relaxed">
            The mandatory delay protects against phishing or compromised email accounts. If an
            attacker breaches your inbox and attempts an unauthorized recovery, the 7-day window
            gives you ample time to cancel the request and move your funds before the transfer
            executes.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="space-y-1 text-center sm:text-left">
          <h3 className="text-base font-bold text-[var(--color-text-primary)] font-['Space_Grotesk']">
            Protect your wallet today
          </h3>
          <p className="text-xs text-[var(--color-text-secondary)]">
            Set up email protection in under a minute, or start recovery for an existing wallet.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          <button
            type="button"
            onClick={onGoToSetup}
            className="inline-flex h-11 w-full sm:w-auto items-center justify-center rounded-xl bg-blue-600 px-6 text-xs sm:text-sm font-semibold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500 transition-colors cursor-pointer"
          >
            <span>Register</span>
          </button>

          <button
            type="button"
            onClick={onStartRecovery}
            className="inline-flex h-11 w-full sm:w-auto items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-5 text-xs sm:text-sm font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] transition-colors cursor-pointer"
          >
            <span>Recover</span>
          </button>
        </div>
      </div>
    </div>
  );
};
