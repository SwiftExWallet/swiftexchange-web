import BigNumber from 'bignumber.js';

/**
 * Format quantity to exact stepSize multiple, truncated down (floor) using BigNumber.
 * Never rounds up to prevent margin overspending.
 */
export function formatQuantityToStep(quantity: string | number, stepSize: string | number): string {
  const bnQty = new BigNumber(quantity);
  const bnStep = new BigNumber(stepSize);

  if (bnStep.isZero() || bnStep.isNaN() || bnQty.isNaN()) {
    return bnQty.toString();
  }

  const stepStr = bnStep.toString();
  const decimals = stepStr.includes('.') ? stepStr.split('.')[1].length : 0;

  const units = bnQty.dividedToIntegerBy(bnStep);
  return units.multipliedBy(bnStep).toFixed(decimals);
}

/**
 * Format price to exact tickSize multiple using BigNumber.
 */
export function formatPriceToTick(price: string | number, tickSize: string | number): string {
  const bnPrice = new BigNumber(price);
  const bnTick = new BigNumber(tickSize);

  if (bnTick.isZero() || bnTick.isNaN() || bnPrice.isNaN()) {
    return bnPrice.toString();
  }

  const tickStr = bnTick.toString();
  const decimals = tickStr.includes('.') ? tickStr.split('.')[1].length : 0;

  const units = bnPrice.dividedBy(bnTick).integerValue(BigNumber.ROUND_HALF_UP);
  return units.multipliedBy(bnTick).toFixed(decimals);
}

/**
 * Generate unique client order ID satisfying Aster regex ^[\.A-Z\:/a-z0-9_-]{1,36}$
 */
export function generateClientOrderId(prefix = 'sx'): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${ts}_${rand}`;
}

export function safeFormatNumber(
  val: string | number | undefined | null,
  minDec = 2,
  maxDec = 4,
  fallback = '--'
): string {
  if (val === undefined || val === null || val === '') return fallback;
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (!Number.isFinite(num)) return fallback;

  const safeMin = Number.isFinite(minDec) ? Math.min(20, Math.max(0, Math.floor(minDec))) : 2;
  const safeMax = Number.isFinite(maxDec)
    ? Math.min(20, Math.max(safeMin, Math.floor(maxDec)))
    : Math.max(safeMin, 4);

  try {
    return num.toLocaleString('en-US', {
      minimumFractionDigits: safeMin,
      maximumFractionDigits: safeMax,
    });
  } catch {
    return num.toFixed(Math.min(safeMax, 8));
  }
}

export function safeDecimals(
  stepOrTick: number | string | undefined | null,
  defaultDec = 2,
  maxLimit = 8
): number {
  if (!stepOrTick) return defaultDec;
  const num = typeof stepOrTick === 'string' ? parseFloat(stepOrTick) : stepOrTick;
  if (!Number.isFinite(num) || num <= 0) return defaultDec;
  const dec = -Math.floor(Math.log10(num));
  if (!Number.isFinite(dec)) return defaultDec;
  return Math.min(maxLimit, Math.max(0, dec));
}
