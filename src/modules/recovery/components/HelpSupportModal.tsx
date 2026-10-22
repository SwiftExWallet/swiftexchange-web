import { ExternalLink, LifeBuoy, MessageSquare, Shield, X } from 'lucide-react';
import type { FC } from 'react';

interface HelpSupportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpSupportModal: FC<HelpSupportModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
      <div className="w-full max-w-lg rounded-3xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-6 sm:p-8 shadow-2xl space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/15 text-blue-400">
              <LifeBuoy className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-['Space_Grotesk'] text-lg font-bold text-[var(--color-text-primary)]">
                Help & Support
              </h3>
              <p className="text-xs text-[var(--color-text-secondary)]">
                SwiftEx Wallet Email Recovery Assistance
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-text-primary)]">
              <Shield className="h-4 w-4 text-emerald-400" />
              <span>How does email recovery work?</span>
            </div>
            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
              When you link your recovery email, SwiftEx registers an encrypted guardian hash for
              your wallet. If you ever lose your device or session, you can authorize recovery using
              this email. A mandatory 7-day safety period prevents malicious takeovers.
            </p>
          </div>

          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-text-primary)]">
              <MessageSquare className="h-4 w-4 text-blue-400" />
              <span>Need agent or community assistance?</span>
            </div>
            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
              Reach out to our verified official discord channel or telegram community. Official
              admins will never ask for your private keys, seed phrase, or OTP codes.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-[var(--color-border)]/60 pt-4">
          <button
            type="button"
            onClick={() =>
              typeof window !== 'undefined' && window?.open?.('https://discord.gg', '_blank')
            }
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-md hover:bg-blue-500 transition-colors cursor-pointer"
          >
            <span>Open Discord Support</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-4 py-2 text-xs font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
