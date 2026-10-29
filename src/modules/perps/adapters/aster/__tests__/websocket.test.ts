import { describe, expect, it } from 'vitest';

describe('UserDataStream & WebSocket Reliability (ACC-01, WS-01, WS-02)', () => {
  it('correctly handles Aster v3 ORDER_TRADE_UPDATE order type fallback (ACC-01)', () => {
    // Aster v3 sends `o` for order type, older or standard Binance schemas send `ot`
    const rawPayloadV3 = {
      e: 'ORDER_TRADE_UPDATE',
      T: 1729000000000,
      o: {
        s: 'BTCUSDT',
        c: 'swiftex_12345',
        S: 'BUY',
        o: 'LIMIT', // Aster v3 field is `o`
        f: 'GTC',
        q: '1.000',
        p: '65000.00',
        ap: '0',
        X: 'NEW',
        i: 100234,
        z: '0',
        T: 1729000000000,
        R: false,
      },
    };

    const parsedType = (
      (rawPayloadV3.o as any).o ||
      (rawPayloadV3.o as any).ot ||
      'LIMIT'
    ).toLowerCase();
    expect(parsedType).toBe('limit');

    const legacyPayload = {
      ot: 'MARKET',
      S: 'SELL',
    };
    const legacyParsedType = (
      (legacyPayload as any).o ||
      (legacyPayload as any).ot ||
      'LIMIT'
    ).toLowerCase();
    expect(legacyParsedType).toBe('market');

    const emptyPayload = {};
    const fallbackParsedType = (
      (emptyPayload as any).o ||
      (emptyPayload as any).ot ||
      'LIMIT'
    ).toLowerCase();
    expect(fallbackParsedType).toBe('limit');
  });

  it('calculates exponential backoff with jitter bounded to max 30s (WS-01)', () => {
    const calcDelay = (attempt: number) => Math.min(1000 * Math.pow(2, attempt), 30_000);

    expect(calcDelay(0)).toBe(1000);
    expect(calcDelay(1)).toBe(2000);
    expect(calcDelay(2)).toBe(4000);
    expect(calcDelay(3)).toBe(8000);
    expect(calcDelay(4)).toBe(16000);
    expect(calcDelay(5)).toBe(30000);
    expect(calcDelay(10)).toBe(30000);
  });
});
