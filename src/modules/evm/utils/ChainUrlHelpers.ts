import { getGlobalAssetMetadata } from './Chainregistry';
import { RESOURCE_BASE_URL_MAINNET, RESOURCE_BASE_URL_TESTNET } from './assetmanagement/constants';

export function getChainInfoUrl(slug: string, networkType: string = 'mainnet'): string {
  const base = networkType === 'testnet' ? RESOURCE_BASE_URL_TESTNET : RESOURCE_BASE_URL_MAINNET;
  return `${base}/${slug}/info/info.json`;
}

export function getChainLogoUrlBySlug(slug: string, networkType: string = 'mainnet'): string {
  const base = networkType === 'testnet' ? RESOURCE_BASE_URL_TESTNET : RESOURCE_BASE_URL_MAINNET;
  return `${base}/${slug}/info/logo.png`;
}

export function getAssetLogoUrl(
  slug: string,
  address: string,
  networkType: string = 'mainnet'
): string {
  const base = networkType === 'testnet' ? RESOURCE_BASE_URL_TESTNET : RESOURCE_BASE_URL_MAINNET;
  return `${base}/${slug}/${address}.png`;
}

export function getTokenIcon(symbol: string, chainConfig?: any, address?: string): string {
  if (!chainConfig) return '';
  const tokenAddress = address || chainConfig.tokens?.[symbol];
  if (tokenAddress) {
    const registryAsset = chainConfig.assets?.find(
      (a: any) =>
        a.address?.toLowerCase() === tokenAddress?.toLowerCase() ||
        a.symbol?.toUpperCase() === symbol?.toUpperCase()
    );
    if (registryAsset?.logoURI) return registryAsset.logoURI;
  }

  if (symbol && symbol === chainConfig.nativeCurrency?.symbol) {
    return (
      chainConfig.nativeCurrency?.logoURI ||
      getChainLogoUrlBySlug(chainConfig.slug, chainConfig.networkType)
    );
  }

  if (chainConfig.chainId === 'pubnet' || chainConfig.chainId === 'testnet') {
    const base =
      chainConfig.chainId === 'testnet' ? RESOURCE_BASE_URL_TESTNET : RESOURCE_BASE_URL_MAINNET;
    if (symbol) {
      return `${base}/stellar/${symbol}.png`;
    }
  }

  const globalMeta = getGlobalAssetMetadata(symbol);
  if (globalMeta?.logoURI) return globalMeta.logoURI;

  return '';
}
