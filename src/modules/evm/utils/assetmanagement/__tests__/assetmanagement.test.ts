import { describe, expect, it } from 'vitest';

import {
  findChain,
  getAssetByAddress,
  getAssetBySymbol,
  getAssetsForChain,
  getChainById,
  getChainLogoUrl,
  getChainName,
  getChainNativeSymbol,
  getChainRangoSymbol,
  getEvmChainsForNetwork,
  getExplorerUrl,
  getTokenAddressesForChain,
  isEvmChain,
  normalizeTokenForDisplay,
} from '../../Chainregistry';
import { ARB, AVAX, BASE, BSC, CHAINS, ETH, OPT, POL, STR, STR_TESTNET } from '../chains';
import {
  AGGREGATOR_NATIVE_ADDRESS,
  ASSET_CDN_BASE,
  EXPLORER_URLS,
  GET_LOGO_URL,
  GET_RESOURCES_LIST_URL,
  GET_STELLAR_TOKEN_LIST_URL,
  GET_TOKEN_LOGO_URL,
  NATIVE_ADDRESS,
  RESOURCE_BASE_URL,
  RPC,
  RPC_URLS,
} from '../constants';
import { mapIChainToChainConfig } from '../mapper';
import type { IChain } from '../types';

describe('EVM Asset Management - Constants', () => {
  it('defines standard zero and aggregator native addresses', () => {
    expect(NATIVE_ADDRESS).toBe('0X0000000000000000000000000000000000000000');
    expect(AGGREGATOR_NATIVE_ADDRESS).toBe('0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE');
  });

  it('defines valid RPC URLs for all supported networks', () => {
    expect(RPC_URLS.ETH.length).toBeGreaterThan(0);
    expect(RPC_URLS.ARB.length).toBeGreaterThan(0);
    expect(RPC_URLS.POL.length).toBeGreaterThan(0);
    expect(RPC_URLS.OPT.length).toBeGreaterThan(0);
    expect(RPC_URLS.AVAX.length).toBeGreaterThan(0);
    expect(RPC_URLS.BASE.length).toBeGreaterThan(0);
    expect(RPC_URLS.BNB.length).toBeGreaterThan(0);
    expect(RPC_URLS.SEPOLIA.length).toBeGreaterThan(0);
    expect(RPC_URLS.BSC_TESTNET.length).toBeGreaterThan(0);
    expect(RPC_URLS.AMOY.length).toBeGreaterThan(0);
    expect(RPC_URLS.STR.length).toBeGreaterThan(0);
    expect(RPC_URLS.STR_TESTNET.length).toBeGreaterThan(0);
  });

  it('maps primary RPC URLs matching RPC_URLS first entries', () => {
    expect(RPC.ETHRPC).toBe(RPC_URLS.ETH[0]);
    expect(RPC.ARBRPC).toBe(RPC_URLS.ARB[0]);
    expect(RPC.POLRPC).toBe(RPC_URLS.POL[0]);
    expect(RPC.OPRPC).toBe(RPC_URLS.OPT[0]);
    expect(RPC.AVAXRPC).toBe(RPC_URLS.AVAX[0]);
    expect(RPC.BASERPC).toBe(RPC_URLS.BASE[0]);
    expect(RPC.BSCRPC).toBe(RPC_URLS.BNB[0]);
    expect(RPC.STRRPC).toBe(RPC_URLS.STR[0]);
    expect(RPC.STRRPC_TESTNET).toBe(RPC_URLS.STR_TESTNET[0]);
  });

  it('provides block explorer base URLs for all chains', () => {
    expect(EXPLORER_URLS.ETH).toContain('etherscan.io');
    expect(EXPLORER_URLS.ARB).toContain('arbiscan.io');
    expect(EXPLORER_URLS.POL).toContain('polygonscan.com');
    expect(EXPLORER_URLS.OPT).toContain('optimistic.etherscan.io');
    expect(EXPLORER_URLS.AVAX).toContain('snowscan.xyz');
    expect(EXPLORER_URLS.BASE).toContain('basescan.org');
    expect(EXPLORER_URLS.BNB).toContain('bscscan.com');
    expect(EXPLORER_URLS.STR).toContain('stellar.expert');
  });

  it('correctly constructs asset and token logo URLs', () => {
    const slug = 'eth';
    const address = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
    expect(GET_LOGO_URL(slug)).toBe(`${ASSET_CDN_BASE}/${slug}/${NATIVE_ADDRESS}.png`);
    expect(GET_TOKEN_LOGO_URL(slug, address)).toBe(`${ASSET_CDN_BASE}/${slug}/${address}.png`);
    expect(GET_RESOURCES_LIST_URL('eth_tokens.json')).toBe(`${RESOURCE_BASE_URL}/eth_tokens.json`);
  });
});

