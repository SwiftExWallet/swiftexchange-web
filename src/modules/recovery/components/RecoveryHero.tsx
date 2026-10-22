import { AlertCircle, ArrowRight, Lock, RefreshCw, ShieldCheck } from 'lucide-react';
import type { FC } from 'react';

import { WalletType } from '@/modules/walletconnect/constants/Wallet';
import { useWalletConnect } from '@/modules/walletconnect/hooks/useWalletConnect';

import { useRecoveryStore } from '../store/recoveryStore';
import { RecoveryCircuit } from './RecoveryCircuit';

interface RecoveryHeroProps {
  onStartRecovery: () => void;
  onGoToSetup: () => void;
  onLearnMore?: () => void;
  onViewStatus?: () => void;
}

export const RecoveryHero: FC<RecoveryHeroProps> = ({
  onStartRecovery,
  onGoToSetup,
  onLearnMore,
  onViewStatus,
}) => {
  const isConfigured = useRecoveryStore(state => state.isConfigured);
  const storeWallet = useRecoveryStore(state => state.walletAddress);
  const setCurrentStep = useRecoveryStore(state => state.setCurrentStep);

  const { connectedWallets } = useWalletConnect();
  const rawStellar =
    connectedWallets?.[WalletType.STELLAR]?.address || connectedWallets?.stellar?.address;
  const activeStellarWallet =
    typeof rawStellar === 'string' && rawStellar.startsWith('G') && rawStellar.length === 56
      ? rawStellar
      : '';

  const isWalletProtected = Boolean(
    isConfigured &&
    activeStellarWallet &&
    storeWallet &&
    activeStellarWallet.toLowerCase() === storeWallet.toLowerCase()
  );

  return (
    <div className="py-2 sm:py-6">
      <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12 lg:gap-10">
        <div className="flex flex-col space-y-6 lg:col-span-5 lg:max-w-lg">
          <h1 className="font-['Space_Grotesk'] text-3xl sm:text-5xl lg:text-[46px] font-bold tracking-tight text-[var(--color-text-primary)] leading-[1.15]">
            A simpler way to protect & sweep your funds.
          </h1>

          <p className="text-sm sm:text-base text-[var(--color-text-secondary)] leading-relaxed">
            Protect your assets on-chain with zero-knowledge email verification. If you ever lose
            access to your wallet or keys, securely sweep your funds into a fresh address using your
            linked email.
          </p>

          <div className="grid grid-cols-2 gap-2.5 sm:flex sm:flex-row sm:gap-3 pt-2 w-full max-w-md">
            {isWalletProtected ? (
              <button
                id="hero-manage-protection-btn"
                type="button"
                onClick={onViewStatus || (() => setCurrentStep('active'))}
                className="inline-flex h-11 sm:h-12 flex-1 items-center justify-center gap-1.5 sm:gap-2 rounded-xl bg-blue-600 px-3 sm:px-6 text-xs sm:text-sm font-semibold text-white shadow-lg shadow-blue-600/30 transition-all hover:bg-blue-500 hover:shadow-blue-500/40 active:scale-[0.98] cursor-pointer"
              >
                <span>Manage Protection</span>
              </button>
            ) : (
              <button
                id="hero-setup-protection-btn"
                type="button"
                onClick={onGoToSetup}
                className="inline-flex h-11 sm:h-12 flex-1 items-center justify-center gap-1.5 sm:gap-2 rounded-xl bg-blue-600 px-3 sm:px-6 text-xs sm:text-sm font-semibold text-white shadow-lg shadow-blue-600/30 transition-all hover:bg-blue-500 hover:shadow-blue-500/40 active:scale-[0.98] cursor-pointer"
              >
                <span>Protect My Funds</span>
              </button>
            )}

            <button
              id="hero-sweep-funds-btn"
              type="button"
              onClick={onStartRecovery}
              className="inline-flex h-11 sm:h-12 flex-1 items-center justify-center gap-1.5 sm:gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 sm:px-6 text-xs sm:text-sm font-semibold text-[var(--color-text-primary)] transition-all hover:bg-[var(--color-bg-tertiary)] hover:border-[var(--color-border-dark)] active:scale-[0.98] cursor-pointer"
            >
              <span>Sweep & Recover</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-[var(--color-text-secondary)]">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)]/50 bg-[var(--color-bg-secondary)]/40 px-2.5 py-1">
              <ShieldCheck className="h-3.5 w-3.5 text-blue-400" />
              <span>Self-Custodial</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)]/50 bg-[var(--color-bg-secondary)]/40 px-2.5 py-1">
              <Lock className="h-3.5 w-3.5 text-cyan-400" />
              <span>Zero-Knowledge DKIM</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)]/50 bg-[var(--color-bg-secondary)]/40 px-2.5 py-1">
              <RefreshCw className="h-3.5 w-3.5 text-emerald-400" />
              <span>Asset Sweep</span>
            </span>
          </div>

          <div className="space-y-3 pt-1 max-w-md">
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              Fund protection must be set up beforehand while you have wallet access. If emergency
              recovery is triggered, all guarded balances are safely swept into your new address
              after the security delay.
            </p>

            <button
              id="hero-how-it-works-link"
              type="button"
              onClick={onLearnMore || (() => setCurrentStep('how-it-works'))}
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors cursor-pointer group"
            >
              <span className="group-hover:underline">How zero-knowledge fund sweep works</span>
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>

        <div className="hidden lg:flex lg:col-span-7 items-center justify-center w-full">
          <RecoveryCircuit onRegisterClick={onGoToSetup} />
        </div>
      </div>

      <div className="mt-8 sm:mt-12 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/40 p-6 sm:p-8 lg:p-10 relative overflow-hidden backdrop-blur-sm transition-all hover:border-[var(--color-border-dark)]">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 lg:gap-8">
          <div className="flex-1 space-y-4">
            <h2 className="font-['Space_Grotesk'] text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-[var(--color-text-primary)] leading-tight">
              Lost Access? Recover Your Wallet Funds.
            </h2>

            <p className="max-w-2xl text-xs sm:text-sm text-[var(--color-text-secondary)] leading-relaxed">
              If you previously protected your wallet with an emergency email, you don't need your
              lost seed phrase or device. Cryptographically verify ownership using zero-knowledge
              email proof and sweep guarded balances into any new Stellar address.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="rounded-xl border border-[var(--color-border)]/50 bg-[var(--color-bg-primary)]/40 p-3">
                <div className="text-[11px] font-mono font-semibold text-blue-400">
                  01 · RECIPIENT
                </div>
                <div className="mt-1 text-xs font-medium text-[var(--color-text-primary)]">
                  Connect Active Wallet
                </div>
                <div className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">
                  Destination wallet must be activated on Stellar
                </div>
              </div>
              <div className="rounded-xl border border-[var(--color-border)]/50 bg-[var(--color-bg-primary)]/40 p-3">
                <div className="text-[11px] font-mono font-semibold text-cyan-400">02 · VERIFY</div>
                <div className="mt-1 text-xs font-medium text-[var(--color-text-primary)]">
                  ZK Email Proof
                </div>
                <div className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">
                  Authenticate via DKIM without exposed keys
                </div>
              </div>
              <div className="rounded-xl border border-[var(--color-border)]/50 bg-[var(--color-bg-primary)]/40 p-3">
                <div className="text-[11px] font-mono font-semibold text-purple-400">
                  03 · SWEEP
                </div>
                <div className="mt-1 text-xs font-medium text-[var(--color-text-primary)]">
                  Execute Asset Sweep
                </div>
                <div className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">
                  Guarded balances transfer to fresh address
                </div>
              </div>
            </div>

            <div className="flex items-start sm:items-center gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-200">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5 sm:mt-0" />
              <span>
                <strong className="font-semibold text-amber-300">Notice:</strong> Ensure the
                destination wallet receiving recovered funds is already activated on Stellar (holds
                a minimum XLM balance) beforehand.
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-start lg:items-end justify-center gap-2.5 shrink-0 w-full sm:w-auto">
            <button
              id="hero-bottom-start-recovery-btn"
              type="button"
              onClick={onStartRecovery}
              className="inline-flex h-12 sm:h-14 w-full sm:w-auto items-center justify-center gap-2.5 rounded-xl bg-blue-600 px-6 sm:px-8 text-sm sm:text-base font-semibold text-white shadow-lg shadow-blue-600/30 transition-all hover:bg-blue-500 hover:shadow-blue-500/40 active:scale-[0.98] cursor-pointer"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Recover Wallet Funds</span>
              <ArrowRight className="h-4 w-4" />
            </button>
            <span className="text-[11px] text-center sm:text-left lg:text-right text-[var(--color-text-muted)]">
              No seed phrase required · Zero keys exposed
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
