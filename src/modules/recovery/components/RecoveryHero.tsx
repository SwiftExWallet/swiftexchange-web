import { ArrowRight, Mail } from 'lucide-react';
import type { FC } from 'react';

import { useRecoveryStore } from '../store/recoveryStore';

interface RecoveryHeroProps {
  onStartRecovery: () => void;
  onGoToSetup: () => void;
  onLearnMore?: () => void;
}

export const RecoveryHero: FC<RecoveryHeroProps> = ({
  onStartRecovery,
  onGoToSetup,
  onLearnMore,
}) => {
  const isConfigured = useRecoveryStore(state => state.isConfigured);
  const setCurrentStep = useRecoveryStore(state => state.setCurrentStep);

  return (
    <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-14 py-4 sm:py-8">
      <div className="flex flex-col space-y-6 lg:col-span-6 lg:max-w-xl">
        <div className="inline-flex items-center gap-2">
          <span className="font-mono text-xs font-semibold tracking-widest text-[var(--color-text-muted)] uppercase">
            YOUR WALLET. YOUR WAY BACK.
          </span>
        </div>

        <h1 className="font-['Space_Grotesk'] text-4xl sm:text-5xl lg:text-[56px] font-bold tracking-tight text-[var(--color-text-primary)] leading-[1.08]">
          A simpler way to access your wallet.
        </h1>

        <p className="text-base sm:text-lg text-[var(--color-text-secondary)] leading-relaxed">
          Protect your assets or recover a wallet you already own. Your linked email gives you a
          clear path back if you lose access.
        </p>

        <div className="flex flex-col gap-3 pt-2 w-full max-w-sm">
          {isConfigured ? (
            <button
              type="button"
              onClick={() => setCurrentStep('active')}
              className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-7 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 transition-all hover:bg-blue-500 hover:shadow-blue-500/40 active:scale-[0.98] cursor-pointer"
            >
              View recovery status
            </button>
          ) : (
            <button
              type="button"
              onClick={onGoToSetup}
              className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-7 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 transition-all hover:bg-blue-500 hover:shadow-blue-500/40 active:scale-[0.98] cursor-pointer"
            >
              Register email recovery
            </button>
          )}

          <button
            type="button"
            onClick={onStartRecovery}
            className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/90 px-7 text-sm font-semibold text-[var(--color-text-primary)] transition-all hover:bg-[var(--color-bg-tertiary)] hover:border-[var(--color-border-dark)] active:scale-[0.98] cursor-pointer"
          >
            Recover my funds
          </button>
        </div>

        <div className="space-y-3 pt-1 max-w-md">
          <p className="text-xs sm:text-sm text-[var(--color-text-muted)] leading-relaxed">
            Email recovery must be set up beforehand. Have a 12 or 24-word recovery phrase? You can
            use that instead.
          </p>

          <button
            type="button"
            onClick={onLearnMore || (() => setCurrentStep('how-it-works'))}
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors cursor-pointer group"
          >
            <span className="group-hover:underline">How email recovery works</span>
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
          </button>
        </div>
      </div>

      <div className="lg:col-span-6 flex items-center justify-center">
        <div className="relative w-full max-w-[490px] rounded-3xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-6 sm:p-8 shadow-2xl overflow-hidden">
          <div className="relative flex items-center justify-center min-h-[300px] py-6">
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="h-64 w-64 rounded-full border border-blue-500/10" />
              <div className="absolute h-80 w-80 rounded-full border border-blue-500/5" />
              <div className="absolute h-48 w-48 rounded-full bg-blue-600/10 blur-3xl" />
            </div>

            <img
              src="/fundwaalet-Photoroom.png"
              alt="SwiftEx Secure Wallet"
              className="relative z-10 w-full max-w-[270px] sm:max-w-[300px] h-auto object-contain drop-shadow-[0_20px_35px_rgba(0,0,0,0.5)] select-none pointer-events-none transition-transform duration-500 hover:scale-105"
            />
          </div>

          <div className="mt-2 rounded-2xl border border-[var(--color-border)]/70 bg-[var(--color-bg-primary)]/80 p-4 sm:p-5 backdrop-blur-md">
            <div className="flex items-start gap-3.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-400">
                <Mail className="h-4 w-4" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  An email. A safety wait. A way back.
                </h3>
                <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                  Confirm your linked email, wait seven days, then restore access. Cancel any time
                  before recovery completes.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