describe('EVM Asset Management - Chains Registry Configuration', () => {
  it('contains correctly defined chain parameters for Ethereum L1', () => {
    expect(ETH.chainId).toBe(1);
    expect(ETH.nativeChainKey).toBe('ethereum');
    expect(ETH.symbol).toBe('ETH');
    expect(ETH.minGasGwei).toBe(10);
    expect(ETH.bridgeSupportTokens.length).toBeGreaterThan(0);
  });

  it('contains correctly defined chain parameters for Arbitrum One (L2)', () => {
    expect(ARB.chainId).toBe(42161);
    expect(ARB.nativeChainKey).toBe('arbitrum-one');
    expect(ARB.symbol).toBe('ARB');
    expect(ARB.nativeGasToken.symbol).toBe('ETH');
    expect(ARB.nativeGasToken.decimals).toBe(18);
  });

  it('contains correctly defined chain parameters for Optimism (L2)', () => {
    expect(OPT.chainId).toBe(10);
    expect(OPT.nativeChainKey).toBe('optimistic-ethereum');
    expect(OPT.symbol).toBe('OPT');
    expect(OPT.nativeGasToken.symbol).toBe('ETH');
  });

  it('contains correctly defined chain parameters for Base (L2)', () => {
    expect(BASE.chainId).toBe(8453);
    expect(BASE.nativeChainKey).toBe('base');
    expect(BASE.symbol).toBe('BASE');
    expect(BASE.nativeGasToken.symbol).toBe('ETH');
  });

  it('contains correctly defined chain parameters for Polygon POS', () => {
    expect(POL.chainId).toBe(137);
    expect(POL.nativeChainKey).toBe('polygon-pos');
    expect(POL.symbol).toBe('POL');
    expect(POL.minGasGwei).toBe(30);
  });

  it('contains correctly defined chain parameters for Avalanche C-Chain', () => {
    expect(AVAX.chainId).toBe(43114);
    expect(AVAX.nativeChainKey).toBe('avalanche');
    expect(AVAX.symbol).toBe('AVAX');
  });

  it('contains correctly defined chain parameters for BNB Smart Chain', () => {
    expect(BSC.chainId).toBe(56);
    expect(BSC.nativeChainKey).toBe('bnbMainnet');
    expect(BSC.symbol).toBe('BNB');
  });

  it('contains Stellar non-EVM chain configuration for Mainnet and Testnet', () => {
    expect(STR.chainId).toBe('pubnet');
    expect(STR.nativeChainKey).toBe('stellar');
    expect(STR.bridgeSupportTokens.length).toBeGreaterThan(0);

    expect(STR_TESTNET.chainId).toBe('testnet');
    expect(STR_TESTNET.nativeChainKey).toBe('stellar');
    expect(STR_TESTNET.bridgeSupportTokens.length).toBeGreaterThan(0);
  });

  it('verifies all CHAINS entries conform to IChain interface', () => {
    const chainKeys = ['ETH', 'ARB', 'POL', 'OPT', 'AVAX', 'BASE', 'BNB', 'STR', 'STR_TESTNET'];
    for (const key of chainKeys) {
      const chain = CHAINS[key];
      expect(chain).toBeDefined();
      expect(chain.chainId).toBeDefined();
      expect(chain.chainName).toBeDefined();
      expect(chain.blockExplorerUrl).toBeDefined();
      expect(chain.rpcUrl).toBeDefined();
      expect(chain.nativeToken).toBeDefined();
    }
  });
});

