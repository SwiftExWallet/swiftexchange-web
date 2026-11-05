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
