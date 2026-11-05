import { describe, expect, it } from 'vitest';

import type { Market } from '../core/models';
import { validateOrder } from '../utils/orderValidation';

describe('Order Validation Financial Precision (TRD-04)', () => {
  const dummyMarket: Market = {
    symbol: 'BTC-USDT',
    baseAsset: 'BTC',
    quoteAsset: 'USDT',
    minOrderSize: 0.001,
    stepSize: 0.001,
    tickSize: 0.1,
    minNotional: 5,
    maxLeverage: 50,
  };

  it('validates min notional accurately with BigNumber without float drift', () => {
    // 0.0001 BTC at $40,000 = $4 notional (< $5 minNotional)
    const result = validateOrder(dummyMarket, 40000, [], 'BUY', 'LIMIT', '40000', '0.0001', 'base');
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Minimum order size');
  });

  it('accepts order satisfying minNotional and lot size', () => {
    // 0.001 BTC at $40,000 = $40 notional (>= $5)
    const result = validateOrder(
      dummyMarket,
      40000,
      [],
      'BUY',
      'LIMIT',
      '40000.0',
      '0.001',
      'base'
    );
    expect(result.isValid).toBe(true);
  });

  it('rejects order with size exceeding max available size with exact precision', () => {
    const result = validateOrder(
      dummyMarket,
      40000,
      [],
      'BUY',
      'LIMIT',
      '40000',
      '2.000',
      'base',
      undefined,
      undefined,
      1.0 // max size = 1 BTC
    );
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Exceeds max available size');
  });
});
