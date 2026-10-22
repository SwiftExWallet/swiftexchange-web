/**
 * Recovery Module Constants & Network Configuration
 * Centralized industry-standard configuration for SpareKey on Stellar Soroban.
 */

export interface SpareKeyConfig {
  network: string;
  rpcUrl: string;
  networkPassphrase: string;
  contractId?: string;
  zkVerifierId?: string;
  xlmSac: string;
  horizonUrl: string;
  minDelaySeconds: number;
}

export const SPAREKEY_CONFIG: SpareKeyConfig = {
  network: 'testnet',
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
  contractId: import.meta.env.VITE_SPAREKEY_CONTRACT_ID || '',
  zkVerifierId: import.meta.env.VITE_ZK_VERIFIER_CONTRACT_ID || '',
  xlmSac: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  minDelaySeconds: 5,
};

export const MAX_RECOVERY_ASSETS = 2;
export const BASE_RESERVE_FLOOR_STROOPS = 20_000_000n; // 2 XLM in stroops to protect account base reserve
export const MAX_I128_ALLOWANCE = 170141183460469231731687303715884105727n; // 2^127 - 1
export const DEFAULT_ALLOWANCE_LEDGER_OFFSET = 150 * 17_280; // ~150 days

export const TESTNET_USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
export const TESTNET_USDC_CODE = 'USDC';
export const TESTNET_USDC_SAC = 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';
