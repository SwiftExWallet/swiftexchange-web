import type { MarketStatus, PayToken, RwaChain } from '../types/rwa.types';
import { fmtSig } from './amounts';
import { formatEastern, nextOpen } from './marketHours';

export const QUOTE_DEBOUNCE_MS = 600;
export const QUOTE_REFRESH_MS = 30000;

export const closedText = (
  status: MarketStatus | null | undefined,
  now = new Date(),
  usCalendar = false
): string | null => {
  if (!status || status.open) return null;
  if (status.status === 'halted') return 'Paused';
  const at = status.nextChangeAt
    ? new Date(status.nextChangeAt)
    : usCalendar
      ? nextOpen(now)
      : null;
  return at && !Number.isNaN(at.getTime()) && at > now ? `Opens ${formatEastern(at)}` : 'Closed';
};

const plain = (n: number, maxFrac: number): string => {
  if (!Number.isFinite(n) || n <= 0) return '';
  const f = Math.max(0, Math.min(maxFrac, 18));
  const m = 10 ** Math.min(f, 12);
  const s = (Math.floor(n * m) / m).toFixed(Math.min(f, 12));
  return s.replace(/\.?0+$/, '');
};

export const usdToSpend = ({
  side,
  usd,
  price,
  decimals,
}: {
  side: 'buy' | 'sell';
  usd: string | number;
  price: number | null | undefined;
  decimals: number;
}): string => {
  const v = Number(usd);
  if (!usd || !Number.isFinite(v) || v <= 0) return '';
  if (side === 'buy') return plain(v, Math.min(decimals, 6));
  if (!price || !Number.isFinite(price) || price <= 0) return '';
  return plain(v / price, Math.min(decimals, 8));
};

export const spendToUsd = ({
  side,
  amount,
  price,
}: {
  side: 'buy' | 'sell';
  amount: string | number;
  price: number | null | undefined;
}): number | null => {
  const a = Number(amount);
  if (!Number.isFinite(a) || a <= 0) return null;
  if (side === 'buy') return a;
  return price && price > 0 ? a * price : null;
};

export const pickRoute = ({
  side,
  chains,
  payOptionsByChain,
  balances = {},
}: {
  side: 'buy' | 'sell';
  chains: RwaChain[];
  payOptionsByChain: Partial<Record<RwaChain, PayToken[]>>;
  balances?: Partial<Record<RwaChain, Record<string, number>>>;
}): { chain: RwaChain; paySym: PayToken['symbol'] } | null => {
  let best: { chain: RwaChain; paySym: PayToken['symbol'] } | null = null;
  let bestBal = 0;

  chains.forEach(c => {
    const opts = payOptionsByChain[c] || [];
    if (!opts.length) return;
    if (side === 'buy') {
      opts.forEach(p => {
        const b = Number((balances[c] || {})[p.symbol] || 0);
        if (b > bestBal) {
          best = { chain: c, paySym: p.symbol };
          bestBal = b;
        }
      });
    } else {
      const b = Number((balances[c] || {}).asset || 0);
      if (b > bestBal) {
        best = { chain: c, paySym: opts[0].symbol };
        bestBal = b;
      }
    }
  });

  if (best) return best;
  const c = chains.includes('BSC') ? 'BSC' : chains.find(x => (payOptionsByChain[x] || []).length);
  return c ? { chain: c, paySym: payOptionsByChain[c]![0].symbol } : null;
};

export const rateText = ({
  side,
  symbol,
  amountIn,
  amountOut,
}: {
  side: 'buy' | 'sell';
  symbol: string;
  amountIn: string | number;
  amountOut: string | number;
}): string | null => {
  const i = Number(amountIn);
  const o = Number(amountOut);
  if (!(i > 0) || !(o > 0)) return null;
  const px = side === 'buy' ? i / o : o / i;
  return `1 ${symbol} = $${px >= 1 ? px.toFixed(2) : fmtSig(px, 4)}`;
};

export const amountError = ({
  ruleError,
  insufficient,
  spendSymbol,
  lowGas,
  nativeSymbol,
}: {
  ruleError?: string | null;
  insufficient?: boolean;
  spendSymbol: string;
  lowGas?: boolean;
  nativeSymbol: string;
}): string | null => {
  if (ruleError) return ruleError;
  if (insufficient) return `Not enough ${spendSymbol}`;
  if (lowGas) return `Not enough ${nativeSymbol} for the network fee`;
  return null;
};

export const fmtHolding = (n: number | string | null | undefined, maxFrac = 6): string => {
  const v = Number(n);
  if (n === null || n === undefined || n === '' || !Number.isFinite(v)) return '—';
  const s = v.toFixed(Math.max(maxFrac, 8)).replace(/\.?0+$/, '');
  const [i, f = ''] = s.split('.');
  const fr = f.slice(0, maxFrac).replace(/0+$/, '');
  const int = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fr ? `${int}.${fr}` : int === '0' && v > 0 ? `<${(10 ** -maxFrac).toFixed(maxFrac)}` : int;
};

export const isDust = (
  amount: number | string | null | undefined,
  price?: number | null
): boolean => {
  const v = Number(amount);
  if (!(v > 0)) return true;
  return price && price > 0 ? v * price < 0.01 : v < 1e-6;
};
