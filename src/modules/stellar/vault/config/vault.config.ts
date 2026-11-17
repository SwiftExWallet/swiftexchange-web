import type { NetworkType } from '@/modules/walletconnect/config/chains';
import { Networks } from '@stellar/stellar-sdk';

export interface VaultAssetConfig {
  code: string;
  symbol: string;
  name: string;
  decimals: number;
  contractId: string;
  issuer?: string;
  iconUrl?: string;
  oraclePriceUsd: number;
}

export interface SingleVaultConfig {
  id: string;
  name: string;
  symbol: string;
  description: string;
  poolLabel: string;
  vaultAddress: string;
  strategyAddress: string;
  strategyName: string;
  underlyingProtocol: string;
  underlyingAsset: VaultAssetConfig;
  targetApyPercent: number;
  isUpgradable: boolean;
  expectedApyBps: number;
  roles: {
    vaultManager: string;
    rebalanceManager: string;
    emergencyManager: string;
    feeReceiver: string;
  };
}

export interface NetworkVaultEnvironment {
  network: NetworkType;
  networkPassphrase: string;
  rpcUrl: string;
  horizonUrl: string;
  explorerBaseUrl: string;
  factoryAddress: string;
  vaults: SingleVaultConfig[];
}

export const TESTNET_VAULT_CONFIG: NetworkVaultEnvironment = {
  network: 'testnet',
  networkPassphrase: Networks.TESTNET,
  rpcUrl:
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SOROBAN_RPC_URL) ||
    'https://soroban-testnet.stellar.org',
  horizonUrl:
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_HORIZON_URL) ||
    'https://horizon-testnet.stellar.org',
  explorerBaseUrl: 'https://stellar.expert/explorer/testnet',
  factoryAddress: 'CDSCWE4GLNBYYTES2OCYDFQA2LLY4RBIAX6ZI32VSUXD7GO6HRPO4A32',
  vaults: [
    {
      id: 'swiftex-usdc-vault',
      name: 'SwiftEx USDC Vault',
      symbol: 'swUSDC',
      description:
        'Curated single-asset vault deployed via DeFindex factory with fixed strategy allocation into Blend Protocol.',
      poolLabel: 'Fixed Allocation',
      vaultAddress: 'CC2CCCTTCEUSM3S7EHLTSHKREISPVJWJAWXW7KRCSMC3FH23KEP5CHI4',
      strategyAddress: 'CC6HQEGLZAQA6DOPGG2YZECYYYZGAMZJJTG7XBCYI5AXEKINRKAKLEVD',
      strategyName: 'Curated Blend Strategy',
      underlyingProtocol: 'Blend Protocol',
      targetApyPercent: 8.75,
      isUpgradable: false,
      expectedApyBps: 875,
      underlyingAsset: {
        code: 'USDC',
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 7,
        contractId: 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
        issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
        oraclePriceUsd: 1.0,
      },
      roles: {
        vaultManager: 'GBGTSXNXED7NYEDCHVQZ7FF3J2QHPYFI3DA5UOZIFIHBQ444RA6NOTPY',
        rebalanceManager: 'GBGTSXNXED7NYEDCHVQZ7FF3J2QHPYFI3DA5UOZIFIHBQ444RA6NOTPY',
        emergencyManager: 'GBGTSXNXED7NYEDCHVQZ7FF3J2QHPYFI3DA5UOZIFIHBQ444RA6NOTPY',
        feeReceiver: 'GBGTSXNXED7NYEDCHVQZ7FF3J2QHPYFI3DA5UOZIFIHBQ444RA6NOTPY',
      },
    },
  ],
};

export const MAINNET_VAULT_CONFIG: NetworkVaultEnvironment = {
  network: 'mainnet',
  networkPassphrase: Networks.PUBLIC,
  rpcUrl:
    (typeof import.meta !== 'undefined' &&
      (import.meta as any).env?.VITE_SOROBAN_MAINNET_RPC_URL) ||
    'https://soroban-rpc.mainnet.stellar.org',
  horizonUrl:
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_HORIZON_MAINNET_URL) ||
    'https://horizon.stellar.org',
  explorerBaseUrl: 'https://stellar.expert/explorer/public',
  factoryAddress: 'CA2A544F3C46L76U3G4I6636R5775P34Y775O3QG4N5P7A7E4F2T5A55',
  vaults: [
    {
      id: 'swiftex-usdc-mainnet',
      name: 'SwiftEx USDC Prime Vault',
      symbol: 'swUSDC',
      description: 'Production yield-optimized vault deployed into audited Stellar money markets.',
      poolLabel: 'Fixed Allocation',
      vaultAddress: 'CA2A544F3C46L76U3G4I6636R5775P34Y775O3QG4N5P7A7E4F2T5A55',
      strategyAddress: 'CB3B544F3C46L76U3G4I6636R5775P34Y775O3QG4N5P7A7E4F2T5B66',
      strategyName: 'Curated Blend Strategy',
      underlyingProtocol: 'Blend Protocol',
      targetApyPercent: 6.36,
      isUpgradable: false,
      expectedApyBps: 636,
      underlyingAsset: {
        code: 'USDC',
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 7,
        contractId: 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75',
        issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
        oraclePriceUsd: 1.0,
      },
      roles: {
        vaultManager: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
        rebalanceManager: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
        emergencyManager: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
        feeReceiver: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
      },
    },
  ],
};

/**
 * Returns network-matched vault configuration dynamically based on active application network state
 */
export const getVaultEnvironment = (network: NetworkType = 'testnet'): NetworkVaultEnvironment => {
  return network === 'mainnet' ? MAINNET_VAULT_CONFIG : TESTNET_VAULT_CONFIG;
};

export const getExplorerContractUrl = (
  address: string,
  network: NetworkType = 'testnet'
): string => {
  const env = getVaultEnvironment(network);
  return `${env.explorerBaseUrl}/contract/${address}`;
};

export const getExplorerTxUrl = (txHash: string, network: NetworkType = 'testnet'): string => {
  const env = getVaultEnvironment(network);
  return `${env.explorerBaseUrl}/tx/${txHash}`;
};

export const getExplorerAccountUrl = (
  address: string,
  network: NetworkType = 'testnet'
): string => {
  const env = getVaultEnvironment(network);
  return `${env.explorerBaseUrl}/account/${address}`;
};
