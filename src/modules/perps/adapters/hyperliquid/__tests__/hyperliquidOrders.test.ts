import { describe, expect, it, vi } from 'vitest';

import { formatHyperliquidPrice, formatHyperliquidSize } from '../api/orders';

vi.mock('@nktkas/hyperliquid/api/info', () => ({
  meta: vi.fn().mockResolvedValue({
    universe: [
      { name: 'BTC', szDecimals: 4 },
      { name: 'ETH', szDecimals: 3 },
    ],
  }),
  openOrders: vi.fn().mockResolvedValue([]),
}));

vi.mock('@nktkas/hyperliquid/api/exchange', () => ({
  order: vi.fn().mockImplementation(async () => ({
    status: 'ok',
    response: {
      type: 'order',
      data: {
        statuses: [{ resting: { oid: 12345 } }],
      },
    },
  })),
  cancel: vi.fn().mockImplementation(async (...args: any[]) => {
    const payload = args[1];
    // If oid is 99999, simulate "already canceled/filled"
    if (payload?.cancels?.[0]?.o === 99999) {
      return {
        status: 'err',
        response: 'Order was never placed, already canceled, or already filled',
      };
    }
    return {
      status: 'ok',
      response: {
        type: 'cancel',
        data: { statuses: ['success'] },
      },
    };
  }),
  updateLeverage: vi.fn().mockResolvedValue({ status: 'ok' }),
  updateIsolatedMargin: vi.fn().mockResolvedValue({ status: 'ok' }),
}));

