import { ShieldCheck } from 'lucide-react';
import React from 'react';

import { ModalShell } from './RwaPrimitives';

interface AttestationModalProps {
  open: boolean;
  country: string;
  onAccept: () => void;
  onDecline: () => void;
}

export const AttestationModal: React.FC<AttestationModalProps> = ({
  open,
  country,
  onAccept,
  onDecline,
}) => (
  <ModalShell
    open={open}
    title="Tokenized Stocks & RWA"
    subtitle="Eligibility & risk confirmation"
    onClose={onDecline}
  >
    <div className="flex items-center gap-3 p-3 rounded-xl bg-brand/10 border border-brand/25">
      <ShieldCheck className="w-5 h-5 text-brand shrink-0" />
      <span className="text-xs font-medium text-primary">
        Detected region: <span className="font-bold">{country || 'Unknown'}</span>
      </span>
    </div>

    <div className="text-xs text-muted space-y-2 leading-relaxed bg-black/20 rounded-xl p-3.5 border border-divider/30">
      <p>
        Tokenized stocks, ETFs, and commodities are issued by third parties (Ondo, Backed/xStocks,
        Paxos, Tether) and traded on-chain via decentralized liquidity.
      </p>
      <p>
        By continuing, you confirm you are not a resident or citizen of a restricted jurisdiction
        and accept smart-contract, issuer, and market-hours risks.
      </p>
    </div>

    <div className="flex items-center gap-3 pt-1">
      <button
        type="button"
        onClick={onDecline}
        className="flex-1 py-2.5 px-4 rounded-xl border border-divider/60 text-xs font-semibold text-muted hover:text-primary transition-colors"
      >
        Back to Tokens
      </button>
      <button
        type="button"
        onClick={onAccept}
        className="flex-1 py-2.5 px-4 rounded-xl bg-brand text-white text-xs font-bold hover:opacity-90 transition-opacity"
      >
        I Confirm &amp; Continue
      </button>
    </div>
  </ModalShell>
);
