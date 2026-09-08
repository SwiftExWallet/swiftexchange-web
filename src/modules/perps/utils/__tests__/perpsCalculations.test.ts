import { describe, expect, it } from 'vitest';

import { generateMonotonicNonce } from '../../adapters/aster/api/auth';
import type { AccountBalance, Market, Position } from '../../core/models';
import { calculateLiquidationPrice } from '../liquidationCalculator';
import { validateOrder } from '../orderValidation';

describe('Perps Calculations & Financial Safety Audit Tests', () => {
  describe('Monotonic Microsecond Nonce Generator', () => {
    it('generates strictly increasing nonces for rapid concurrent calls', () => {
      const serverTime = 1725700000123;
      const nonces = new Set<string>();
      const generatedList: bigint[] = [];

      for (let i = 0; i < 1000; i++) {
        const nonceStr = generateMonotonicNonce(serverTime);
        nonces.add(nonceStr);
        generatedList.push(BigInt(nonceStr));
      }

      // Must have 1,000 completely unique nonces (no collisions)
      expect(nonces.size).toBe(1000);

      // Must be strictly monotonically increasing: nonce[i+1] > nonce[i]
      for (let i = 0; i < generatedList.length - 1; i++) {
        expect(generatedList[i + 1] > generatedList[i]).toBe(true);
      }
    });
  });

  describe('Order Validation Tick & Step Precision', () => {
    const btcMarket: Market = {
      symbol: 'BTC-USDT',
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      tickSize: 0.1,
      stepSize: 0.001,
      minOrderSize: 0.001,
      minNotional: 5,
      maxLeverage: 100,
    };

    const microMarket: Market = {
      symbol: 'SHIB-USDT',
      baseAsset: 'SHIB',
      quoteAsset: 'USDT',
      tickSize: 0.00001,
      stepSize: 100,
      minOrderSize: 100,
      minNotional: 1,
      maxLeverage: 50,
    };

    it('accepts valid tick and step multiples without IEEE 754 float drift', () => {
      // SHIB price with 0.00001 tick size, 10,000 size (1.5 USD > 1 USD minNotional)
      const res = validateOrder(
        microMarket,
        0.00015,
        [],
        'BUY',
        'LIMIT',
        '0.00015',
        '10000',
        'base'
      );
      expect(res.isValid).toBe(true);
    });

    it('rejects invalid tick multiple accurately', () => {
      const res = validateOrder(
        microMarket,
        0.00015,
        [],
        'BUY',
        'LIMIT',
        '0.000153', // not a multiple of 0.00001
        '5000',
        'base'
      );
      expect(res.isValid).toBe(false);
      expect(res.errorField).toBe('price');
    });

    it('rejects invalid step multiple accurately', () => {
      const res = validateOrder(
        btcMarket,
        60000,
        [],
        'BUY',
        'LIMIT',
        '60000.1',
        '0.0015', // not a multiple of 0.001 step size
        'base'
      );
      expect(res.isValid).toBe(false);
      expect(res.errorField).toBe('size');
    });
  });

  describe('Liquidation Price Mathematical Accuracy', () => {
    const positionLong: Position = {
      symbol: 'BTC-USDT',
      size: '1.0', // 1 BTC Long
      entryPrice: '60000',
      markPrice: '60000',
      liquidationPrice: '0',
      unrealizedPnl: '0',
      leverage: 10,
      marginType: 'isolated',
      isolatedMargin: '6000', // 10x leverage = 10% margin
    };

    const positionShort: Position = {
      symbol: 'BTC-USDT',
      size: '-1.0', // 1 BTC Short
      entryPrice: '60000',
      markPrice: '60000',
      liquidationPrice: '0',
      unrealizedPnl: '0',
      leverage: 10,
      marginType: 'isolated',
      isolatedMargin: '6000',
    };

    it('calculates isolated long liquidation price with denominator scaling', () => {
      const liqPrice = calculateLiquidationPrice({
        position: positionLong,
        bracketsBySymbol: {
          BTCUSDT: [
            {
              bracket: 1,
              initialLeverage: 100,
              notionalCap: 1000000,
              notionalFloor: 0,
              maintMarginRatio: 0.005, // 0.5%
              cum: 0,
            },
          ],
        },
      });

      expect(liqPrice).toBeDefined();
      expect(liqPrice).toBeGreaterThan(50000);
      expect(liqPrice).toBeLessThan(60000);

      // (60000 - 6000) / (1 * (1 - 0.005)) = 54000 / 0.995 ≈ 54271.35
      expect(Math.round(liqPrice!)).toBe(54271);
    });

    it('calculates isolated short liquidation price with denominator scaling', () => {
      const liqPrice = calculateLiquidationPrice({
        position: positionShort,
        bracketsBySymbol: {
          BTCUSDT: [
            {
              bracket: 1,
              initialLeverage: 100,
              notionalCap: 1000000,
              notionalFloor: 0,
              maintMarginRatio: 0.005,
              cum: 0,
            },
          ],
        },
      });

      expect(liqPrice).toBeDefined();
      expect(liqPrice).toBeGreaterThan(60000);

      // (60000 + 6000) / (1 * (1 + 0.005)) = 66000 / 1.005 ≈ 65671.64
      expect(Math.round(liqPrice!)).toBe(65672);
    });

    it('converts non-stable collateral correctly in multi-asset mode using assetPrices', () => {
      const crossPos: Position = {
        symbol: 'BTC-USDT',
        size: '1.0',
        entryPrice: '60000',
        markPrice: '60000',
        liquidationPrice: '0',
        unrealizedPnl: '0',
        leverage: 10,
        marginType: 'cross',
        isolatedMargin: '0',
      };

      const balances: AccountBalance[] = [
        {
          asset: 'ETH',
          total: '2.0', // 2 ETH at $3,000 = $6,000
          available: '2.0',
          locked: '0',
        },
        {
          asset: 'USDT',
          total: '1000', // $1,000 USDT
          available: '1000',
          locked: '0',
        },
      ];

      const liqPrice = calculateLiquidationPrice({
        position: crossPos,
        allPositions: [crossPos],
        balances,
        isMultiAsset: true,
        assetPrices: {
          ETH: 3000,
        },
        bracketsBySymbol: {
          BTCUSDT: [
            {
              bracket: 1,
              initialLeverage: 100,
              notionalCap: 1000000,
              notionalFloor: 0,
              maintMarginRatio: 0.005,
              cum: 0,
            },
          ],
        },
      });

      expect(liqPrice).toBeDefined();
      // Total collateral = 2 * 3000 + 1000 = $7,000
      // Denom = 1 * (1 - 0.005) = 0.995
      // (60000 - 7000) / 0.995 = 53000 / 0.995 ≈ 53266.33
      expect(Math.round(liqPrice!)).toBe(53266);
    });
  });
});
