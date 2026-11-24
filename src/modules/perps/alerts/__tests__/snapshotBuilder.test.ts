import { describe, expect, it } from 'vitest';

import {
  buildAlertSnapshotPayload,
  buildAssetSnapshots,
  buildPositionSnapshots,
  filterMutedKeysForActivePositions,
} from '../snapshotBuilder';

describe('snapshotBuilder', () => {
  describe('buildAssetSnapshots', () => {
    const mockAssets: any[] = [
      { asset: 'USDT', crossWalletBalance: '100.5' },
      { asset: 'USD1', crossWalletBalance: '50.0' },
      { asset: 'BNB', crossWalletBalance: '1.5' },
      { asset: 'BTC', crossWalletBalance: '-0.02' },
      { asset: 'ETH', crossWalletBalance: '0' },
    ];

    it('in Single-Asset mode: sends only USDT and USD1 assets with price=1 and discount=1', () => {
      const assets = buildAssetSnapshots(mockAssets, false, []);
      expect(assets).toHaveLength(2);
      expect(assets).toEqual([
        { asset: 'USDT', crossWalletBalance: '100.5', price: '1', discount: '1' },
        { asset: 'USD1', crossWalletBalance: '50.0', price: '1', discount: '1' },
      ]);
    });

    it('in Multi-Asset mode: calculates prices and haircuts from assetIndex and preserves negative balances', () => {
      const assetIndexes: any[] = [
        { symbol: 'BNBUSD', index: '600.0', bidBuffer: '0.05' },
        { symbol: 'BTCUSD', index: '65000.0', bidBuffer: '0.1' },
      ];

      const assets = buildAssetSnapshots(mockAssets, true, assetIndexes);

      // USDT, USD1, BNB, BTC (ETH is 0 balance so excluded)
      expect(assets).toHaveLength(4);

      const bnb = assets.find(a => a.asset === 'BNB');
      expect(bnb).toEqual({
        asset: 'BNB',
        crossWalletBalance: '1.5',
        price: '600.0',
        discount: '0.9500',
      });

      const btc = assets.find(a => a.asset === 'BTC');
      expect(btc).toEqual({
        asset: 'BTC',
        crossWalletBalance: '-0.02',
        price: '65000.0',
        discount: '0.9000',
      });
    });

    it('omits non-stable assets when assetIndex has no price', () => {
      const assets = buildAssetSnapshots(
        [
          { asset: 'USDT', crossWalletBalance: '10' },
          { asset: 'UNKNOWN_TOKEN', crossWalletBalance: '50' },
        ],
        true,
        []
      );

      expect(assets).toHaveLength(1);
      expect(assets[0].asset).toBe('USDT');
    });
  });

  describe('buildPositionSnapshots', () => {
    it('sorts active positions by notional descending and caps at 10', () => {
      const risks: any[] = [
        {
          symbol: 'XRPUSDT',
          positionAmt: '100',
          entryPrice: '0.5',
          markPrice: '0.5',
          notional: '50',
          marginType: 'cross',
        },
        {
          symbol: 'BTCUSDT',
          positionAmt: '1',
          entryPrice: '60000',
          markPrice: '60000',
          notional: '60000',
          marginType: 'cross',
        },
        {
          symbol: 'ETHUSDT',
          positionAmt: '10',
          entryPrice: '2000',
          markPrice: '2000',
          notional: '20000',
          marginType: 'isolated',
          isolatedWallet: '1000',
        },
        {
          symbol: 'SOLUSDT',
          positionAmt: '0', // zero position should be excluded
          entryPrice: '100',
          markPrice: '100',
          notional: '0',
          marginType: 'cross',
        },
      ];

      const acctPositions: any[] = [
        { symbol: 'BTCUSDT', maintMargin: '240', positionSide: 'BOTH' },
        { symbol: 'ETHUSDT', maintMargin: '80', positionSide: 'BOTH', isolatedWallet: '1000' },
        { symbol: 'XRPUSDT', maintMargin: '2.5', positionSide: 'BOTH' },
      ];

      const res = buildPositionSnapshots(risks, acctPositions);
      expect(res).toHaveLength(3);
      expect(res[0].symbol).toBe('BTCUSDT');
      expect(res[1].symbol).toBe('ETHUSDT');
      expect(res[2].symbol).toBe('XRPUSDT');

      // Check isolated position has isolatedWallet
      expect(res[1].marginType).toBe('isolated');
      expect(res[1].isolatedWallet).toBe('1000');

      // Check cross position does not require isolatedWallet
      expect(res[0].marginType).toBe('cross');
      expect(res[0].isolatedWallet).toBeUndefined();
    });

    it('returns empty array if no positions are open', () => {
      const res = buildPositionSnapshots([]);
      expect(res).toEqual([]);
    });
  });

  describe('filterMutedKeysForActivePositions', () => {
    it('drops muted keys for closed positions and keeps active ones', () => {
      const activePositions: any[] = [
        { symbol: 'BTCUSDT', positionAmt: '1', marginType: 'cross' },
        { symbol: 'ETHUSDT', positionAmt: '-2', marginType: 'isolated' },
      ];

      const savedMuted = [
        'cross',
        'iso:ETHUSDT:SHORT', // Active isolated short
        'iso:XRPUSDT:LONG', // Closed position, must be dropped
        'iso:BTCUSDT:LONG', // BTC is cross, not isolated, so drop
      ];

      const filtered = filterMutedKeysForActivePositions(savedMuted, activePositions);
      expect(filtered).toEqual(['cross', 'iso:ETHUSDT:SHORT']);
    });
  });

  describe('buildAlertSnapshotPayload', () => {
    it('creates standard valid payload', () => {
      const payload = buildAlertSnapshotPayload({
        fcmToken: 'test_token_12345678901234567890',
        wallet: '0x6AD7A4C1F113F65AF139831D7D78EAAC6B9A4EA0',
        accountInfo: {
          assets: [{ asset: 'USDT', crossWalletBalance: '100' }],
          positions: [{ symbol: 'BTCUSDT', maintMargin: '50' }],
        } as any,
        positionRisks: [
          {
            symbol: 'BTCUSDT',
            positionAmt: '0.1',
            entryPrice: '50000',
            markPrice: '51000',
            notional: '5100',
            marginType: 'cross',
          } as any,
        ],
        isMultiAsset: false,
        savedMutedKeys: ['cross'],
      });

      expect(payload.fcmToken).toBe('test_token_12345678901234567890');
      expect(payload.wallet).toBe('0x6ad7a4c1f113f65af139831d7d78eaac6b9a4ea0');
      expect(payload.platform).toBe('web');
      expect(payload.account.assets).toHaveLength(1);
      expect(payload.account.positions).toHaveLength(1);
      expect(payload.account.muted).toEqual(['cross']);
    });
  });
});
