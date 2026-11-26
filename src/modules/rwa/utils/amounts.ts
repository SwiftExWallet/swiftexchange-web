// Amount / decimals helpers (strings + BigInt / ethers v6; never floats for on-chain amounts).
import { formatEther, formatUnits, parseUnits } from 'ethers';

export const cleanAmountInput = (
  text: string | number | null | undefined,
  decimals = 6
): string => {
  let t = String(text || '')
    .replace(',', '.')
    .replace(/[^0-9.]/g, '');
  const dot = t.indexOf('.');
  if (dot !== -1) t = t.slice(0, dot + 1) + t.slice(dot + 1).replace(/\./g, '');
  if (t.startsWith('.')) t = `0${t}`;
  const [i, f] = t.split('.');
  if (f !== undefined && f.length > decimals) t = `${i}.${f.slice(0, decimals)}`;
  return t;
};

export const toUnits = (
  amount: string | number | null | undefined,
  decimals: number
): string | null => {
  const a = cleanAmountInput(amount, decimals);
  if (!a || !/[1-9]/.test(a)) return null;
  try {
    return parseUnits(a, decimals).toString();
  } catch {
    return null;
  }
};

export const fromUnits = (
  units: string | number | bigint | null | undefined,
  decimals: number
): string | null => {
  if (units === null || units === undefined || units === '') return null;
  try {
    const s = formatUnits(BigInt(String(units)), decimals);
    return s.endsWith('.0') ? s.slice(0, -2) : s;
  } catch {
    return null;
  }
};

export const gteUnits = (a: string | bigint, b: string | bigint): boolean => {
  try {
    return BigInt(String(a)) >= BigInt(String(b));
  } catch {
    return false;
  }
};

export const fmtUsd = (n: number | string | null | undefined, max = 2): string => {
  const v = Number(n);
  if (n === null || n === undefined || n === '' || !Number.isFinite(v)) return '—';
  const digits = Math.abs(v) < 1 && v !== 0 ? Math.max(max, 4) : max;
  return `$${v.toLocaleString('en-US', {
    minimumFractionDigits: Math.min(2, digits),
    maximumFractionDigits: digits,
  })}`;
};

export const fmtAmount = (s: string | number | null | undefined, maxFrac = 6): string => {
  if (s === null || s === undefined) return '—';
  const [i, f = ''] = String(s).split('.');
  const fr = f.slice(0, maxFrac).replace(/0+$/, '');
  const int = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fr ? `${int}.${fr}` : int;
};

export const fmtSig = (n: number | string | null | undefined, sig = 2): string => {
  const v = Number(n);
  if (n === null || n === undefined || n === '' || !Number.isFinite(v)) return '—';
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1) return String(Number(v.toFixed(4)));
  const digits = Math.min(18, Math.ceil(-Math.log10(a)) + sig - 1);
  return v.toFixed(digits).replace(/(\.\d*?[1-9])0+$/, '$1');
};

export const nativeCostText = (
  weiString: string | bigint,
  nativeSymbol: string,
  nativeUsd: number | null | undefined
): string => {
  let n: number;
  try {
    n = Number(formatEther(BigInt(String(weiString))));
  } catch {
    return '—';
  }
  const usd =
    typeof nativeUsd === 'number' && Number.isFinite(nativeUsd) && nativeUsd > 0
      ? n * nativeUsd
      : null;
  const usdTxt = usd === null ? '' : usd > 0 && usd < 0.01 ? ' (<$0.01)' : ` (~$${usd.toFixed(2)})`;
  return `≈${fmtSig(n, 2)} ${nativeSymbol}${usdTxt}`;
};

export const fmtPct = (n: number | string | null | undefined): string => {
  const v = Number(n);
  if (n === null || n === undefined || n === '' || !Number.isFinite(v)) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
};
