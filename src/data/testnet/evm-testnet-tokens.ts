const LOGO = {
  ETH: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png',
  BNB: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/binance/info/logo.png',
  POL: 'https://raw.githubusercontent.com/sachin-swiftex/resources/refs/heads/master/poly/0X0000000000000000000000000000000000000000.png',
  AVAX: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/avalanchex/info/logo.png',
  USDC: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png',
  USDT: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png',
  DAI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x6B175474E89094C44Da98b954EedeAC495271d0F/logo.png',
  WBTC: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599/logo.png',
  WETH: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
  LINK: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x514910771AF9Ca656af840dff83E8264EcF986CA/logo.png',
  AAVE: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9/logo.png',
  UNI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984/logo.png',
  CAKE: 'https://assets.coingecko.com/coins/images/12632/large/pancakeswap-cake-logo_animated.png',
  BUSD: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/binance/assets/BUSD-BD1/logo.png',
};

export interface TestnetToken {
  name: string;
  symbol: string;
  address: string;
  chainId: number;
  decimals: number;
  logoURI: string;
  isNative?: boolean;
}

export const TESTNET_CHAIN_IDS = {
  SEPOLIA: 11155111,
  BSC_TESTNET: 97,
  AMOY: 80002,
  ARB_SEPOLIA: 421614,
  OPT_SEPOLIA: 11155420,
  BASE_SEPOLIA: 84532,
  AVAX_FUJI: 43113,
} as const;

