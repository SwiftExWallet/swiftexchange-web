import { CheckCircle2, ExternalLink, Loader2, XCircle } from 'lucide-react';
import React from 'react';

import { STAGE_TEXT, TIMELINE, explorerTxUrl, isFinal, stageIndex } from '../orders/orderState';
import type { RwaOrderRecord } from '../types/rwa.types';
import { ModalShell } from './RwaPrimitives';

interface OrderProgressModalProps {
  record: RwaOrderRecord | null;
  onClose: () => void;
}

export const OrderProgressModal: React.FC<OrderProgressModalProps> = ({ record, onClose }) => {
  if (!record) return null;

  const final = isFinal(record.stage);
  const success = record.stage === 'filled';
  const failed = final && !success;
  const curIdx = stageIndex(record.stage);
  const steps = TIMELINE.filter(
    t => t.stage !== 'approving' || Boolean(record.approvalTx) || record.stage === 'approving'
  );

  return (
    <ModalShell
      open
      title={`${record.side === 'buy' ? 'Buy' : 'Sell'} ${record.assetSymbol}`}
      subtitle={record.amountText}
      onClose={onClose}
    >
      <div className="flex items-center gap-3 p-3.5 rounded-xl bg-black/20 border border-divider/30">
        {success ? (
          <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
        ) : failed ? (
          <XCircle className="w-6 h-6 text-red-400 shrink-0" />
        ) : (
          <Loader2 className="w-6 h-6 text-brand animate-spin shrink-0" />
        )}
        <p className="text-xs text-primary leading-relaxed">
          {failed && record.reason ? record.reason : STAGE_TEXT[record.stage] || STAGE_TEXT.unknown}
        </p>
      </div>

      <div className="space-y-2.5">
        {steps.map(step => {
          const idx = stageIndex(step.stage);
          const done = success || (curIdx > idx && !failed);
          const active = !final && curIdx === idx;
          const txHash =
            step.stage === 'approving'
              ? record.approvalTx
              : step.stage === 'filled'
                ? record.fillTx
                : undefined;

          return (
            <div key={step.stage} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    done ? 'bg-emerald-400' : active ? 'bg-brand animate-pulse' : 'bg-divider'
                  }`}
                />
                <span className={done || active ? 'text-primary font-semibold' : 'text-muted'}>
                  {step.label}
                </span>
              </div>
              {txHash && (
                <a
                  href={explorerTxUrl(record.chain, txHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand hover:underline inline-flex items-center gap-1"
                >
                  Explorer <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onClose}
        className="w-full py-2.5 rounded-xl bg-brand text-white text-xs font-bold hover:opacity-90 transition-opacity"
      >
        {final ? 'Done' : 'Continue in Background'}
      </button>
    </ModalShell>
  );
};
