import { ONDO_PAY_SYMBOLS, PAY_TOKENS, XSTOCKS_MIN_USD } from '../config/rwaConfig';
import type { PayToken, RwaAsset } from '../types/rwa.types';

export const payOptionsFor = (asset: RwaAsset | null | undefined): PayToken[] => {
  if (!asset || (asset.chain !== 'ETH' && asset.chain !== 'BSC')) return [];
  const all = PAY_TOKENS[asset.chain];
  return asset.issuer === 'ondo' ? all.filter(t => ONDO_PAY_SYMBOLS.includes(t.symbol)) : all;
};

export const tradeChecks = ({
  asset,
  side,
  amount,
  unitPriceUsd,
}: {
  asset: RwaAsset | null | undefined;
  side: 'buy' | 'sell';
  amount: string;
  unitPriceUsd?: number | null;
}): { error: string | null } => {
  const n = Number(amount);
  if (!amount || !Number.isFinite(n) || n <= 0) return { error: null };
  if (asset && asset.issuer === 'xstocks') {
    const usd = side === 'buy' ? n * (unitPriceUsd || 1) : unitPriceUsd ? n * unitPriceUsd : null;
    if (usd !== null && usd < XSTOCKS_MIN_USD) {
      return { error: `xStocks orders must be at least $${XSTOCKS_MIN_USD}.` };
    }
  }
  return { error: null };
};
