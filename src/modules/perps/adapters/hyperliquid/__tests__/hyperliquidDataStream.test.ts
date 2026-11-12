import { describe, expect, it } from 'vitest';

import { mapHyperliquidPositions } from '../hooks/useHyperliquidDataStream';

describe('Hyperliquid Position & Balance Mapping (mapHyperliquidPositions)', () => {
  it('prunes closed positions with zero size (szi === "0" or 0)', () => {
    const rawAssetPositions = [
      {
        position: {
          coin: 'BTC',
          szi: '0.5',
          entryPx: '65000',
          liquidationPx: '52000',
          unrealizedPnl: '120.5',
          leverage: { type: 'cross', value: 10 },
          marginUsed: '3250',
        },
      },
      {
        position: {
          coin: 'ETH',
          szi: '0', // Closed position!
          entryPx: '3500',
          liquidationPx: null,
          unrealizedPnl: '0',
          leverage: { type: 'cross', value: 10 },
          marginUsed: '0',
        },
      },
      {
        position: {
          coin: 'SOL',
          szi: '-25', // Short position
          entryPx: '180',
          liquidationPx: '210',
          unrealizedPnl: '-50',
          leverage: { type: 'isolated', value: 5 },
          marginUsed: '900',
        },
      },
      {
        position: null, // Null position guard
      },
    ];

    const mapped = mapHyperliquidPositions(rawAssetPositions);

    // Only BTC (long) and SOL (short) should survive; ETH (0 size) must be pruned
    expect(mapped).toHaveLength(2);
    expect(mapped[0]?.symbol).toBe('BTC-USDC');
    expect(mapped[0]?.size).toBe('0.5');
    expect(mapped[1]?.symbol).toBe('SOL-USDC');
    expect(mapped[1]?.size).toBe('-25');
  });

  it('correctly binds live mark price from tickerStore asset context when available', () => {
    const rawAssetPositions = [
      {
        position: {
          coin: 'BTC',
          szi: '1.0',
          entryPx: '60000',
          liquidationPx: '45000',
          unrealizedPnl: '5000',
        },
      },
    ];

    const mockTickerState = {
      'BTC-USDC': {
        markPx: '65432.1',
        oraclePx: '65430',
        funding: '0.0001',
      },
    };

    const mapped = mapHyperliquidPositions(rawAssetPositions, mockTickerState);

    expect(mapped).toHaveLength(1);
    expect(mapped[0]?.entryPrice).toBe('60000');
    expect(mapped[0]?.markPrice).toBe('65432.1'); // Bound from mockTickerState!
  });

  it('falls back to entryPx when ticker store has no mark price for the market', () => {
    const rawAssetPositions = [
      {
        position: {
          coin: 'AVAX',
          szi: '10',
          entryPx: '28.5',
          liquidationPx: null,
        },
      },
    ];

    const mapped = mapHyperliquidPositions(rawAssetPositions, {});

    expect(mapped).toHaveLength(1);
    expect(mapped[0]?.markPrice).toBe('28.5'); // Fallback to entryPx
    expect(mapped[0]?.liquidationPrice).toBe('0'); // Handled null liquidationPx safely
  });

  it('handles empty or non-array assetPositions safely', () => {
    expect(mapHyperliquidPositions([])).toEqual([]);
    expect(mapHyperliquidPositions(null as any)).toEqual([]);
    expect(mapHyperliquidPositions(undefined as any)).toEqual([]);
  });
});
