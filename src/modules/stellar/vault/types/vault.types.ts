export type VaultActionMode = 'deposit' | 'withdraw';

export type VaultTxStep =
  | 'idle'
  | 'building'
  | 'simulating'
  | 'awaiting_signature'
  | 'submitting'
  | 'pending'
  | 'success'
  | 'failed';

export interface VaultTxState {
  step: VaultTxStep;
  txHash?: string;
  errorMessage?: string;
}

export interface VaultMetrics {
  vaultId: string;
  totalAssets: bigint;
  totalShares: bigint;
  idleAmount: bigint;
  investedAmount: bigint;
  sharePrice: number;
  realizedApyPercent: number;
  targetApyPercent: number;
  utilizationPercent: number;
  oraclePriceUsd: number;
  feeBps: number;
  lastUpdated: number;
  interestRateModel?: InterestRateModelData;
}

export interface UserVaultPosition {
  vaultId: string;
  userAddress: string;
  shares: bigint;
  underlyingAssets: bigint;
  depositedPrincipal: bigint;
  accruedYield: bigint;
  poolSharePercentage: number;
  formatted: {
    shares: string;
    underlying: string;
    deposited: string;
    yield: string;
  };
}

export interface InterestRateModelData {
  currentApr: number;
  baseApr: number;
  currentUtilization: number;
  targetUtilization: number;
  maxUtilization: number;
  collateralFactor: number;
  liabilityFactor: number;
}

export interface VaultActivityRecord {
  id: string;
  type: 'deposit' | 'withdraw';
  vaultId: string;
  vaultName: string;
  vaultAddress: string;
  amount: string;
  symbol: string;
  shares?: string;
  txHash: string;
  timestamp: number;
  status: 'confirmed' | 'pending' | 'failed';
}
