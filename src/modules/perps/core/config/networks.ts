export type PerpNetwork = 'mainnet' | 'testnet';
export type ExchangeName = 'hyperliquid' | 'aster';

export interface AsterNetworkConfig {
  restUrl: string;
  spotRestUrl: string;
  wsUrl: string;
  bapiFuturesUrl: string;
  bapiCommonUrl: string;
  chainId: number;
  depositBridges: Record<number, string>;
  supportedChains: number[];
}

export interface HyperliquidNetworkConfig {
  restUrl: string;
  wsUrl: string;
  depositBridge: string;
  l1ChainId: number;
  isTestnet: boolean;
}

export const ASTER_CONFIGS: Record<PerpNetwork, AsterNetworkConfig> = {
  mainnet: {
    restUrl: 'https://fapi.asterdex.com',
    spotRestUrl: 'https://sapi.asterdex.com',
    wsUrl: 'wss://fstream.asterdex.com/ws',
    bapiFuturesUrl: 'https://www.asterdex.com/bapi/futures/v1/public/future',
    bapiCommonUrl: 'https://www.asterdex.com/bapi',
    chainId: 1666,
    depositBridges: {
      56: '0x128463A60784c4D3f46c23Af3f65Ed859Ba87974', // BNB Chain
      42161: '0x9E36CB86a159d479cEd94Fa05036f235Ac40E1d5', // Arbitrum
      1: '0x604DD02d620633Ae427888d41bfd15e38483736E', // Ethereum
    },
    supportedChains: [56, 42161, 1],
  },
  testnet: {
    restUrl: 'https://fapi.asterdex-testnet.com',
    spotRestUrl: 'https://sapi.asterdex-testnet.com',
    wsUrl: 'wss://fstream.asterdex-testnet.com/ws',
    bapiFuturesUrl: 'https://www.asterdex-testnet.com/bapi/futures/v1/public/future',
    bapiCommonUrl: 'https://www.asterdex-testnet.com/bapi',
    chainId: 714,
    depositBridges: {
      97: '0x128463A60784c4D3f46c23Af3f65Ed859Ba87974', // BSC Testnet
      421614: '0x9E36CB86a159d479cEd94Fa05036f235Ac40E1d5', // Arbitrum Sepolia
      11155111: '0x604DD02d620633Ae427888d41bfd15e38483736E', // Sepolia
      56: '0x128463A60784c4D3f46c23Af3f65Ed859Ba87974',
      42161: '0x9E36CB86a159d479cEd94Fa05036f235Ac40E1d5',
      1: '0x604DD02d620633Ae427888d41bfd15e38483736E',
    },
    supportedChains: [97, 421614, 11155111, 56, 42161, 1],
  },
};

export const HYPERLIQUID_CONFIGS: Record<PerpNetwork, HyperliquidNetworkConfig> = {
  mainnet: {
    restUrl: 'https://api.hyperliquid.xyz',
    wsUrl: 'wss://api.hyperliquid.xyz/ws',
    depositBridge: '0x2df1c51e09aecf9cacb7bc98cb1742757f163df7',
    l1ChainId: 42161, // Arbitrum One
    isTestnet: false,
  },
  testnet: {
    restUrl: 'https://api.hyperliquid-testnet.xyz',
    wsUrl: 'wss://api.hyperliquid-testnet.xyz/ws',
    depositBridge: '0x0000000000000000000000000000000000000000',
    l1ChainId: 421614, // Arbitrum Sepolia
    isTestnet: true,
  },
};

export function getAsterConfig(network: PerpNetwork = 'mainnet'): AsterNetworkConfig {
  return ASTER_CONFIGS[network] || ASTER_CONFIGS.mainnet;
}

export function getHyperliquidConfig(network: PerpNetwork = 'mainnet'): HyperliquidNetworkConfig {
  return HYPERLIQUID_CONFIGS[network] || HYPERLIQUID_CONFIGS.mainnet;
}
