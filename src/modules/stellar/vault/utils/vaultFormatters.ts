import BigNumber from 'bignumber.js';

export const parseTokenUnits = (amount: string, decimals: number = 7): bigint => {
  if (!amount || amount.trim() === '') return 0n;
  const clean = amount.trim().replace(/,/g, '');
  const bn = new BigNumber(clean);
  if (bn.isNaN() || bn.isLessThanOrEqualTo(0)) return 0n;
  const scaled = bn
    .multipliedBy(new BigNumber(10).pow(decimals))
    .integerValue(BigNumber.ROUND_DOWN);
  return BigInt(scaled.toFixed(0));
};

export const formatTokenUnits = (
  stroops: bigint | string | number,
  decimals: number = 7
): string => {
  const bn = new BigNumber(stroops.toString()).dividedBy(new BigNumber(10).pow(decimals));
  if (bn.isNaN() || bn.isZero()) return '0.00';
  return bn.toFixed(2, BigNumber.ROUND_DOWN);
};

export const formatPreciseUnits = (
  stroops: bigint | string | number,
  decimals: number = 7
): string => {
  const bn = new BigNumber(stroops.toString()).dividedBy(new BigNumber(10).pow(decimals));
  if (bn.isNaN() || bn.isZero()) return '0.0000';
  return bn.toFixed(4, BigNumber.ROUND_DOWN);
};

export const formatCurrency = (val: number | string): string => {
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

export const formatCompactNumber = (val: number): string => {
  if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(2)}B`;
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(2)}K`;
  return val.toFixed(2);
};

export const convertToAssets = (
  shares: bigint,
  totalAssets: bigint,
  totalShares: bigint
): bigint => {
  if (totalShares <= 0n || totalAssets <= 0n || shares <= 0n) return 0n;
  return (shares * totalAssets) / totalShares;
};

export const convertToShares = (
  assets: bigint,
  totalAssets: bigint,
  totalShares: bigint
): bigint => {
  if (assets <= 0n) return 0n;
  if (totalShares <= 0n || totalAssets <= 0n) return assets; // 1:1 initial deposit
  return (assets * totalShares) / totalAssets;
};
