import { formatUnits } from 'ethers';

import { fetchApiResponseFromServer } from '../../../../service/apiService';
import {
  CHAIN_REGISTRY,
  type NetworkType,
  getAssetByAddress,
  getChainLogoUrl,
  getChainName,
  getChainNativeSymbol,
} from '../../../evm/utils/Chainregistry';
import {
  AGGREGATOR_NATIVE_ADDRESS,
  NATIVE_ADDRESS,
} from '../../../evm/utils/assetmanagement/constants';
import { type Asset } from '../../store/portfolioStore';
import { type IPortfolioProvider, type PortfolioFetchParams } from '../types';

interface BackendToken {
  network: string;
  tokenAddress?: string | null;
  symbol?: string | null;
  name?: string | null;
  decimals?: number | null;
  logo?: string | null;
  balance?: string | number | null;
  balanceHex?: string | null;
  priceUsd?: string | number | null;
  valueUsd?: string | number | null;
  // Legacy / alternative backend schema fields
  tokenBalance?: string | null;
  tokenMetadata?: {
    symbol?: string | null;
    decimals?: number | null;
    name?: string | null;
    logo?: string | null;
  };
  tokenPrices?: Array<{
    currency: string;
    value: string;
  }>;
}

interface BackendResponse {
  address?: string;
  totalValueUsd?: string | number;
  tokens?: BackendToken[];
  data?: {
    tokens?: BackendToken[];
  };
}

const CHAIN_LOOKUP: Record<string, string> = {
  // Testnet mappings
  'eth-sepolia': 'ethereum-sepolia',
  sepolia: 'ethereum-sepolia',
  '11155111': 'ethereum-sepolia',
  'bnb-testnet': 'binance-testnet',
  'bsc-testnet': 'binance-testnet',
  '97': 'binance-testnet',
  'matic-amoy': 'polygon-amoy',
  'polygon-amoy': 'polygon-amoy',
  amoy: 'polygon-amoy',
  '80002': 'polygon-amoy',
  'arb-sepolia': 'arbitrum-sepolia',
  'arbitrum-sepolia': 'arbitrum-sepolia',
  '421614': 'arbitrum-sepolia',
  'opt-sepolia': 'optimism-sepolia',
  'optimism-sepolia': 'optimism-sepolia',
  '11155420': 'optimism-sepolia',
  'base-sepolia': 'base-sepolia',
  '84532': 'base-sepolia',
  'avax-fuji': 'avalanche-fuji',
  'avalanche-fuji': 'avalanche-fuji',
  fuji: 'avalanche-fuji',
  '43113': 'avalanche-fuji',
  // Mainnet mappings
  ethereum: 'ethereum',
  eth: 'ethereum',
  '1': 'ethereum',
  arbitrum: 'arbitrum',
  arb: 'arbitrum',
  '42161': 'arbitrum',
  polygon: 'polygon',
  matic: 'polygon',
  pol: 'polygon',
  poly: 'polygon',
  'polygon-pos': 'polygon',
  'polygon-mainnet': 'polygon',
  '137': 'polygon',
  optimism: 'optimism',
  opt: 'optimism',
  '10': 'optimism',
  avalanche: 'avalanche',
  avax: 'avalanche',
  '43114': 'avalanche',
  base: 'base',
  '8453': 'base',
  binance: 'binance',
  bnb: 'binance',
  bsc: 'binance',
  '56': 'binance',
};

function resolveChain(networkSlug: string | number, requestedNetwork: NetworkType) {
  const strSlug = String(networkSlug).toLowerCase().trim();
  const normalizedKey = CHAIN_LOOKUP[strSlug] || strSlug;
  return CHAIN_REGISTRY.find(
    c =>
      c.networkType === requestedNetwork &&
      (String(c.chainId) === strSlug ||
        String(c.chainId) === normalizedKey ||
        c.nativeChainKey?.toLowerCase() === normalizedKey ||
        c.slug?.toLowerCase() === normalizedKey ||
        c.symbol?.toLowerCase() === normalizedKey ||
        c.name.toLowerCase() === normalizedKey ||
        c.name.toLowerCase().includes(normalizedKey) ||
        normalizedKey.includes(c.name.toLowerCase()))
  );
}

