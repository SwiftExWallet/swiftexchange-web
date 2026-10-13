import { ChevronDown, ExternalLink } from 'lucide-react';
import type { FC } from 'react';
import { useState } from 'react';

interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

const FAQS: FaqItem[] = [
  {
    id: 'not-received',
    question: "Didn't receive an email?",
    answer:
      'Check spam, junk, and promotions. Use the exact email linked to your wallet. Resend from the confirmation or status card.',
  },
  {
    id: 'cannot-access',
    question: "Can't access your email?",
    answer:
      "Try your email provider's account recovery. If you still have wallet access, change your recovery email here. Otherwise, use your offline recovery phrase if available.",
  },
  {
    id: 'wait-period',
    question: 'Why is there a 7-day wait?',
    answer:
      'It gives you time to stop an unauthorized request. It applies to wallet recovery, not email setup, and cannot be shortened.',
  },
  {
    id: 'how-cancel',
    question: 'How do I cancel?',
    answer:
      'Open your recovery status or an existing wallet session and choose Cancel recovery request. The original wallet and session remain intact.',
  },
];

export const RecoveryFaqAccordion: FC = () => {
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({
    'not-received': true,
    'cannot-access': true,
    'wait-period': true,
    'how-cancel': true,
  });

  const toggle = (id: string) => {
    setOpenIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/90 p-6 sm:p-8 shadow-xl space-y-5">
      <h3 className="text-xl font-bold text-[var(--color-text-primary)] font-['Space_Grotesk']">
        Recovery help
      </h3>

      <div className="space-y-4">
        {FAQS.map(faq => {
          const isOpen = openIds[faq.id];
          return (
            <div
              key={faq.id}
              className="border-b border-[var(--color-border)]/50 pb-3 last:border-b-0"
            >
              <button
                type="button"
                onClick={() => toggle(faq.id)}
                className="flex w-full items-center justify-between py-1 text-left text-sm font-semibold text-[var(--color-text-primary)] hover:text-blue-400 transition-colors cursor-pointer"
              >
                <span>{faq.question}</span>
                <ChevronDown
                  className={`h-4 w-4 text-[var(--color-text-muted)] transition-transform duration-200 ${
                    isOpen ? 'rotate-180 text-blue-400' : ''
                  }`}
                />
              </button>
              {isOpen && (
                <p className="mt-1.5 text-xs text-[var(--color-text-secondary)] leading-relaxed">
                  {faq.answer}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t border-[var(--color-border)]/60 pt-4 space-y-2">
        <button
          type="button"
          onClick={() => window.open('https://discord.gg', '_blank')}
          className="flex items-center gap-1.5 text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
        >
          <span>Chat with Support</span>
          <ExternalLink className="h-3 w-3" />
        </button>
        <p className="text-[11px] text-[var(--color-text-muted)] leading-normal">
          Support never asks for your recovery phrase, password, or private keys. Never send these
          by email or chat.
        </p>
      </div>
    </div>
  );
};
