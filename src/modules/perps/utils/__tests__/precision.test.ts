import { describe, expect, it } from 'vitest';

import {
  formatPriceToTick,
  formatQuantityToStep,
  generateClientOrderId,
  safeDecimals,
  safeFormatNumber,
} from '../precision';

describe('Trading Precision & Quantization (TRD-01, TRD-02)', () => {
  it('truncates order quantities to stepSize without rounding up', () => {
    expect(formatQuantityToStep('0.333333333', '0.001')).toBe('0.333');
    expect(formatQuantityToStep('1.999999', '0.01')).toBe('1.99');
    expect(formatQuantityToStep('123.45678', '0.0001')).toBe('123.4567');

    expect(formatQuantityToStep('5.8', '1')).toBe('5');
    expect(formatQuantityToStep('100', '10')).toBe('100');

    expect(formatQuantityToStep('0.0009', '0.001')).toBe('0.000');
  });

  it('formats order prices to tickSize multiples correctly', () => {
    expect(formatPriceToTick('65432.198', '0.1')).toBe('65432.2');
    expect(formatPriceToTick('65432.14', '0.1')).toBe('65432.1');
    expect(formatPriceToTick('100.5', '0.25')).toBe('100.50');
    expect(formatPriceToTick('0.00123456', '0.00001')).toBe('0.00123');
  });

  it('generates valid, unique client order IDs conforming to Aster regex', () => {
    const id1 = generateClientOrderId();
    const id2 = generateClientOrderId();

    expect(id1).not.toBe(id2);
    const asterRegex = /^[.A-Z:/a-z0-9_-]{1,36}$/;
    expect(asterRegex.test(id1)).toBe(true);
    expect(asterRegex.test(id2)).toBe(true);
    expect(id1.length).toBeLessThanOrEqual(36);
  });

  it('safely formats numbers without throwing on invalid min/maxDec or non-finite values', () => {
    expect(safeFormatNumber(1234.5678, 2, 4)).toBe('1,234.5678');
    expect(safeFormatNumber(1234.5678, 4, 2)).toBe('1,234.5678');
    expect(safeFormatNumber(1234.5678, Infinity, Infinity)).toBe('1,234.5678');
    expect(safeFormatNumber(1234.5678, -2, -5)).toBe('1,235');
    expect(safeFormatNumber(NaN)).toBe('--');
    expect(safeFormatNumber(undefined)).toBe('--');
    expect(safeFormatNumber(null)).toBe('--');
    expect(safeFormatNumber('')).toBe('--');
    expect(safeFormatNumber('9876.54321', 2, 2)).toBe('9,876.54');
    expect(safeFormatNumber(0, 2, 2)).toBe('0.00');
  });

  it('safely calculates decimal precision from step or tick size', () => {
    expect(safeDecimals(0.1)).toBe(1);
    expect(safeDecimals(0.001)).toBe(3);
    expect(safeDecimals('0.0001')).toBe(4);
    expect(safeDecimals(0)).toBe(2);
    expect(safeDecimals(undefined)).toBe(2);
    expect(safeDecimals(null)).toBe(2);
    expect(safeDecimals(-1)).toBe(2);
    expect(safeDecimals(NaN)).toBe(2);
    expect(safeDecimals(0.00000000001, 2, 8)).toBe(8);
  });
});
