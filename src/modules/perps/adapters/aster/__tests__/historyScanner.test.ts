import type { Signer } from 'ethers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useMarketStore } from '../../../core/stores/marketStore';
import { useOrderStore } from '../../../core/stores/orderStore';
import { usePositionStore } from '../../../core/stores/positionStore';
import * as accountApi from '../api/account';
import { AsterBannedError } from '../client/errors';
import { asterRateLimiter } from '../client/rateLimiter';
import {
  buildTargetSymbolList,
  clearInMemoryHistory,
  discoverUserSymbols,
  getPersistedHistory,
  getPersistedTradedSymbols,
  persistHistory,
  persistTradedSymbols,
  scanHistoryQueue,
} from '../historyScanner';

describe('Aster History Scanner & Complete Discovery Suite', () => {
  const dummySigner = {} as Signer;
  const dummyUserAddr = '0x1111111111111111111111111111111111111111';

  beforeEach(() => {
    asterRateLimiter.reset();
    localStorage.clear();
    clearInMemoryHistory();
    usePositionStore.setState({ positions: {} });
    useOrderStore.setState({ orders: {} });
    useMarketStore.setState({ markets: {} });
    vi.restoreAllMocks();
  });

  afterEach(() => {
    asterRateLimiter.reset();
    localStorage.clear();
    clearInMemoryHistory();
    vi.restoreAllMocks();
  });

  it('Test 7a & 7b: User with trades across 40 different symbols discovers and returns all 40 symbols under rate budget', async () => {
    const symbolList = Array.from(
      { length: 40 },
      (_, i) => `SYM${String(i + 1).padStart(2, '0')}USDT`
    );

    vi.spyOn(accountApi, 'getIncomeHistory').mockResolvedValue(
      symbolList.map((sym, idx) => ({
        symbol: sym,
        incomeType: 'REALIZED_PNL',
        income: '10.5',
        asset: 'USDT',
        time: 1700000000000 + idx * 1000,
        tranId: idx + 1,
        tradeId: idx + 1,
      }))
    );

    const discovered = await discoverUserSymbols(dummySigner, dummyUserAddr);
    expect(discovered).toHaveLength(40);

    const targetSymbols = buildTargetSymbolList(discovered);
    expect(targetSymbols).toHaveLength(40);

    let totalCalls = 0;
    const fetchOrdersMock = vi.fn(async (sym: string) => {
      totalCalls++;
      asterRateLimiter.acquireWeight(5);
      return [
        {
          orderId: `order_${sym}`,
          symbol: sym,
          status: 'FILLED',
          price: '100',
          origQty: '1',
          executedQty: '1',
          time: 1700000000000,
        },
      ];
    });

    const progressUpdates: number[] = [];
    const allResults = await scanHistoryQueue(targetSymbols, fetchOrdersMock, {
      concurrency: 1,
      onProgress: prog => {
        progressUpdates.push(prog.scanned);
      },
    });

    expect(allResults).toHaveLength(40);
    const returnedSymbols = new Set(allResults.map((r: any) => r.symbol));
    expect(returnedSymbols.size).toBe(40);
    for (const sym of symbolList) {
      expect(returnedSymbols.has(sym)).toBe(true);
    }

    expect(totalCalls).toBe(40);
    expect(asterRateLimiter.getUsedWeightLastMinute()).toBe(200);
    expect(asterRateLimiter.getUsedWeightLastMinute()).toBeLessThan(600);
    expect(progressUpdates).toHaveLength(40);
    expect(progressUpdates[progressUpdates.length - 1]).toBe(40);
  });

  it('Test 7c: Ban mid-scan pauses and resumes correctly without duplicates or missing symbols', async () => {
    const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];
    let callIndex = 0;
    const pausedNotices: (string | null)[] = [];

    const fetchMock = vi.fn(async (sym: string) => {
      callIndex++;
      if (sym === 'SOLUSDT' && callIndex === 3) {
        const banUntil = Date.now() + 200;
        asterRateLimiter.recordBan(banUntil);
        throw new AsterBannedError(banUntil, 'IP banned until timestamp');
      }

      return [
        {
          id: `trade_${sym}`,
          symbol: sym,
          time: 1700000000000 + callIndex,
          price: '50',
          qty: '2',
        },
      ];
    });

    const allResults = await scanHistoryQueue(symbols, fetchMock, {
      concurrency: 1,
      onPauseNotice: notice => {
        pausedNotices.push(notice);
      },
    });

    expect(allResults).toHaveLength(5);
    const collectedSymbols = allResults.map((r: any) => r.symbol);
    expect(collectedSymbols).toEqual(['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT']);
    expect(new Set(collectedSymbols).size).toBe(5);

    expect(pausedNotices.some(n => typeof n === 'string' && n.startsWith('Paused until'))).toBe(
      true
    );
    expect(pausedNotices[pausedNotices.length - 1]).toBeNull();
  });

  it('Test 7d: A symbol delisted from the market list but present in income history is still included', async () => {
    useMarketStore.setState({
      markets: {
        'BTC-USDT': { symbol: 'BTC-USDT', baseAsset: 'BTC', quoteAsset: 'USDT' } as any,
        'ETH-USDT': { symbol: 'ETH-USDT', baseAsset: 'ETH', quoteAsset: 'USDT' } as any,
      },
    });

    vi.spyOn(accountApi, 'getIncomeHistory').mockResolvedValue([
      {
        symbol: 'OLDDELISTEDUSDT',
        incomeType: 'REALIZED_PNL',
        income: '50',
        asset: 'USDT',
        time: 1690000000000,
        tranId: 99,
        tradeId: 99,
      },
    ]);

    const discovered = await discoverUserSymbols(dummySigner, dummyUserAddr);
    expect(discovered).toContain('OLDDELISTEDUSDT');

    const targetSymbols = buildTargetSymbolList(discovered);
    expect(targetSymbols).toContain('OLDDELISTEDUSDT');

    const fetchMock = vi.fn(async (sym: string) => {
      if (sym === 'OLDDELISTEDUSDT') {
        return [{ id: 'delisted_1', symbol: 'OLDDELISTEDUSDT', price: '1', time: 1690000000000 }];
      }
      return [{ id: `active_${sym}`, symbol: sym, price: '10', time: 1700000000000 }];
    });

    const results = await scanHistoryQueue(targetSymbols, fetchMock, { concurrency: 1 });
    const hasDelisted = results.some((r: any) => r.symbol === 'OLDDELISTEDUSDT');
    expect(hasDelisted).toBe(true);
  });

  it('Test Persistence: Saves and loads discovered symbols and history cache correctly', () => {
    persistTradedSymbols(dummyUserAddr, ['BTCUSDT', 'AVAXUSDT']);
    const loadedSymbols = getPersistedTradedSymbols(dummyUserAddr);
    expect(loadedSymbols).toContain('BTCUSDT');
    expect(loadedSymbols).toContain('AVAXUSDT');

    const mockOrders = [{ orderId: '101', symbol: 'BTCUSDT', price: '60000', time: 1700000000000 }];
    persistHistory(dummyUserAddr, 'orders', mockOrders, 1700000000000);

    const loadedHistory = getPersistedHistory(dummyUserAddr, 'orders');
    expect(loadedHistory).not.toBeNull();
    expect(loadedHistory?.lastTimestamp).toBe(1700000000000);
    expect(loadedHistory?.data).toHaveLength(1);
    expect((loadedHistory?.data as any)[0].orderId).toBe('101');
  });
});
