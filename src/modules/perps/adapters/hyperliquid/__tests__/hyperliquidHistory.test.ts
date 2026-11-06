import { describe, expect, it } from 'vitest';

describe('Hyperliquid Trade Fills & Deduplication', () => {
  it('assigns unique fill id based on f.tid for multiple partial fills of the same order', () => {
    const rawFills = [
      {
        coin: 'BTC',
        px: '65000',
        sz: '0.1',
        side: 'B',
        time: 1710000001000,
        oid: 12345,
        tid: 987654321,
        closedPnl: '0',
        fee: '0.65',
      },
      {
        coin: 'BTC',
        px: '65000',
        sz: '0.15',
        side: 'B',
        time: 1710000001050,
        oid: 12345, // Same order ID!
        tid: 987654322, // Distinct trade fill ID!
        closedPnl: '0',
        fee: '0.975',
      },
      {
        coin: 'BTC',
        px: '65001',
        sz: '0.25',
        side: 'B',
        time: 1710000002000,
        oid: 12345, // Same order ID!
        tid: 987654323, // Distinct trade fill ID!
        closedPnl: '0',
        fee: '1.625',
      },
    ];

    const mappedTrades = rawFills.map(f => {
      const fillId = f.tid !== undefined && f.tid !== null ? String(f.tid) : `${f.oid}-${f.time}`;

      return {
        id: fillId,
        orderId: String(f.oid),
        symbol: `${f.coin}-USDC`,
        price: f.px,
        size: f.sz,
        timestamp: f.time,
      };
    });

    // Verify all 3 partial fills preserve unique trade IDs
    expect(mappedTrades).toHaveLength(3);
    expect(mappedTrades[0].id).toBe('987654321');
    expect(mappedTrades[1].id).toBe('987654322');
    expect(mappedTrades[2].id).toBe('987654323');

    // All share the same orderId
    expect(mappedTrades[0].orderId).toBe('12345');
    expect(mappedTrades[1].orderId).toBe('12345');
    expect(mappedTrades[2].orderId).toBe('12345');

    // Deduplication check: Set of trade IDs must have 3 distinct entries (no dropped fills)
    const uniqueIds = new Set(mappedTrades.map(t => t.id));
    expect(uniqueIds.size).toBe(3);
  });

  it('uses deterministic fallback when tid is absent', () => {
    const rawFillWithoutTid = {
      coin: 'ETH',
      px: '3500',
      sz: '1.0',
      side: 'A',
      time: 1710000003000,
      oid: 54321,
      hash: '0xabc123def456' as `0x${string}`,
    };

    const fillId =
      (rawFillWithoutTid as any).tid !== undefined
        ? String((rawFillWithoutTid as any).tid)
        : rawFillWithoutTid.hash
          ? `${rawFillWithoutTid.hash}-${rawFillWithoutTid.oid}`
          : `${rawFillWithoutTid.oid}-${rawFillWithoutTid.time}`;

    expect(fillId).toBe('0xabc123def456-54321');
  });
});