export class EVMPortfolioProvider implements IPortfolioProvider {
  public id = 'evm';

  async fetch(params: PortfolioFetchParams): Promise<Asset[]> {
    const { connectedWallets, network } = params;
    const evmAddress = connectedWallets.evm?.address;

    if (!evmAddress) return [];

    try {
      const response = await fetchApiResponseFromServer<BackendResponse>(
        `/portfolio/${evmAddress}`,
        'GET'
      );

      const resData = (response.data as any)?.data || response.data;
      const backendTokens: BackendToken[] = Array.isArray(resData?.tokens) ? resData.tokens : [];

      if (backendTokens.length === 0) {
        return [];
      }

      const parsedAssets: Asset[] = [];

      for (const token of backendTokens) {
        if (!token.network) continue;

        const chain = resolveChain(token.network, network as NetworkType);
        if (!chain) continue;

        const chainId = chain.chainId as number;
        const lowerTokenAddress = (token.tokenAddress || '').toLowerCase();
        const isNative =
          !token.tokenAddress ||
          lowerTokenAddress === NATIVE_ADDRESS.toLowerCase() ||
          lowerTokenAddress === AGGREGATOR_NATIVE_ADDRESS.toLowerCase();
        const assetAddress = isNative ? NATIVE_ADDRESS : token.tokenAddress!;

        const registryAsset = getAssetByAddress(chainId, assetAddress);
        const decimals =
          token.decimals ?? token.tokenMetadata?.decimals ?? registryAsset?.decimals ?? 18;

        let balance = 0;
        if (token.balance !== null && token.balance !== undefined && token.balance !== '') {
          balance = parseFloat(String(token.balance));
        } else if (token.balanceHex && token.balanceHex !== '0x' && token.balanceHex !== '0x0') {
          try {
            balance = parseFloat(formatUnits(BigInt(token.balanceHex), decimals));
          } catch (e) {
            console.error(`[EVMPortfolioProvider] Error parsing balanceHex:`, e);
          }
        } else if (
          token.tokenBalance &&
          token.tokenBalance !== '0x' &&
          token.tokenBalance !== '0x0'
        ) {
          try {
            balance = parseFloat(formatUnits(token.tokenBalance, decimals));
          } catch (e) {
            console.error(`[EVMPortfolioProvider] Error parsing tokenBalance:`, e);
          }
        }

        if (isNaN(balance) || balance <= 0) continue;

        const symbol =
          token.symbol ??
          token.tokenMetadata?.symbol ??
          registryAsset?.symbol ??
          (isNative ? getChainNativeSymbol(chainId) : 'TOKEN');

        const name =
          token.name ??
          token.tokenMetadata?.name ??
          registryAsset?.name ??
          (isNative ? getChainName(chainId) : symbol);

        const logo =
          token.logo ??
          token.tokenMetadata?.logo ??
          registryAsset?.logoURI ??
          getChainLogoUrl(chainId) ??
          '';

        const price = parseFloat(
          String(token.priceUsd ?? token.valueUsd ?? token.tokenPrices?.[0]?.value ?? '0')
        );

        parsedAssets.push({
          id: `evm-${chainId}-${assetAddress}`,
          symbol,
          name,
          image: logo,
          balance,
          current_price: isNaN(price) ? 0 : price,
          price_change_percentage_24h: 0,
          chainId,
          chainName: getChainName(chainId),
          chainType: 'evm',
          address: assetAddress,
          decimals,
          isNative,
        });
      }

      return parsedAssets;
    } catch (error) {
      console.error('[EVMPortfolioProvider] Failed to fetch EVM portfolio from backend:', error);
      return [];
    }
  }
}