export const EVM_TESTNET_TOKENS: Record<number, TestnetToken[]> = {
  // ── Ethereum Sepolia (11155111) ──────────────────────────────────────────
  // Verified real deployed contracts on Sepolia (Circle, Aave V3, Uniswap, Chainlink)
  [11155111]: [
    {
      name: 'Ether',
      symbol: 'ETH',
      address: '0x0000000000000000000000000000000000000000',
      chainId: 11155111,
      decimals: 18,
      logoURI: LOGO.ETH,
      isNative: true,
    },
    {
      name: 'USD Coin',
      symbol: 'USDC',
      address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
      chainId: 11155111,
      decimals: 6,
      logoURI: LOGO.USDC,
    },
    {
      name: 'Tether USD',
      symbol: 'USDT',
      address: '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0',
      chainId: 11155111,
      decimals: 6,
      logoURI: LOGO.USDT,
    },
    {
      name: 'Dai Stablecoin',
      symbol: 'DAI',
      address: '0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357',
      chainId: 11155111,
      decimals: 18,
      logoURI: LOGO.DAI,
    },
    {
      name: 'Wrapped BTC',
      symbol: 'WBTC',
      address: '0x29f2D40B0605204364af54EC677bD022dA425d03',
      chainId: 11155111,
      decimals: 8,
      logoURI: LOGO.WBTC,
    },
    {
      name: 'Wrapped Ether',
      symbol: 'WETH',
      address: '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9',
      chainId: 11155111,
      decimals: 18,
      logoURI: LOGO.WETH,
    },
    {
      name: 'Chainlink',
      symbol: 'LINK',
      address: '0x779877A7B0D9E8603169DdbD7836e478b4624789',
      chainId: 11155111,
      decimals: 18,
      logoURI: LOGO.LINK,
    },
    {
      name: 'Aave',
      symbol: 'AAVE',
      address: '0x88541670E55cC00bEEFD87eB59EDd1b7C511AC9a',
      chainId: 11155111,
      decimals: 18,
      logoURI: LOGO.AAVE,
    },
    {
      name: 'Uniswap',
      symbol: 'UNI',
      address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
      chainId: 11155111,
      decimals: 18,
      logoURI: LOGO.UNI,
    },
  ],

  // ── BNB Smart Chain Testnet (97) ─────────────────────────────────────────
  // Verified real deployed contracts on BSC Testnet (PancakeSwap, Binance, Chainlink)
  [97]: [
    {
      name: 'BNB',
      symbol: 'BNB',
      address: '0x0000000000000000000000000000000000000000',
      chainId: 97,
      decimals: 18,
      logoURI: LOGO.BNB,
      isNative: true,
    },
    {
      name: 'USD Coin',
      symbol: 'USDC',
      address: '0x64544969ed7EBf5f083679233325356EbE738930',
      chainId: 97,
      decimals: 18,
      logoURI: LOGO.USDC,
    },
    {
      name: 'Tether USD',
      symbol: 'USDT',
      address: '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd',
      chainId: 97,
      decimals: 18,
      logoURI: LOGO.USDT,
    },
    {
      name: 'Dai Stablecoin',
      symbol: 'DAI',
      address: '0xEC5dCb5Dbf4B114C9d0F65BcCAb49EC54F6A0867',
      chainId: 97,
      decimals: 18,
      logoURI: LOGO.DAI,
    },
    {
      name: 'Wrapped BNB',
      symbol: 'WBNB',
      address: '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd',
      chainId: 97,
      decimals: 18,
      logoURI: LOGO.BNB,
    },
    {
      name: 'Wrapped Ether',
      symbol: 'WETH',
      address: '0xE68104D83e647b7c1C15a91a8D9a44d7E1F30E21',
      chainId: 97,
      decimals: 18,
      logoURI: LOGO.WETH,
    },
    {
      name: 'Chainlink',
      symbol: 'LINK',
      address: '0x84b9B910527Ad5C03A9Ca831909E21e236EA7b06',
      chainId: 97,
      decimals: 18,
      logoURI: LOGO.LINK,
    },
    {
      name: 'PancakeSwap',
      symbol: 'CAKE',
      address: '0xFa60D973F7642B748046464e165A65B7323b0C03',
      chainId: 97,
      decimals: 18,
      logoURI: LOGO.CAKE,
    },
    {
      name: 'Binance USD',
      symbol: 'BUSD',
      address: '0xeD24FC36d5Ee211Ea25A80239Fb8C4Cfd80f12Ee',
      chainId: 97,
      decimals: 18,
      logoURI: LOGO.BUSD,
    },
  ],

  // ── Polygon Amoy Testnet (80002) ─────────────────────────────────────────
  // Verified real deployed contracts on Amoy (Circle, Aave V3 Amoy, Chainlink)
  [80002]: [
    {
      name: 'Polygon',
      symbol: 'POL',
      address: '0x0000000000000000000000000000000000000000',
      chainId: 80002,
      decimals: 18,
      logoURI: LOGO.POL,
      isNative: true,
    },
    {
      name: 'USD Coin',
      symbol: 'USDC',
      address: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
      chainId: 80002,
      decimals: 6,
      logoURI: LOGO.USDC,
    },
    {
      name: 'Tether USD',
      symbol: 'USDT',
      address: '0x1fdE0eCc619726f4cD597887C9F3b4c8740e19e2',
      chainId: 80002,
      decimals: 6,
      logoURI: LOGO.USDT,
    },
    {
      name: 'Wrapped Ether',
      symbol: 'WETH',
      address: '0x52eF3d68BaB452a294342DC3e5f464d7f610f72E',
      chainId: 80002,
      decimals: 18,
      logoURI: LOGO.WETH,
    },
    {
      name: 'Wrapped BTC',
      symbol: 'WBTC',
      address: '0x2Fa2e7a6dEB7bb51B625336DBe1dA23511914a8A',
      chainId: 80002,
      decimals: 8,
      logoURI: LOGO.WBTC,
    },
    {
      name: 'Chainlink',
      symbol: 'LINK',
      address: '0x0Fd9e8d3aF1aaee056EB9e802c3A762a667b1904',
      chainId: 80002,
      decimals: 18,
      logoURI: LOGO.LINK,
    },
    {
      name: 'Aave',
      symbol: 'AAVE',
      address: '0x1558C8A6ee0E53Acda31Eab56E2dBd0B5e03AD42',
      chainId: 80002,
      decimals: 18,
      logoURI: LOGO.AAVE,
    },
  ],

  // ── Arbitrum Sepolia (421614) ────────────────────────────────────────────
  // Verified real deployed contracts on Arbitrum Sepolia (Circle, Chainlink, Canonical WETH)
  [421614]: [
    {
      name: 'Ether',
      symbol: 'ETH',
      address: '0x0000000000000000000000000000000000000000',
      chainId: 421614,
      decimals: 18,
      logoURI: LOGO.ETH,
      isNative: true,
    },
    {
      name: 'USD Coin',
      symbol: 'USDC',
      address: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
      chainId: 421614,
      decimals: 6,
      logoURI: LOGO.USDC,
    },
    {
      name: 'Wrapped Ether',
      symbol: 'WETH',
      address: '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73',
      chainId: 421614,
      decimals: 18,
      logoURI: LOGO.WETH,
    },
    {
      name: 'Chainlink',
      symbol: 'LINK',
      address: '0xb1D4538B4571d411F07960EF2838Ce337FE1E80E',
      chainId: 421614,
      decimals: 18,
      logoURI: LOGO.LINK,
    },
  ],

  // ── Optimism Sepolia (11155420) ──────────────────────────────────────────
  // Verified real deployed contracts on Optimism Sepolia (Circle, Canonical WETH, Chainlink)
  [11155420]: [
    {
      name: 'Ether',
      symbol: 'ETH',
      address: '0x0000000000000000000000000000000000000000',
      chainId: 11155420,
      decimals: 18,
      logoURI: LOGO.ETH,
      isNative: true,
    },
    {
      name: 'USD Coin',
      symbol: 'USDC',
      address: '0x5fd84259d66Cd46123540766Be93DFE6D43130D7',
      chainId: 11155420,
      decimals: 6,
      logoURI: LOGO.USDC,
    },
    {
      name: 'Wrapped Ether',
      symbol: 'WETH',
      address: '0x4200000000000000000000000000000000000006',
      chainId: 11155420,
      decimals: 18,
      logoURI: LOGO.WETH,
    },
    {
      name: 'Chainlink',
      symbol: 'LINK',
      address: '0xE4aB69C077896252FAFBD49EFD26B5d171A32410',
      chainId: 11155420,
      decimals: 18,
      logoURI: LOGO.LINK,
    },
  ],

  // ── Base Sepolia (84532) ─────────────────────────────────────────────────
  // Verified real deployed contracts on Base Sepolia (Circle, Canonical WETH, Chainlink)
  [84532]: [
    {
      name: 'Ether',
      symbol: 'ETH',
      address: '0x0000000000000000000000000000000000000000',
      chainId: 84532,
      decimals: 18,
      logoURI: LOGO.ETH,
      isNative: true,
    },
    {
      name: 'USD Coin',
      symbol: 'USDC',
      address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      chainId: 84532,
      decimals: 6,
      logoURI: LOGO.USDC,
    },
    {
      name: 'Wrapped Ether',
      symbol: 'WETH',
      address: '0x4200000000000000000000000000000000000006',
      chainId: 84532,
      decimals: 18,
      logoURI: LOGO.WETH,
    },
    {
      name: 'Chainlink',
      symbol: 'LINK',
      address: '0xE4aB69C077896252FAFBD49EFD26B5d171A32410',
      chainId: 84532,
      decimals: 18,
      logoURI: LOGO.LINK,
    },
  ],

  // ── Avalanche Fuji (43113) ───────────────────────────────────────────────
  // Verified real deployed contracts on Avalanche Fuji (Circle, Canonical WAVAX, Chainlink)
  [43113]: [
    {
      name: 'Avalanche',
      symbol: 'AVAX',
      address: '0x0000000000000000000000000000000000000000',
      chainId: 43113,
      decimals: 18,
      logoURI: LOGO.AVAX,
      isNative: true,
    },
    {
      name: 'USD Coin',
      symbol: 'USDC',
      address: '0x5425890298aed601595a70AB815c96711a31Bc65',
      chainId: 43113,
      decimals: 6,
      logoURI: LOGO.USDC,
    },
    {
      name: 'Wrapped AVAX',
      symbol: 'WAVAX',
      address: '0xd00ae08403B9bbb9124bB305C09058E32C39A48c',
      chainId: 43113,
      decimals: 18,
      logoURI: LOGO.AVAX,
    },
    {
      name: 'Chainlink',
      symbol: 'LINK',
      address: '0x0b9d5D9136855f6FEc3c0993feE6E9CE8a297846',
      chainId: 43113,
      decimals: 18,
      logoURI: LOGO.LINK,
    },
  ],
};

export function getTestnetTokensForChain(chainId: number): TestnetToken[] {
  return EVM_TESTNET_TOKENS[chainId] ?? [];
}

export function getAllTestnetTokens(): TestnetToken[] {
  return Object.values(EVM_TESTNET_TOKENS).flat();
}
