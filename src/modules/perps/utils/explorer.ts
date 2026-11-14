export function getPerpExplorerBase(
  exchange: 'aster' | 'hyperliquid',
  network: 'mainnet' | 'testnet'
): string {
  if (exchange === 'hyperliquid') {
    return network === 'mainnet' ? 'https://hypurrscan.io' : 'https://testnet.purrsec.com';
  }
  return network === 'mainnet'
    ? 'https://www.asterdex.com/en/explorer'
    : 'https://www.asterdex-testnet.com/en/explorer';
}

export function getPerpExplorerAddressUrl(
  exchange: 'aster' | 'hyperliquid',
  network: 'mainnet' | 'testnet',
  address?: string | null
): string {
  const base = getPerpExplorerBase(exchange, network);
  if (!address) return base;
  return `${base}/address/${address}`;
}

export function getPerpExplorerTxUrl(
  exchange: 'aster' | 'hyperliquid',
  network: 'mainnet' | 'testnet',
  hash?: string | null,
  fallbackAddress?: string | null
): string {
  const base = getPerpExplorerBase(exchange, network);
  if (hash) {
    return `${base}/tx/${hash}`;
  }
  if (fallbackAddress) {
    return `${base}/address/${fallbackAddress}`;
  }
  return base;
}

export function getPerpExplorerName(exchange: 'aster' | 'hyperliquid'): string {
  return exchange === 'hyperliquid' ? 'Hyperliquid' : 'Aster';
}
