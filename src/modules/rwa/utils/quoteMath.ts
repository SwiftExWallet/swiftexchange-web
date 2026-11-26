import type { RwaChain } from '../types/rwa.types';

const num = (x: unknown): number | null =>
  x === null || x === undefined || x === '' ? null : Number(x);

export const quoteFigures = ({
  side,
  amountIn,
  out,
  fee,
  marketPrice,
}: {
  side: 'buy' | 'sell';
  amountIn: string | number | null | undefined;
  out: string | number | null | undefined;
  fee?: string | number | null;
  marketPrice?: number | null;
}) => {
  const a = num(amountIn);
  const o = num(out);
  const f = num(fee) || 0;
  const m = num(marketPrice);
  const feePct = o !== null && o + f > 0 ? (f / (o + f)) * 100 : null;
  let effectivePrice: number | null = null;
  if (a && o) effectivePrice = side === 'buy' ? a / o : o / a;
  let vsMarketPct: number | null = null;
  if (effectivePrice && m) {
    vsMarketPct = side === 'buy' ? (effectivePrice / m - 1) * 100 : (1 - effectivePrice / m) * 100;
  }
  return { feePct, effectivePrice, vsMarketPct };
};

export const ETH_SMALL_ORDER_USD = 500;

export const smallEthOrder = (
  chain: RwaChain | string,
  usdValue: number | null | undefined
): boolean => chain === 'ETH' && Number(usdValue) > 0 && Number(usdValue) < ETH_SMALL_ORDER_USD;

export const defaultChain = (
  chains: RwaChain[],
  balancesByChain: Partial<Record<RwaChain, number>> = {}
): RwaChain | null => {
  let best: RwaChain | null = null;
  let bestBal = 0;
  chains.forEach(c => {
    const b = Number(balancesByChain[c] || 0);
    if (b > bestBal) {
      best = c;
      bestBal = b;
    }
  });
  if (best) return best;
  if (chains.includes('BSC')) return 'BSC';
  return chains[0] || null;
};