describe('Hyperliquid Order Formatting Utilities (BigNumber)', () => {
  describe('formatHyperliquidPrice', () => {
    it('returns "0" for invalid or non-positive price inputs', () => {
      expect(formatHyperliquidPrice(0)).toBe('0');
      expect(formatHyperliquidPrice(-10)).toBe('0');
      expect(formatHyperliquidPrice('abc')).toBe('0');
      expect(formatHyperliquidPrice(NaN)).toBe('0');
    });

    it('enforces 5 significant figures for large BTC prices (szDecimals = 4, maxDecimals = 2)', () => {
      // 95432.1 has 6 digits total -> clamped to 5 sig figs (95432)
      expect(formatHyperliquidPrice(95432.1, 4)).toBe('95432');
      expect(formatHyperliquidPrice('95432.89', 4)).toBe('95433');
      expect(formatHyperliquidPrice(65000.0, 4)).toBe('65000');
    });

    it('enforces 5 significant figures and maxDecimals for ETH (szDecimals = 3, maxDecimals = 3)', () => {
      // 3123.456 -> 5 sig figs = 3123.5 (1 decimal)
      expect(formatHyperliquidPrice(3123.456, 3)).toBe('3123.5');
      // 312.3456 -> 5 sig figs = 312.35 (2 decimals)
      expect(formatHyperliquidPrice(312.3456, 3)).toBe('312.35');
    });

    it('enforces 5 significant figures for SOL (szDecimals = 2, maxDecimals = 4)', () => {
      // 185.4567 -> 5 sig figs = 185.46 (2 decimals <= 4)
      expect(formatHyperliquidPrice(185.4567, 2)).toBe('185.46');
      // 18.54567 -> 5 sig figs = 18.546 (3 decimals <= 4)
      expect(formatHyperliquidPrice(18.54567, 2)).toBe('18.546');
    });

    it('clamps decimal places to (6 - szDecimals) for low-value coins', () => {
      // szDecimals = 0 -> maxDecimals = 6
      // 0.0001234567 -> 5 sig figs would be 0.00012346 (8 decimals), clamped to 6 decimals: 0.000123
      expect(formatHyperliquidPrice(0.0001234567, 0)).toBe('0.000123');
    });

    it('strips redundant trailing zeros', () => {
      expect(formatHyperliquidPrice(150.0, 2)).toBe('150');
      expect(formatHyperliquidPrice('150.1000', 2)).toBe('150.1');
      expect(formatHyperliquidPrice(1234.5, 4)).toBe('1234.5');
    });

    it('handles string and number inputs identically without IEEE 754 precision artifacts', () => {
      expect(formatHyperliquidPrice('0.10000000000000000555', 2)).toBe('0.1');
      expect(formatHyperliquidPrice(0.07 + 0.01, 2)).toBe('0.08');
    });
  });

  describe('formatHyperliquidSize', () => {
    it('returns "0" for invalid or non-positive sizes', () => {
      expect(formatHyperliquidSize(0)).toBe('0');
      expect(formatHyperliquidSize(-1.5)).toBe('0');
      expect(formatHyperliquidSize('invalid')).toBe('0');
      expect(formatHyperliquidSize(NaN)).toBe('0');
    });

    it('floors (truncates) size down to szDecimals without rounding up', () => {
      // Rounding up would be 1.2346; must truncate down to 1.2345
      expect(formatHyperliquidSize(1.23459, 4)).toBe('1.2345');
      expect(formatHyperliquidSize('0.999', 2)).toBe('0.99');
      expect(formatHyperliquidSize(15.99, 0)).toBe('15');
    });

    it('strips unnecessary trailing zeros while maintaining valid step size', () => {
      expect(formatHyperliquidSize(1.5, 4)).toBe('1.5');
      expect(formatHyperliquidSize('2.0000', 4)).toBe('2');
    });

    it('returns "0" if input size is strictly smaller than step size', () => {
      expect(formatHyperliquidSize(0.00009, 4)).toBe('0');
      expect(formatHyperliquidSize('0.009', 2)).toBe('0');
    });
  });

  describe('placeHyperliquidOrder pre-flight checks', () => {
    it('rejects opening orders with notional value under $10 USD', async () => {
      const { placeHyperliquidOrder } = await import('../api/orders');

      // 0.0001 BTC * $60,000 = $6 notional (< $10)
      const subTenDollarOrder = {
        symbol: 'BTC-USDC',
        side: 'BUY' as const,
        type: 'LIMIT' as const,
        price: '60000',
        size: '0.0001',
        reduceOnly: false,
      };

      await expect(placeHyperliquidOrder({} as any, subTenDollarOrder, true)).rejects.toThrow(
        /Minimum order value on Hyperliquid is \$10 USD/
      );
    });

    it('allows opening orders with notional value >= $10 USD', async () => {
      const { placeHyperliquidOrder } = await import('../api/orders');

      // 0.0002 BTC * $60,000 = $12 notional (>= $10)
      const validOrder = {
        symbol: 'BTC-USDC',
        side: 'BUY' as const,
        type: 'LIMIT' as const,
        price: '60000',
        size: '0.0002',
        reduceOnly: false,
      };

      const res = await placeHyperliquidOrder({} as any, validOrder, true);
      expect(res.status).toBe('ok');
    });

    it('allows reduce-only orders even if notional value is under $10 USD (dust position closing)', async () => {
      const { placeHyperliquidOrder } = await import('../api/orders');

      // 0.00005 BTC * $60,000 = $3 notional (< $10), but reduceOnly = true
      const reduceOnlyDustOrder = {
        symbol: 'BTC-USDC',
        side: 'SELL' as const,
        type: 'LIMIT' as const,
        price: '60000',
        size: '0.00005',
        reduceOnly: true,
      };

      const res = await placeHyperliquidOrder({} as any, reduceOnlyDustOrder, true);
      expect(res.status).toBe('ok');
    });
  });

  describe('cancelHyperliquidOrder graceful handling', () => {
    it('swallows "already filled / canceled" error and returns alreadyDone: true', async () => {
      const { cancelHyperliquidOrder } = await import('../api/orders');

      // Mock exchange rejecting with benign race condition message
      const res = await cancelHyperliquidOrder({} as any, 'BTC-USDC', 99999, true);
      expect(res.status).toBe('ok');
      expect(res.alreadyDone).toBe(true);
    });
  });
});
