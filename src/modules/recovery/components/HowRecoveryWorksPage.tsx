import { ArrowLeft, ShieldCheck, Timer } from 'lucide-react';
import type { FC } from 'react';

interface HowRecoveryWorksPageProps {
  onBack: () => void;
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
      'A 7-day challenge window begins. If unauthorized, the owner can cancel immediately. Once expired, 100% of assets sweep to the new address.',
  },
];

export const HowRecoveryWorksPage: FC<HowRecoveryWorksPageProps> = ({
  onBack,
  onGoToSetup,
  onStartRecovery,
}) => {
  return (
    <div className="mx-auto max-w-5xl space-y-12 py-4">
      <div className="space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer group"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          <span>Back to recovery</span>
        </button>

        <div className="space-y-2">
          <span className="font-mono text-xs font-semibold tracking-widest text-blue-400 uppercase">
            PROTOCOL ARCHITECTURE
          </span>
          <h1 className="font-['Space_Grotesk'] text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[var(--color-text-primary)]">
            How smart contract fund recovery works
          </h1>
          <p className="max-w-3xl text-sm sm:text-base text-[var(--color-text-secondary)] leading-relaxed">
            SwiftEx uses a trustless, non-custodial guardian architecture. Rather than relying on
            centralized custody or storing private keys on a server, on-chain smart contracts verify
            your email signature and safely sweep funds to a new address.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-xs font-mono font-semibold tracking-wider text-[var(--color-text-muted)] uppercase">
          Recovery Lifecycle
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {steps.map(step => (
            <div
              key={step.num}
              className="relative rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-6 flex flex-col justify-between transition-all hover:border-[var(--color-border-dark)]"
            >
              <div className="space-y-3">
                <span className="font-mono text-2xl font-bold text-blue-400/80">{step.num}</span>

                <h3 className="text-base font-bold text-[var(--color-text-primary)] font-['Space_Grotesk'] leading-snug">
                  {step.title}
                </h3>

                <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                  {step.summary}
                </p>
              </div>
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
            authorized smart contract sweep that transfers 100% of balances into a freshly connected
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
            Register email recovery
          </button>

          <button
            type="button"
            onClick={onStartRecovery}
            className="inline-flex h-11 w-full sm:w-auto items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-5 text-xs sm:text-sm font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] transition-colors cursor-pointer"
          >
            Recover my funds
          </button>
        </div>
      </div>
    </div>
  );
};