describe('EVM Asset Management - Mapper (mapIChainToChainConfig)', () => {
  it('correctly maps an EVM IChain object to a ChainConfig with fallback RPCs and assets', () => {
    const mapped = mapIChainToChainConfig(CHAINS.ETH);
    expect(mapped.chainId).toBe(1);
    expect(mapped.name).toBe('Ethereum');
    expect(mapped.available).toBe(true);
    expect(mapped.swapEnabled).toBe(true);
    expect(mapped.rpcUrl).toBe(CHAINS.ETH.rpcUrl);
    expect(mapped.fallbackRpcUrls).toEqual(CHAINS.ETH.rpcUrls.slice(1));
    expect(mapped.nativeCurrency.symbol).toBe('ETH');
    expect(mapped.nativeCurrency.decimals).toBe(18);

    // Native asset is first
    expect(mapped.assets[0]).toMatchObject({
      asset: 'ETH',
      symbol: 'ETH',
      isNative: true,
      decimals: 18,
      address: NATIVE_ADDRESS,
    });

    // Bridge tokens are mapped
    const usdtAsset = mapped.assets.find(a => a.symbol === 'USDT');
    expect(usdtAsset).toBeDefined();
    expect(usdtAsset?.type).toBe('ERC20');
    expect(usdtAsset?.isNative).toBe(false);
  });

  it('correctly maps Stellar chain with STELLAR asset types and ignores native bridge placeholder', () => {
    const mapped = mapIChainToChainConfig(CHAINS.STR);
    expect(mapped.chainId).toBe('pubnet');
    expect(mapped.nativeCurrency.symbol).toBe('XLM');
    expect(mapped.nativeCurrency.decimals).toBe(7);

    // Bridge token should have type STELLAR
    const usdcAsset = mapped.assets.find(a => a.symbol === 'USDC');
    expect(usdcAsset).toBeDefined();
    expect(usdcAsset?.type).toBe('STELLAR');
    expect(usdcAsset?.isNative).toBe(false);
  });

  it('deduplicates tokens if bridgeSupportTokens and supportedTokenList overlap', () => {
    const mockChain: IChain = {
      ...CHAINS.ETH,
      supportedTokenList: [
        {
          name: 'Tether USD',
          symbol: 'USDT',
          address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
          chainId: 1,
          decimals: 6,
          logoURI: 'https://example.com/usdt.png',
          asset: 'USDT-0xdAC17F958D2ee523a2206206994597C13D831ec7',
          type: 'ERC20',
        },
      ],
    };

    const mapped = mapIChainToChainConfig(mockChain);
    const usdtMatches = mapped.assets.filter(a => a.symbol === 'USDT');
    expect(usdtMatches.length).toBe(1);
  });
});

