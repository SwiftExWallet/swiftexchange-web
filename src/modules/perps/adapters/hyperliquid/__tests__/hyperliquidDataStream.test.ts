import { describe, expect, it } from 'vitest';

import { mapHyperliquidBalances, mapHyperliquidPositions } from '../hooks/useHyperliquidDataStream';

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

describe('Hyperliquid Balance Mapping (mapHyperliquidBalances)', () => {
  it('correctly maps unified account balance where USDC resides in spotClearinghouseState', () => {
    const clearinghouseState = {
      marginSummary: {
        accountValue: '0.0',
        totalNtlPos: '0.0',
        totalRawUsd: '0.0',
        totalMarginUsed: '0.0',
      },
      crossMarginSummary: {
        accountValue: '0.0',
        totalNtlPos: '0.0',
        totalRawUsd: '0.0',
        totalMarginUsed: '0.0',
      },
      withdrawable: '0.0',
      assetPositions: [],
    };

    const spotState = {
      balances: [
        {
          coin: 'USDC',
          token: 0,
          total: '1185.965798',
          hold: '0.0',
          entryNtl: '0.0',
        },
      ],
      tokenToAvailableAfterMaintenance: [[0, '1185.965798']],
    };

    const { balances, summary } = mapHyperliquidBalances(clearinghouseState, spotState);

    expect(balances).toHaveLength(1);
    expect(balances[0]?.asset).toBe('USDC');
    expect(balances[0]?.total).toBe('1185.97');
    expect(balances[0]?.available).toBe('1185.97');
    expect(balances[0]?.locked).toBe('0.00');
    expect(balances[0]?.marginBalance).toBe('1185.97');
    expect(balances[0]?.unrealizedPnl).toBe('0.00');

    expect(summary.totalWalletBalance).toBe('1185.97');
    expect(summary.totalMarginBalance).toBe('1185.97');
    expect(summary.availableBalance).toBe('1185.97');
    expect(summary.totalUnrealizedProfit).toBe('0.00');
  });

  it('aggregates perpetual margin and spot balances when both contain funds', () => {
    const clearinghouseState = {
      marginSummary: {
        accountValue: '600.0',
        totalNtlPos: '5000.0',
        totalRawUsd: '550.0',
        totalMarginUsed: '250.0',
      },
      withdrawable: '350.0',
    };

    const spotState = {
      balances: [
        {
          coin: 'USDC',
          token: 0,
          total: '400.0',
          hold: '50.0',
        },
        {
          coin: 'PURR',
          token: 1,
          total: '1000.0',
          hold: '0.0',
        },
      ],
    };

    const { balances, summary } = mapHyperliquidBalances(clearinghouseState, spotState);

    expect(balances).toHaveLength(2);
    const usdc = balances.find(b => b.asset === 'USDC');
    const purr = balances.find(b => b.asset === 'PURR');

    expect(usdc).toBeDefined();
    expect(usdc?.total).toBe('950.00');
    expect(usdc?.available).toBe('700.00');
    expect(usdc?.locked).toBe('300.00');
    expect(usdc?.marginBalance).toBe('1000.00');
    expect(usdc?.unrealizedPnl).toBe('50.00');

    expect(purr).toBeDefined();
    expect(purr?.total).toBe('1000.0');
    expect(purr?.available).toBe('1000.0000');

    expect(summary.totalWalletBalance).toBe('950.00');
    expect(summary.totalMarginBalance).toBe('1000.00');
    expect(summary.availableBalance).toBe('700.00');
    expect(summary.totalUnrealizedProfit).toBe('50.00');
  });

  it('handles null and undefined states safely without crashing', () => {
    const { balances, summary } = mapHyperliquidBalances(null, null);

    expect(balances).toHaveLength(1);
    expect(balances[0]?.asset).toBe('USDC');
    expect(balances[0]?.total).toBe('0.00');
    expect(balances[0]?.available).toBe('0.00');
    expect(summary.totalWalletBalance).toBe('0.00');
  });
});
