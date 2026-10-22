export type RecoveryStep =
  | 'welcome'
  | 'setup'
  | 'setup-verifying'
  | 'active'
  | 'recover-get-started'
  | 'recover-awaiting-email'
  | 'recover-timelock'
  | 'recover-ready'
  | 'recover-completed'
  | 'how-it-works';

export interface RecoveryConfig {
  isConfigured: boolean;
  email: string;
  confirmedAt: number | null;
  walletAddress: string;
  targetWallet: string;
  newKey: string;
  requestId: string;
  initiatedAt: string;
  recoveryInProgress: boolean;
  recoveryStartedAt: number | null;
  unlockAt: number | null;
  recoveryDurationMs: number;
  lastTxHash?: string;
}
