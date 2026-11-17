import { describe, expect, it } from 'vitest';

import type { Market } from '../../../core/models';
import { validateOrder } from '../../../utils/orderValidation';

const mockMarket: Market = {
  symbol: 'BTC-USDT',
  baseAsset: 'BTC',
  quoteAsset: 'USDT',
  tickSize: 0.1,
  stepSize: 0.001,
  minOrderSize: 0.001,
  minNotional: 5.0,
  maxLeverage: 100,
};

describe('Order Precision & Trigger Validation (TRD-04, TRD-07)', () => {
  it('validates order matching tickSize and stepSize', () => {
    const res = validateOrder(
      mockMarket,
      50000,
      [],
      'BUY',
      'LIMIT',
      '50000.1', // Multiple of 0.1
      '0.005', // Multiple of 0.001
      'base'
    );
    expect(res.isValid).toBe(true);
  });

  it('rejects order with invalid tickSize or stepSize precision', () => {
    const priceRes = validateOrder(
      mockMarket,
      50000,
      [],
      'BUY',
      'LIMIT',
      '50000.125', // Invalid tickSize
      '0.005',
      'base'
    );
    expect(priceRes.isValid).toBe(false);
    expect(priceRes.errorField).toBe('price');

    const sizeRes = validateOrder(
      mockMarket,
      50000,
      [],
      'BUY',
      'LIMIT',
      '50000.1',
      '0.0005', // Invalid stepSize
      'base'
    );
    expect(sizeRes.isValid).toBe(false);
    expect(sizeRes.errorField).toBe('size');
  });

  it('enforces minNotional threshold', () => {
    const res = validateOrder(
      mockMarket,
      50000,
      [],
      'BUY',
      'LIMIT',
      '50000.0',
      '0.00001', // 0.00001 * 50000 = $0.5 < $5 minNotional
      'base'
    );
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('Minimum order size');
  });

  it('enforces STOP order trigger price direction (TRD-07)', () => {
    // STOP BUY must be >= current price
    const invalidStopBuy = validateOrder(
      mockMarket,
      50000,
      [],
      'BUY',
      'STOP',
      '51000.0',
      '0.01',
      'base',
      '49000.0' // Less than current price 50000!
    );
    expect(invalidStopBuy.isValid).toBe(false);
    expect(invalidStopBuy.error).toContain('Stop BUY trigger price must be ≥ current price');

    const validStopBuy = validateOrder(
      mockMarket,
      50000,
      [],
      'BUY',
      'STOP',
      '51000.0',
      '0.01',
      'base',
      '50500.0'
    );
    expect(validStopBuy.isValid).toBe(true);

    // STOP SELL must be <= current price
    const invalidStopSell = validateOrder(
      mockMarket,
      50000,
      [],
      'SELL',
      'STOP',
      '48000.0',
      '0.01',
      'base',
      '51000.0' // Greater than current price 50000!
    );
    expect(invalidStopSell.isValid).toBe(false);
    expect(invalidStopSell.error).toContain('Stop SELL trigger price must be ≤ current price');
  });

  it('enforces TAKE_PROFIT order trigger price direction (TRD-07)', () => {
    // TAKE_PROFIT SELL must be >= current price
    const invalidTpSell = validateOrder(
      mockMarket,
      50000,
      [],
      'SELL',
      'TAKE_PROFIT',
      '52000.0',
      '0.01',
      'base',
      '49000.0' // Less than current price!
    );
    expect(invalidTpSell.isValid).toBe(false);
    expect(invalidTpSell.error).toContain('Take Profit SELL trigger price must be ≥ current price');

    // TAKE_PROFIT BUY must be <= current price
    const invalidTpBuy = validateOrder(
      mockMarket,
      50000,
      [],
      'BUY',
      'TAKE_PROFIT',
      '48000.0',
      '0.01',
      'base',
      '51000.0' // Greater than current price!
    );
    expect(invalidTpBuy.isValid).toBe(false);
    expect(invalidTpBuy.error).toContain('Take Profit BUY trigger price must be ≤ current price');
  });
});
