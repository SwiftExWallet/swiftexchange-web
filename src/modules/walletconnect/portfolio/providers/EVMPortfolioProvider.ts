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
  syncStatus?: string;
  stale?: boolean;
  tokens?: BackendToken[];
  data?: {
    tokens?: BackendToken[];
    syncStatus?: string;
    stale?: boolean;
  };
}

const CHAIN_SLUG_TO_ID: Record<string, number> = {
  // Mainnet mappings
  'eth-mainnet': 1,
  'ethereum-mainnet': 1,
  ethereum: 1,
  eth: 1,
  '1': 1,

  'bnb-mainnet': 56,
  'bsc-mainnet': 56,
  'binance-mainnet': 56,
  binance: 56,
  bnb: 56,
  bsc: 56,
  '56': 56,

  'matic-mainnet': 137,
  'polygon-mainnet': 137,
  'pol-mainnet': 137,
  polygon: 137,
  matic: 137,
  pol: 137,
  poly: 137,
  'polygon-pos': 137,
  '137': 137,

  'arb-mainnet': 42161,
  'arbitrum-mainnet': 42161,
  arbitrum: 42161,
  'arbitrum-one': 42161,
  arb: 42161,
  '42161': 42161,

  'opt-mainnet': 10,
  'optimism-mainnet': 10,
  optimism: 10,
  opt: 10,
  op: 10,
  '10': 10,

  'base-mainnet': 8453,
  base: 8453,
  '8453': 8453,

  'avax-mainnet': 43114,
  'avalanche-mainnet': 43114,
  avalanche: 43114,
  avax: 43114,
  '43114': 43114,

  // Testnet mappings
  'eth-sepolia': 11155111,
  'ethereum-sepolia': 11155111,
  sepolia: 11155111,
  '11155111': 11155111,

  'bnb-testnet': 97,
  'bsc-testnet': 97,
  'binance-testnet': 97,
  '97': 97,

  'matic-amoy': 80002,
  'polygon-amoy': 80002,
  amoy: 80002,
  '80002': 80002,

  'arb-sepolia': 421614,
  'arbitrum-sepolia': 421614,
  '421614': 421614,

  'opt-sepolia': 11155420,
  'optimism-sepolia': 11155420,
  '11155420': 11155420,

  'base-sepolia': 84532,
  '84532': 84532,

  'avax-fuji': 43113,
  'avalanche-fuji': 43113,
  fuji: 43113,
  '43113': 43113,
};

// Industry-standard minimum USD value to filter out airdrop dust attacks
const DUST_THRESHOLD_USD = 0.05;

// Stablecoin symbols that are known pegged to $1
const STABLECOIN_SYMBOLS = new Set(['USDC', 'USDCE', 'USDT', 'DAI', 'FDUSD', 'USDE', 'BUSD']);

const SPAM_REGEX = [
  /t\.me\//i,
  /t\.ly\//i,
  /https?:\/\//i,
  /www\./i,
  /\.(top|rest|club|cfd|live|mom|website|xyz|link|site|today|claims?|click|cc|vip)\b/i,
  /\b(claim|airdrop|reward|rewards|unlocked|voucher|gift)\b/i,
  /\bvisit\b/i,
  /(?:🎁|💎|🟢|🟩|🥇|💲|☑|✅|⭐)/u,
  /^[A-Z]\s+[A-Z]\s+[A-Z]/, // e.g. "U S D C"
];

function isSpamToken(symbol?: string | null, name?: string | null): boolean {
  const combined = `${symbol || ''} ${name || ''}`.trim();
  if (!combined) return false;
  return SPAM_REGEX.some(re => re.test(combined));
}

