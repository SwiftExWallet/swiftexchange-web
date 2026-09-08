import { useExchangeManager } from '../../core/ExchangeManager';
import { type PerpNetwork, getAsterConfig } from '../../core/config/networks';

export function getCurrentPerpNetwork(): PerpNetwork {
  return useExchangeManager.getState().currentNetwork;
}

export function getAsterRestUrl(network?: PerpNetwork): string {
  return getAsterConfig(network || getCurrentPerpNetwork()).restUrl;
}

export function getAsterSpotRestUrl(network?: PerpNetwork): string {
  return getAsterConfig(network || getCurrentPerpNetwork()).spotRestUrl;
}

export function getAsterWsUrl(network?: PerpNetwork): string {
  return getAsterConfig(network || getCurrentPerpNetwork()).wsUrl;
}

export function getAsterBapiUrl(network?: PerpNetwork): string {
  return getAsterConfig(network || getCurrentPerpNetwork()).bapiFuturesUrl;
}

export const IS_ASTER_TESTNET = false;

// Dynamic URL getters as property getters or defaults
export const ASTER_REST_URL = 'https://fapi.asterdex.com';
export const ASTER_SPOT_REST_URL = 'https://sapi.asterdex.com';
export const ASTER_WS_URL = 'wss://fstream.asterdex.com/ws';
export const ASTER_BAPI_URL = 'https://www.asterdex.com/bapi/futures/v1/public/future';
export const ASTER_CHAIN_ID = 1666;

export function getAsterChainId(network?: PerpNetwork): number {
  return getAsterConfig(network || getCurrentPerpNetwork()).chainId;
}

export const EVM_CHAINS: Record<
  number,
  {
    id: number;
    name: string;
    symbol: string;
    chainName: string;
    explorer: string;
    isTestnet?: boolean;
  }
> = {
  1: { id: 1, name: 'Ethereum', symbol: 'ETH', chainName: 'ETH', explorer: 'https://etherscan.io' },
  56: {
    id: 56,
    name: 'BNB Smart Chain',
    symbol: 'BNB',
    chainName: 'BSC',
    explorer: 'https://bscscan.com',
  },
  42161: {
    id: 42161,
    name: 'Arbitrum One',
    symbol: 'ARB',
    chainName: 'Arbitrum',
    explorer: 'https://arbiscan.io',
  },
  97: {
    id: 97,
    name: 'BNB Testnet',
    symbol: 'tBNB',
    chainName: 'BSC Testnet',
    explorer: 'https://testnet.bscscan.com',
    isTestnet: true,
  },
  421614: {
    id: 421614,
    name: 'Arbitrum Sepolia',
    symbol: 'ETH',
    chainName: 'Arb Sepolia',
    explorer: 'https://sepolia.arbiscan.io',
    isTestnet: true,
  },
  11155111: {
    id: 11155111,
    name: 'Sepolia',
    symbol: 'ETH',
    chainName: 'Sepolia',
    explorer: 'https://sepolia.etherscan.io',
    isTestnet: true,
  },
};

export const ASTER_DEPOSIT_BRIDGES: Record<number, string> = {
  56: '0x128463A60784c4D3f46c23Af3f65Ed859Ba87974', // BNB Chain
  42161: '0x9E36CB86a159d479cEd94Fa05036f235Ac40E1d5', // Arbitrum
  1: '0x604DD02d620633Ae427888d41bfd15e38483736E', // Ethereum
  97: '0x128463A60784c4D3f46c23Af3f65Ed859Ba87974', // BNB Testnet
  421614: '0x9E36CB86a159d479cEd94Fa05036f235Ac40E1d5', // Arb Sepolia
  11155111: '0x604DD02d620633Ae427888d41bfd15e38483736E', // Sepolia
};

export function getAsterDepositBridge(chainId: number, network?: PerpNetwork): string {
  const config = getAsterConfig(network || getCurrentPerpNetwork());
  const bridge = config.depositBridges[chainId] || ASTER_DEPOSIT_BRIDGES[chainId];
  if (!bridge) {
    throw new Error(`Unsupported EVM chain ${chainId} for Aster deposits.`);
  }
  return bridge;
}

export const BAPI_ENDPOINTS = {
  FUNDING_HISTORY: '/common/get-funding-rate-history',
  SYMBOL_DETAIL: '/../composite/market/symbol/detail',
  SYMBOL_ATHL: '/../composite/market/symbol/crypto/athl',
  BRACKETS: '/../../friendly/future/common/brackets',
  REAL_TIME_FUNDING_RATE: '/common/real-time-funding-rate',
} as const;

export const ASTER_ENDPOINTS = {
  // Public
  TIME: '/fapi/v3/time',
  EXCHANGE_INFO: '/fapi/v3/exchangeInfo',
  TICKER_24HR: '/fapi/v1/ticker/24hr',
  DEPTH: '/fapi/v3/depth',
  KLINES: '/fapi/v3/klines',
  AGG_TRADES: '/fapi/v3/aggTrades',
  FUNDING_RATE: '/fapi/v3/fundingRate',
  FUNDING_INFO: '/fapi/v3/fundingInfo',

  // Account & Auth
  LISTEN_KEY: '/fapi/v3/listenKey',
  ACCOUNT: '/fapi/v3/account',
  BALANCE: '/fapi/v3/balance',
  POSITION_RISK: '/fapi/v3/positionRisk',
  LEVERAGE: '/fapi/v3/leverage',
  LEVERAGE_BRACKET: '/fapi/v3/leverageBracket',
  MARGIN_TYPE: '/fapi/v3/marginType',
  POSITION_MARGIN: '/fapi/v3/positionMargin',
  MULTI_ASSETS_MARGIN: '/fapi/v3/multiAssetsMargin',
  POSITION_SIDE_DUAL: '/fapi/v3/positionSide/dual',
  INCOME: '/fapi/v3/income',

  // Orders & Trades
  ORDER: '/fapi/v3/order',
  CHASE: '/fapi/v3/chase',
  BATCH_ORDERS: '/fapi/v3/batchOrders',
  BATCH_MODIFY_ORDERS: '/fapi/v3/batchModifyOrders',
  ALL_OPEN_ORDERS: '/fapi/v3/allOpenOrders',
  OPEN_ORDERS: '/fapi/v3/openOrders',
  ALL_ORDERS: '/fapi/v3/allOrders',
  USER_TRADES: '/fapi/v3/userTrades',
  COUNTDOWN_CANCEL_ALL: '/fapi/v3/countdownCancelAll',

  // Deposit & Withdraw
  DEPOSIT_ADDRESS: '/fapi/v3/deposit/address',
  DEPOSIT_HISTORY: '/fapi/v3/deposit/history',
  WITHDRAW: '/fapi/v3/withdraw',
  WITHDRAW_HISTORY: '/fapi/v3/withdraw/history',
  ASTER_USER_WITHDRAW_INFO: '/fapi/v3/aster/user-withdraw-info',
  ASTER_USER_WITHDRAW: '/fapi/v3/aster/user-withdraw',
  DEPOSIT_WITHDRAW_HISTORY: '/fapi/v3/aster/deposit-withdraw-history',
} as const;

export const ASTER_WS_STREAMS = {
  TICKER: '!ticker@arr',
  MARK_PRICE: '!markPrice@arr@1s',
} as const;