describe('EVM Chainregistry Integration with Asset Management', () => {
  it('correctly identifies EVM vs non-EVM chains', () => {
    expect(isEvmChain(1)).toBe(true);
    expect(isEvmChain(42161)).toBe(true);
    expect(isEvmChain(137)).toBe(true);
    expect(isEvmChain(10)).toBe(true);
    expect(isEvmChain(8453)).toBe(true);
    expect(isEvmChain(56)).toBe(true);
    expect(isEvmChain('pubnet')).toBe(false);
    expect(isEvmChain('testnet')).toBe(false);
    expect(isEvmChain('dydx-mainnet-1')).toBe(false);
  });

  it('retrieves EVM chains for mainnet', () => {
    const evmChains = getEvmChainsForNetwork('mainnet');
    expect(evmChains.length).toBeGreaterThanOrEqual(7);
    expect(evmChains.every(c => isEvmChain(c.chainId))).toBe(true);
  });

  it('finds chain by numeric or string chainId and slug', () => {
    const ethByNum = getChainById(1);
    const ethByStr = getChainById('1');
    expect(ethByNum).toBeDefined();
    expect(ethByStr).toBeDefined();
    expect(ethByNum?.slug).toBe('eth');

    const polygon = findChain('polygon', 'mainnet');
    expect(polygon?.chainId).toBe(137);

    const arbitrum = findChain('arbitrum', 'mainnet');
    expect(arbitrum?.chainId).toBe(42161);
  });

  it('looks up asset by address (handling native address and aggregator native address)', () => {
    const ethNative = getAssetByAddress(1, NATIVE_ADDRESS);
    expect(ethNative).toBeDefined();
    expect(ethNative?.isNative).toBe(true);
    expect(ethNative?.symbol).toBe('ETH');

    const aggregatorNative = getAssetByAddress(1, AGGREGATOR_NATIVE_ADDRESS);
    expect(aggregatorNative).toBeDefined();
    expect(aggregatorNative?.isNative).toBe(true);
    expect(aggregatorNative?.symbol).toBe('ETH');

    const usdt = getAssetByAddress(1, '0xdAC17F958D2ee523a2206206994597C13D831ec7');
    expect(usdt).toBeDefined();
    expect(usdt?.symbol).toBe('USDT');
  });

  it('normalizes tokens for display and corrects gas token symbols on ETH L2s (ARB, OP, BASE)', () => {
    // Arbitrum L2 gas token correction
    const arbNative = normalizeTokenForDisplay(
      { symbol: 'ARB', address: NATIVE_ADDRESS, isNative: true },
      42161
    );
    expect(arbNative.symbol).toBe('ETH');
    expect(arbNative.name).toBe('Ether');
    expect(arbNative.wasCorrected).toBe(true);

    // Optimism L2 gas token correction
    const opNative = normalizeTokenForDisplay(
      { symbol: 'OP', address: NATIVE_ADDRESS, isNative: true },
      10
    );
    expect(opNative.symbol).toBe('ETH');
    expect(opNative.wasCorrected).toBe(true);

    // Base L2 gas token correction
    const baseNative = normalizeTokenForDisplay(
      { symbol: 'BASE', address: NATIVE_ADDRESS, isNative: true },
      8453
    );
    expect(baseNative.symbol).toBe('ETH');
    expect(baseNative.wasCorrected).toBe(true);

    // Polygon native MATIC/POL is not rewritten to ETH
    const polNative = normalizeTokenForDisplay(
      { symbol: 'POL', address: NATIVE_ADDRESS, isNative: true },
      137
    );
    expect(polNative.symbol).toBe('POL');
    expect(polNative.wasCorrected).toBe(false);
  });

  it('retrieves chain helpers: logo, explorer URL, native symbol, rango symbol', () => {
    expect(getChainName(1)).toBe('Ethereum');
    expect(getChainNativeSymbol(1)).toBe('ETH');
    expect(getChainNativeSymbol(137)).toBe('POL');
    expect(getChainLogoUrl(1)).toBeDefined();
    expect(getChainRangoSymbol(42161)).toBe('ARBITRUM');
    expect(getExplorerUrl(1, 'tx', '0xabc123')).toBe('https://etherscan.io/tx/0xabc123');
    expect(getExplorerUrl(137, 'address', '0xuser')).toBe('https://polygonscan.com/address/0xuser');

    // Test token and asset lookups
    const ethAssets = getAssetsForChain(1);
    expect(ethAssets.length).toBeGreaterThan(0);

    const usdtAsset = getAssetBySymbol(1, 'USDT');
    expect(usdtAsset).toBeDefined();
    expect(usdtAsset?.symbol).toBe('USDT');

    const ethTokenAddresses = getTokenAddressesForChain(1);
    expect(ethTokenAddresses.USDT).toBeDefined();
  });

  it('correctly resolves and isolates Stellar Mainnet (pubnet) and Stellar Testnet (testnet)', () => {
    const pubnetChain = getChainById('pubnet');
    const testnetChain = getChainById('testnet');

    expect(pubnetChain).toBeDefined();
    expect(testnetChain).toBeDefined();

    expect(pubnetChain?.chainId).toBe('pubnet');
    expect(pubnetChain?.networkType).toBe('mainnet');
    expect(testnetChain?.chainId).toBe('testnet');
    expect(testnetChain?.networkType).toBe('testnet');

    // Mainnet USDC uses Circle Mainnet Issuer
    const pubnetUsdc = pubnetChain?.assets.find(a => a.symbol === 'USDC');
    expect(pubnetUsdc).toBeDefined();
    expect(pubnetUsdc?.address).toBe('GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN');

    // Testnet USDC uses Circle Testnet Issuer
    const testnetUsdc = testnetChain?.assets.find(a => a.symbol === 'USDC');
    expect(testnetUsdc).toBeDefined();
    expect(testnetUsdc?.address).toBe('GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5');

    // Token list resolution per network
    expect(GET_STELLAR_TOKEN_LIST_URL('mainnet')).toContain('stellar_tokens.json');
    expect(GET_STELLAR_TOKEN_LIST_URL('testnet')).toContain('stellar_testnet_tokens.json');
  });
});