function resolveChain(networkSlug: string | number, requestedNetwork: NetworkType) {
  const strSlug = String(networkSlug).toLowerCase().trim();
  const mappedChainId = CHAIN_SLUG_TO_ID[strSlug];
  if (mappedChainId) {
    const chain = CHAIN_REGISTRY.find(
      c => c.networkType === requestedNetwork && Number(c.chainId) === mappedChainId
    );
    if (chain) return chain;
  }

  // Fallback matching against chainId or canonical identifiers
  return CHAIN_REGISTRY.find(
    c =>
      c.networkType === requestedNetwork &&
      (String(c.chainId) === strSlug ||
        c.nativeChainKey?.toLowerCase() === strSlug ||
        c.slug?.toLowerCase() === strSlug ||
        c.symbol?.toLowerCase() === strSlug ||
        c.name.toLowerCase() === strSlug ||
        strSlug.startsWith(c.name.toLowerCase()))
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

      // If backend is still indexing this address, schedule a background update
      const isSyncing = resData?.syncStatus === 'syncing' || resData?.syncStatus === 'pending';
      if (isSyncing && typeof window !== 'undefined') {
        setTimeout(() => {
          void import('../../store/portfolioStore').then(m => {
            m.usePortfolioStore.getState().fetchAssets(connectedWallets, network, true);
          });
        }, 2500);
      }

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

        const rawSymbol = token.symbol ?? token.tokenMetadata?.symbol ?? registryAsset?.symbol;
        const rawName = token.name ?? token.tokenMetadata?.name ?? registryAsset?.name;

        // 1. Immediately drop if symbol or name matches spam/airdrop phishing patterns
        if (!isNative && isSpamToken(rawSymbol, rawName)) {
          continue;
        }

        // Determine unit price & USD value
        let unitPrice = 0;
        let valueUsd = 0;

        if (token.priceUsd !== null && token.priceUsd !== undefined && token.priceUsd !== '') {
          unitPrice = parseFloat(String(token.priceUsd));
          if (!isNaN(unitPrice) && unitPrice > 0) {
            valueUsd =
              token.valueUsd !== null && token.valueUsd !== undefined && token.valueUsd !== ''
                ? parseFloat(String(token.valueUsd))
                : balance * unitPrice;
          }
        } else if (
          token.valueUsd !== null &&
          token.valueUsd !== undefined &&
          token.valueUsd !== ''
        ) {
          valueUsd = parseFloat(String(token.valueUsd));
          if (!isNaN(valueUsd) && valueUsd > 0 && balance > 0) {
            unitPrice = valueUsd / balance;
          }
        } else if (token.tokenPrices?.[0]?.value) {
          unitPrice = parseFloat(String(token.tokenPrices[0].value));
          if (!isNaN(unitPrice) && unitPrice > 0) {
            valueUsd = balance * unitPrice;
          }
        }

        const isVerifiedRegistryToken = Boolean(registryAsset);
        const upperSymbol = (rawSymbol || registryAsset?.symbol || '').toUpperCase();

        // If it's a known stablecoin (USDC, USDT, etc.) in registry and price is missing, default to $1.0
        if (unitPrice === 0 && isVerifiedRegistryToken && STABLECOIN_SYMBOLS.has(upperSymbol)) {
          unitPrice = 1.0;
          valueUsd = balance * unitPrice;
        }

        // 2. Filter unverified tokens:
        // Native tokens are ALWAYS kept (users need to see gas balance regardless of dollar value).
        // Verified tokens in our registry (e.g. Polygon USDC) are ALWAYS kept.
        // For unverified tokens:
        // - If neither price nor value is available -> drop (dummy/airdrop token).
        // - If total value is below industry dust threshold ($0.05) -> drop (dust airdrop spam).
        if (!isNative && !isVerifiedRegistryToken) {
          const hasPriceOrValue = unitPrice > 0 || valueUsd > 0;
          if (!hasPriceOrValue) {
            continue;
          }
          if (valueUsd < DUST_THRESHOLD_USD) {
            continue;
          }
        }

        const symbol = rawSymbol ?? (isNative ? getChainNativeSymbol(chainId) : 'TOKEN');

        const name = rawName ?? (isNative ? getChainName(chainId) : symbol);

        const logo =
          token.logo ??
          token.tokenMetadata?.logo ??
          registryAsset?.logoURI ??
          getChainLogoUrl(chainId) ??
          '';

        parsedAssets.push({
          id: `evm-${chainId}-${assetAddress}`,
          symbol,
          name,
          image: logo,
          balance,
          current_price: isNaN(unitPrice) ? 0 : unitPrice,
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
