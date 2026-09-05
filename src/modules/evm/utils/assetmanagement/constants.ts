export const RPC_URLS = {
  ETH: [
    'https://ethereum-rpc.publicnode.com',
    'https://eth.llamarpc.com',
    'https://rpc.flashbots.net',
    'https://cloudflare-eth.com/v1/mainnet',
    'https://eth.drpc.org',
    'https://1rpc.io/eth',
  ],

  ARB: [
    'https://arbitrum-one-rpc.publicnode.com',
    'https://arb1.arbitrum.io/rpc',
    'https://arbitrum.drpc.org',
    'https://1rpc.io/arb',
    'https://arbitrum-one-mainnet.gateway.tatum.io/',
    'https://arb-pokt.nodies.app',
  ],

  POL: [
    'https://polygon-bor-rpc.publicnode.com',
    'https://polygon.drpc.org',
    'https://1rpc.io/matic',
    '"https://polygon-bor-rpc.publicnode.com',
    'https://1rpc.io/matic',
  ],

  OPT: [
    'https://optimism-rpc.publicnode.com',
    'https://mainnet.optimism.io',
    'https://optimism.drpc.org',
    'https://1rpc.io/op',
    'https://optimism-mainnet.gateway.tatum.io/',
    'https://opt-pokt.nodies.app',
  ],

  AVAX: [
    'https://avalanche-c-chain-rpc.publicnode.com',
    'https://api.avax.network/ext/bc/C/rpc',
    'https://avalanche.drpc.org',
    'https://1rpc.io/avax-c',
    'https://avalanche-mainnet.gateway.tatum.io/',
    'https://avax-pokt.nodies.app',
  ],

  BASE: [
    'https://base-rpc.publicnode.com',
    'https://mainnet.base.org',
    'https://base.drpc.org',
    'https://1rpc.io/base',
    'https://base-mainnet.gateway.tatum.io/',
    'https://base-pokt.nodies.app',
  ],

  BNB: [
    'https://bsc-dataseed.bnbchain.org',
    'https://bsc-rpc.publicnode.com',
    'https://bsc-dataseed.binance.org',
    'https://bsc.drpc.org',
    'https://1rpc.io/bnb',
    'https://bsc-mainnet.gateway.tatum.io/',
    'https://bsc-pokt.nodies.app',
  ],

  SEPOLIA: [
    'https://ethereum-sepolia-rpc.publicnode.com',
    'https://ethereum-sepolia.publicnode.com',
    'https://sepolia.gateway.tenderly.co',
    'https://sepolia.drpc.org',
    'https://1rpc.io/sepolia',
    'https://eth-sepolia.public.blastapi.io',
  ],

  BSC_TESTNET: [
    'https://bsc-testnet-rpc.publicnode.com',
    'https://bsc-testnet.publicnode.com',
    'https://data-seed-prebsc-1-s1.binance.org:8545',
    'https://bsc-testnet.drpc.org',
    'https://bsc-testnet.gateway.tatum.io/',
    'https://bsc-testnet-pokt.nodies.app',
  ],

  AMOY: [
    'https://polygon-amoy-bor-rpc.publicnode.com',
    'https://polygon-amoy.drpc.org',
    'https://amoy.polygon.technology',
  ],

  ARB_SEPOLIA: [
    'https://sepolia-rollup.arbitrum.io/rpc',
    'https://arbitrum-sepolia-rpc.publicnode.com',
    'https://arbitrum-sepolia.drpc.org',
  ],

  OPT_SEPOLIA: [
    'https://sepolia.optimism.io',
    'https://optimism-sepolia-rpc.publicnode.com',
    'https://optimism-sepolia.drpc.org',
  ],

  BASE_SEPOLIA: [
    'https://sepolia.base.org',
    'https://base-sepolia-rpc.publicnode.com',
    'https://base-sepolia.drpc.org',
  ],

  AVAX_FUJI: [
    'https://api.avax-test.network/ext/bc/C/rpc',
    'https://avalanche-fuji-c-chain-rpc.publicnode.com',
    'https://avalanche-fuji.drpc.org',
  ],

  STR: ['https://horizon.stellar.org'],

  STR_TESTNET: ['https://horizon-testnet.stellar.org'],
};
export const EXPLORER_URLS = {
  ETH: 'https://etherscan.io',
  ARB: 'https://arbiscan.io',
  POL: 'https://polygonscan.com',
  OPT: 'https://optimistic.etherscan.io',
  AVAX: 'https://snowscan.xyz',
  BASE: 'https://basescan.org',
  BNB: 'https://bscscan.com',
  SEPOLIA: 'https://sepolia.etherscan.io',
  BSC_TESTNET: 'https://testnet.bscscan.com',
  AMOY: 'https://www.oklink.com/amoy',
  ARB_SEPOLIA: 'https://sepolia.arbiscan.io',
  OPT_SEPOLIA: 'https://sepolia-optimism.etherscan.io',
  BASE_SEPOLIA: 'https://sepolia.basescan.org',
  AVAX_FUJI: 'https://testnet.snowtrace.io',
  STR: 'https://stellar.expert/explorer/public',
  STR_TESTNET: 'https://stellar.expert/explorer/testnet',
  DYDX: 'https://www.mintscan.io/dydx',
};

export const RPC = {
  ETHRPC: RPC_URLS.ETH[0],
  ARBRPC: RPC_URLS.ARB[0],
  POLRPC: RPC_URLS.POL[0],
  OPRPC: RPC_URLS.OPT[0],
  AVAXRPC: RPC_URLS.AVAX[0],
  BASERPC: RPC_URLS.BASE[0],
  BSCRPC: RPC_URLS.BNB[0],
  STRRPC: RPC_URLS.STR[0],
  STRRPC_TESTNET: RPC_URLS.STR_TESTNET[0],
  SEPOLIARPC: RPC_URLS.SEPOLIA[0],
  BSC_TESTNETRPC: RPC_URLS.BSC_TESTNET[0],
  AMOYRPC: RPC_URLS.AMOY[0],
  ARB_SEPOLIARPC: RPC_URLS.ARB_SEPOLIA[0],
  OPT_SEPOLIARPC: RPC_URLS.OPT_SEPOLIA[0],
  BASE_SEPOLIARPC: RPC_URLS.BASE_SEPOLIA[0],
  AVAX_FUJIRPC: RPC_URLS.AVAX_FUJI[0],
};

export const NATIVE_ADDRESS = '0X0000000000000000000000000000000000000000';
export const AGGREGATOR_NATIVE_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

export const RESOURCE_BASE_URL =
  'https://raw.githubusercontent.com/sachin-swiftex/resources/refs/heads/master';
export const ASSET_CDN_BASE = RESOURCE_BASE_URL;

export const GET_LOGO_URL = (slug: string) => GET_TOKEN_LOGO_URL(slug, NATIVE_ADDRESS);
export const GET_TOKEN_LOGO_URL = (slug: string, address: string) =>
  `${ASSET_CDN_BASE}/${slug}/${address}.png`;
export const GET_RESOURCES_LIST_URL = (filename: string) => `${RESOURCE_BASE_URL}/${filename}`;
export const GET_STELLAR_TOKEN_LIST_URL = (network: string) =>
  network === 'testnet'
    ? GET_RESOURCES_LIST_URL('stellar_testnet_tokens.json')
    : GET_RESOURCES_LIST_URL('stellar_tokens.json');
