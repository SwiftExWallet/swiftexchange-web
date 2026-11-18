export function normalizeSymbol(raw: string): string {
  if (!raw) return '';
  const upper = raw.trim().toUpperCase();
  if (upper.includes('-')) return upper;
  if (upper.endsWith('USDT')) {
    return `${upper.slice(0, -4)}-USDT`;
  }
  if (upper.endsWith('USDC')) {
    return `${upper.slice(0, -4)}-USDC`;
  }
  if (upper.endsWith('USD')) {
    return `${upper.slice(0, -3)}-USD`;
  }
  return `${upper}-USDC`;
}

export function toAsterSymbol(raw: string): string {
  if (!raw) return '';
  const clean = raw.replace(/[-_/]/g, '').toUpperCase();
  if (clean.endsWith('USDT')) return clean;
  if (clean.endsWith('USDC')) {
    return `${clean.slice(0, -4)}USDT`;
  }
  return `${clean}USDT`;
}

export function toHyperliquidCoin(raw: string): string {
  if (!raw) return '';
  const upper = raw.trim().toUpperCase();
  if (upper.includes('-')) {
    return upper.split('-')[0];
  }
  if (upper.endsWith('USDT')) {
    return upper.slice(0, -4);
  }
  if (upper.endsWith('USDC')) {
    return upper.slice(0, -4);
  }
  if (upper.endsWith('USD')) {
    return upper.slice(0, -3);
  }
  return upper;
}

export function toExchangeSymbol(raw: string, exchange: 'hyperliquid' | 'aster'): string {
  return exchange === 'hyperliquid' ? toHyperliquidCoin(raw) : toAsterSymbol(raw);
}

export function areSymbolsEqual(symA: string, symB: string): boolean {
  if (!symA || !symB) return false;
  if (symA === symB) return true;
  return toHyperliquidCoin(symA) === toHyperliquidCoin(symB);
}
