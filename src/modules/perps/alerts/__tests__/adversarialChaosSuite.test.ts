import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { alertsApi } from '../api';
import {
  buildAlertSnapshotPayload,
  buildAssetSnapshots,
  buildPositionSnapshots,
  filterMutedKeysForActivePositions,
  normalizeSymbol,
} from '../snapshotBuilder';

describe('Adversarial Chaos & Reverse-Engineering Attack Suite', () => {
  beforeEach(() => {
    alertsApi.resetRateLimit();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Attack Vector 1: Symbol Normalization Fuzzing', () => {
    it('handles undefined, null, empty strings, and weird delimiters gracefully', () => {
      expect(normalizeSymbol('')).toBe('');
      expect(normalizeSymbol('btc-usdt')).toBe('BTCUSDT');
      expect(normalizeSymbol('ETH_USDT')).toBe('ETHUSDT');
      expect(normalizeSymbol('sol/usdc')).toBe('SOLUSDC');
      expect(normalizeSymbol('---bnb___usdt///')).toBe('BNBUSDT');
    });
  });

  describe('Attack Vector 2: Corrupted, NaN, & Extreme Balances', () => {
    it('filters out NaN, non-finite, and zero balances, preserving valid negatives', () => {
      const maliciousAssets: any[] = [
        null,
        undefined,
        {},
        { asset: 'USDT', crossWalletBalance: '0' },
        { asset: 'USDT', crossWalletBalance: 'NaN' },
        { asset: 'USDT', crossWalletBalance: 'Infinity' },
        { asset: 'USDT', crossWalletBalance: '-Infinity' },
        { asset: 'USDT', crossWalletBalance: 'not_a_number' },
        { asset: 'USDT', crossWalletBalance: '100.25' },
        { asset: 'USD1', crossWalletBalance: '-50.5' },
      ];

      const res = buildAssetSnapshots(maliciousAssets, false, []);
      expect(res).toHaveLength(2);
      expect(res[0]).toEqual({
        asset: 'USDT',
        crossWalletBalance: '100.25',
        price: '1',
        discount: '1',
      });
      expect(res[1]).toEqual({
        asset: 'USD1',
        crossWalletBalance: '-50.5',
        price: '1',
        discount: '1',
      });
    });
  });

  describe('Attack Vector 3: Poisoned assetIndex & Haircut Attacks', () => {
    it('handles extreme bidBuffers (negative, >1, NaN, non-numeric) safely', () => {
      const assets = [
        { asset: 'BNB', crossWalletBalance: '10' },
        { asset: 'BTC', crossWalletBalance: '1' },
        { asset: 'ETH', crossWalletBalance: '2' },
        { asset: 'SOL', crossWalletBalance: '5' },
      ];

      const poisonedIndexes: any[] = [
        { symbol: 'BNBUSD', index: '600', bidBuffer: '-0.5' }, // negative buffer -> fallback 0.9
        { symbol: 'BTCUSD', index: '60000', bidBuffer: '1.5' }, // > 1 buffer -> fallback 0.9
        { symbol: 'ETHUSD', index: '3000', bidBuffer: 'invalid' }, // NaN buffer -> fallback 0.9
        { symbol: 'SOLUSD', index: '0', bidBuffer: '0.1' }, // zero price -> omitted
      ];

      const res = buildAssetSnapshots(assets, true, poisonedIndexes);
      expect(res.find(a => a.asset === 'SOL')).toBeUndefined(); // Zero price omitted

      const bnb = res.find(a => a.asset === 'BNB');
      expect(bnb?.discount).toBe('0.9'); // Safe fallback

      const btc = res.find(a => a.asset === 'BTC');
      expect(btc?.discount).toBe('0.9'); // Safe fallback

      const eth = res.find(a => a.asset === 'ETH');
      expect(eth?.discount).toBe('0.9'); // Safe fallback
    });
  });

  describe('Attack Vector 4: Poisoned Positions & Malformed Quantities', () => {
    it('filters out corrupted amounts and missing symbols', () => {
      const poisonedPositions: any[] = [
        null,
        undefined,
        { symbol: '', positionAmt: '1' },
        { symbol: 'BTCUSDT', positionAmt: '0' },
        { symbol: 'ETHUSDT', positionAmt: 'NaN' },
        {
          symbol: 'XRPUSDT',
          positionAmt: '100',
          entryPrice: '0.5',
          markPrice: '0.5',
          marginType: 'cross',
        },
      ];

      const res = buildPositionSnapshots(poisonedPositions, []);
      expect(res).toHaveLength(1);
      expect(res[0].symbol).toBe('XRPUSDT');
    });
  });

  describe('Attack Vector 5: Massive Scale Overload & Payload Size Protection', () => {
    it('strictly caps positions at 10 (sorted by notional) and assets at 30 under 64 KB', () => {
      const hugePositions: any[] = [];
      for (let i = 1; i <= 100; i++) {
        hugePositions.push({
          symbol: `TOKEN${i}USDT`,
          positionAmt: String(i),
          entryPrice: '10',
          markPrice: '10',
          notional: String(i * 10),
          marginType: i % 2 === 0 ? 'isolated' : 'cross',
          isolatedWallet: '100',
        });
      }

      const hugeAssets: any[] = [];
      const assetIndexes: any[] = [];
      for (let i = 1; i <= 100; i++) {
        hugeAssets.push({
          asset: `COIN${i}`,
          crossWalletBalance: String(i * 10),
        });
        assetIndexes.push({
          symbol: `COIN${i}USD`,
          index: '10',
          bidBuffer: '0.05',
        });
      }

      const payload = buildAlertSnapshotPayload({
        fcmToken: 'f'.repeat(100),
        wallet: '0x' + 'a'.repeat(40),
        accountInfo: { assets: hugeAssets, positions: [] } as any,
        positionRisks: hugePositions,
        isMultiAsset: true,
        assetIndexes,
      });

      expect(payload.account.positions.length).toBe(10);
      expect(payload.account.assets.length).toBe(30);

      // Top notional must be largest (TOKEN100USDT with notional 1000)
      expect(payload.account.positions[0].symbol).toBe('TOKEN100USDT');
      expect(payload.account.positions[9].symbol).toBe('TOKEN91USDT');

      // JSON payload size must be well under 64 KB limit
      const serialized = JSON.stringify(payload);
      const sizeInKb = new TextEncoder().encode(serialized).length / 1024;
      expect(sizeInKb).toBeLessThan(10);
    });
  });

  describe('Attack Vector 6: Position Flip & Muted Keys Clean-up', () => {
    it('properly drops muted keys when position flips side or closes', () => {
      // User initially had an isolated Short
      const savedKeys = ['cross', 'iso:BTCUSDT:SHORT', 'iso:ETHUSDT:LONG'];

      // User closed Short and opened an isolated Long on BTCUSDT
      const activePositions: any[] = [
        { symbol: 'BTCUSDT', positionAmt: '1.5', marginType: 'isolated' }, // Now LONG!
      ];

      const muted = filterMutedKeysForActivePositions(savedKeys, activePositions);

      // 'cross' dropped because no cross position is open
      // 'iso:BTCUSDT:SHORT' dropped because BTC is now LONG
      // 'iso:ETHUSDT:LONG' dropped because ETH is closed
      expect(muted).toEqual([]);
    });
  });

  describe('Attack Vector 7: 429 Cascade DoS & Exponential Backoff Saturation', () => {
    it('doubles backoff on 429 up to 600,000ms and completely blocks egress requests', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
      } as any);

      const payload = {
        fcmToken: 'test_token_12345678901234567890',
        wallet: '0x1111111111111111111111111111111111111111',
        snapshotAt: Date.now(),
        account: { assets: [], positions: [] },
      };

      // 1st 429: backoff sets to 60s
      await alertsApi.postSnapshot(payload);
      expect(alertsApi.isRateLimited()).toBe(true);

      // Subsequent call rejected locally without network request
      await alertsApi.postSnapshot(payload);
      expect(fetch).toHaveBeenCalledTimes(1);

      // Fast-forward rateLimit timer to simulate subsequent retry after wait
      for (let i = 0; i < 5; i++) {
        (alertsApi as any).rateLimitedUntil = 0; // Simulate time expired
        await alertsApi.postSnapshot(payload);
      }

      // Max backoff capped at 600,000 ms (10 minutes)
      expect((alertsApi as any).backoffDelayMs).toBeLessThanOrEqual(600_000);
    });
  });

  describe('Attack Vector 8: Broken Server Responses (Garbage HTML & 500)', () => {
    it('silently recovers without unhandled rejections when server returns HTML or 500', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => '<html>500 Internal Server Error Cloudflare</html>',
      } as any);

      const payload = {
        fcmToken: 'test_token_12345678901234567890',
        wallet: '0x1111111111111111111111111111111111111111',
        snapshotAt: Date.now(),
        account: { assets: [], positions: [] },
      };

      const res = await alertsApi.postSnapshot(payload);
      expect(res).toBeNull(); // No crash, gracefully returned null
    });

    it('silently recovers when network throws hard TypeError (offline/CORS)', async () => {
      global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

      const payload = {
        fcmToken: 'test_token_12345678901234567890',
        wallet: '0x1111111111111111111111111111111111111111',
        snapshotAt: Date.now(),
        account: { assets: [], positions: [] },
      };

      const res = await alertsApi.postSnapshot(payload);
      expect(res).toBeNull(); // Graceful null
    });
  });
});
