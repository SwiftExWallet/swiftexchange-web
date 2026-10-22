import { Check, CheckCircle2, Clock, Loader2, Mail, ShieldCheck } from 'lucide-react';
import type { FC } from 'react';

import { recoveryStatusNotice } from '../../services/recoveryApi';

interface RecoveryStatusTrackerProps {
  status: string; // 'STARTED' | 'PENDING' | 'EXECUTING' | 'COMPLETED' | string
  destinationAddress?: string;
  isExecuting?: boolean;
}

export const RecoveryStatusTracker: FC<RecoveryStatusTrackerProps> = ({
  status,
  destinationAddress,
  isExecuting = false,
}) => {
  const currentStatus = (status || '').toUpperCase();
  const noticeText = recoveryStatusNotice(currentStatus);

  // Status mapping
  const isStarted = ['STARTED', 'PENDING', 'EXECUTING', 'COMPLETED'].includes(currentStatus);
  const isPending = ['PENDING', 'EXECUTING', 'COMPLETED'].includes(currentStatus);
  const isExecutingState = isExecuting || currentStatus === 'EXECUTING';
  const isCompleted = currentStatus === 'COMPLETED';

  const steps = [
    {
      id: 1,
      title: 'Recovery Request Received',
      description: 'Zero-Knowledge recovery request submitted to backend relayer.',
      isDone: isStarted,
      isActive: currentStatus === 'STARTED',
      icon: Mail,
    },
    {
      id: 2,
      title: 'DKIM Proof & Email Verification',
      description: 'Cryptographic DKIM signature verified against email headers.',
      isDone: isPending,
      isActive: currentStatus === 'STARTED',
      icon: ShieldCheck,
    },
    {
      id: 3,
      title: 'Execute Fund Sweep',
      description: destinationAddress
        ? `Authorized to sweep protected assets to ${destinationAddress.slice(0, 6)}...${destinationAddress.slice(-6)}`
        : 'Authorized to sweep protected assets to destination wallet.',
      isDone: isCompleted,
      isActive: currentStatus === 'PENDING' || isExecutingState,
      icon: Clock,
    },
    {
      id: 4,
      title: 'Wallet Access Restored',
      description: 'Balances swept successfully on-chain. Recovery complete.',
      isDone: isCompleted,
      isActive: false,
      icon: CheckCircle2,
    },
  ];

  return (
    <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/90 p-6 sm:p-8 shadow-xl backdrop-blur-sm space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            Live Recovery Tracking
          </span>
          <h3 className="text-lg font-bold text-[var(--color-text-primary)] font-['Space_Grotesk']">
            Verification & Execution Pipeline
          </h3>
        </div>

        {currentStatus && (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
              isCompleted
                ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                : isExecutingState
                  ? 'bg-blue-500/15 border border-blue-500/30 text-blue-400 animate-pulse'
                  : currentStatus === 'PENDING'
                    ? 'bg-amber-500/15 border border-amber-500/30 text-amber-400'
                    : 'bg-blue-500/10 border border-blue-500/20 text-blue-400'
            }`}
          >
            {isExecutingState && <Loader2 className="h-3 w-3 animate-spin" />}
            {!isExecutingState && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
            <span>{currentStatus}</span>
          </span>
        )}
      </div>

      {noticeText && (
        <div
          className={`rounded-2xl border p-4 text-xs sm:text-sm flex items-start gap-3 ${
            isCompleted
              ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
              : 'border-blue-500/20 bg-blue-500/5 text-blue-300'
          }`}
        >
          {isCompleted ? (
            <Check className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0 stroke-[3]" />
          ) : (
            <span className="h-2 w-2 rounded-full bg-blue-400 animate-ping mt-1.5 shrink-0" />
          )}
          <p className="leading-relaxed font-medium">{noticeText}</p>
        </div>
      )}
      <div className="space-y-3.5">
        {steps.map(step => {
          const StepIcon = step.icon;
          return (
            <div
              key={step.id}
              className={`relative rounded-2xl border p-4 transition-all duration-200 flex items-start gap-3.5 ${
                step.isDone
                  ? 'border-emerald-500/25 bg-emerald-500/[0.04]'
                  : step.isActive
                    ? 'border-blue-500/40 bg-blue-500/[0.08] shadow-[0_0_20px_rgba(59,130,246,0.12)] ring-1 ring-blue-500/20'
                    : 'border-[var(--color-border)]/60 bg-[var(--color-bg-primary)]/40 opacity-65'
              }`}
            >
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all ${
                  step.isDone
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                    : step.isActive
                      ? 'bg-blue-500/20 border-blue-500/40 text-blue-400 shadow-md shadow-blue-500/20'
                      : 'bg-[var(--color-bg-primary)] border-[var(--color-border)] text-[var(--color-text-muted)]'
                }`}
              >
                {step.isDone ? (
                  <Check className="h-5 w-5 stroke-[2.5]" />
                ) : step.isActive && isExecutingState && step.id === 3 ? (
                  <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
                ) : (
                  <StepIcon className="h-4 w-4" />
                )}
              </div>

              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-[var(--color-text-muted)] font-semibold">
                      0{step.id}
                    </span>
                    <h4
                      className={`text-sm font-semibold tracking-tight ${
                        step.isDone
                          ? 'text-emerald-300'
                          : step.isActive
                            ? 'text-blue-300'
                            : 'text-[var(--color-text-primary)]'
                      }`}
                    >
                      {step.title}
                    </h4>
                  </div>

                  {step.isDone ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20 shrink-0">
                      <Check className="h-3 w-3 stroke-[3]" />
                      <span>Done</span>
                    </span>
                  ) : step.isActive ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/15 px-2.5 py-0.5 text-[10px] font-semibold text-blue-300 border border-blue-500/30 shrink-0 animate-pulse">
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                      <span>Active</span>
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono text-[var(--color-text-muted)]">
                      Pending
                    </span>
                  )}
                </div>

                <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                  {step.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
