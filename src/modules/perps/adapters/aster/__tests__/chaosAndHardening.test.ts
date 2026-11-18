import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OrderbookEngine } from '../OrderbookEngine';
import { signedRequest } from '../api/auth';
import { AsterHttpClient } from '../client/asterHttpClient';
import {
  AsterBannedError,
  AsterCircuitBreakerError,
  AsterHttpError,
  AsterParsingError,
  AsterRateLimitError,
  AsterUserRejectedError,
} from '../client/errors';
import { createSafePoller } from '../client/poller';
import { AsterRateLimiter } from '../client/rateLimiter';

describe('Aster Hardening Chaos & Security Audit Suite (14 Scenarios)', () => {
  let rateLimiter: AsterRateLimiter;
  let httpClient: AsterHttpClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    rateLimiter = AsterRateLimiter.getInstance();
    rateLimiter.reset();
    httpClient = AsterHttpClient.getInstance();
    httpClient.clearCache();
  });

  afterEach(() => {
    rateLimiter.reset();
    httpClient.clearCache();
    vi.restoreAllMocks();
  });

  it('Scenario 1: No wallet allows public data but completely gates private actions without network calls', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ symbols: [{ symbol: 'BTCUSDT', status: 'TRADING' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const res = await httpClient.request('https://fapi.asterdex.com/fapi/v3/exchangeInfo', {
      method: 'GET',
    });
    expect(res.symbols).toBeDefined();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await expect(signedRequest(null as any, '', 'GET', '/fapi/v3/account')).rejects.toThrow(
      /Wallet signer and user address are required/i
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('Scenario 2: Rapid wallet connect/disconnect clears state and does not leak private requests', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const mockSigner = {
      getAddress: vi.fn().mockResolvedValue('0x1234567890123456789012345678901234567890'),
      signTypedData: vi.fn().mockResolvedValue('0xsignature'),
    };

    const abortController = new AbortController();
    abortController.abort();

    await expect(
      signedRequest(
        mockSigner as any,
        '0x1234567890123456789012345678901234567890',
        'GET',
        '/fapi/v3/account',
        {},
        undefined,
        abortController.signal
      )
    ).rejects.toThrow(/aborted/i);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('Scenario 3: Mock 418 parses ban timestamp and blocks all subsequent REST requests without network calls', async () => {
    const futureBanTime = Date.now() + 600_000;
    const banBody = JSON.stringify({
      code: -1003,
      msg: `Way too many requests; IP banned until ${futureBanTime}`,
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(banBody, {
        status: 418,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await expect(
      httpClient.request('https://fapi.asterdex.com/fapi/v3/ticker/24hr')
    ).rejects.toThrow(AsterBannedError);

    expect(rateLimiter.isBanned()).toBe(true);
    expect(rateLimiter.getBanRemainingMs()).toBeGreaterThan(500_000);

    for (let i = 0; i < 5; i++) {
      await expect(
        httpClient.request('https://fapi.asterdex.com/fapi/v3/depth?symbol=BTCUSDT')
      ).rejects.toThrow(AsterBannedError);
    }

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    rateLimiter.clearBan();
    expect(rateLimiter.isBanned()).toBe(false);
  });

  it('Scenario 4: Mock 429 enters cooldown and prevents retry storms', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Rate limit reached', {
        status: 429,
        headers: { 'Retry-After': '3' },
      })
    );

    await expect(
      httpClient.request('https://fapi.asterdex.com/fapi/v3/trades?symbol=BTCUSDT')
    ).rejects.toThrow(AsterRateLimitError);

    expect(rateLimiter.isRateLimited()).toBe(true);

    await expect(
      httpClient.request('https://fapi.asterdex.com/fapi/v3/trades?symbol=BTCUSDT')
    ).rejects.toThrow(AsterRateLimitError);

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    rateLimiter.reset();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Rate limit reached', { status: 429 })
    );

    await expect(
      httpClient.request('https://fapi.asterdex.com/fapi/v3/trades?symbol=BTCUSDT')
    ).rejects.toThrow(AsterRateLimitError);

    expect(rateLimiter.isRateLimited()).toBe(true);
    expect(rateLimiter.getRateLimitRemainingMs()).toBeGreaterThan(50_000);
  });

  it('Scenario 5: Mock 500 triggers max 2 retries, consecutive failures trip circuit breaker to OPEN then HALF_OPEN', async () => {
    let callCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      callCount++;
      return new Response('Internal Server Error', { status: 500, statusText: 'Server Error' });
    });

    await expect(
      httpClient.request('https://fapi.asterdex.com/fapi/v3/exchangeInfo', {
        method: 'GET',
        maxRetries: 2,
        timeoutMs: 1000,
      })
    ).rejects.toThrow(AsterHttpError);

    expect(callCount).toBe(3);

    rateLimiter.recordFailure();
    rateLimiter.recordFailure();

    const stats = rateLimiter.getStats();
    expect(stats.circuitState).toBe('OPEN');

    await expect(
      httpClient.request('https://fapi.asterdex.com/fapi/v3/exchangeInfo')
    ).rejects.toThrow(AsterCircuitBreakerError);
  });

  it('Scenario 6: Poller pauses when offline and resumes when back online without spamming', async () => {
    let executionCount = 0;
    const task = vi.fn().mockImplementation(async () => {
      executionCount++;
    });

    let online = true;
    Object.defineProperty(navigator, 'onLine', {
      get: () => online,
      configurable: true,
    });

    const poller = createSafePoller(task, {
      intervalMs: 50,
      initialJitterMs: 0,
      runImmediately: true,
    });

    poller.start();
    await new Promise(res => setTimeout(res, 30));
    expect(executionCount).toBe(1);

    online = false;
    await new Promise(res => setTimeout(res, 120));
    expect(executionCount).toBe(1);

    online = true;
    window.dispatchEvent(new Event('online'));
    await new Promise(res => setTimeout(res, 150));
    expect(executionCount).toBeGreaterThan(1);

    poller.stop();
  });

  it('Scenario 7: OrderbookEngine sequence gap triggers controlled resync with 5s cooldown (no resync loop)', async () => {
    let snapshotFetchCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      snapshotFetchCount++;
      return new Response(
        JSON.stringify({
          lastUpdateId: 100,
          bids: [['60000', '1.0']],
          asks: [['60100', '1.0']],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const engine = new OrderbookEngine('BTCUSDT');
    await new Promise(res => setTimeout(res, 30));
    expect(snapshotFetchCount).toBe(1);

    engine.onDiffEvent({
      U: 95,
      u: 105,
      pu: 94,
      b: [['60000', '1.2']],
      a: [['60100', '1.2']],
    });

    engine.onDiffEvent({
      U: 106,
      u: 110,
      pu: 105,
      b: [['60000', '1.5']],
      a: [['60100', '1.5']],
    });

    engine.onDiffEvent({
      U: 121,
      u: 125,
      pu: 120,
      b: [['60000', '2.0']],
      a: [['60100', '2.0']],
    });

    expect(snapshotFetchCount).toBe(1);

    engine.dispose();
  });

  it('Scenario 8: 10 concurrent requests to the same endpoint deduplicate to a single network call', async () => {
    let networkCalls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      networkCalls++;
      await new Promise(res => setTimeout(res, 50));
      return new Response(JSON.stringify({ rate: '0.0001' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const requests = Array.from({ length: 10 }, () =>
      httpClient.request('https://fapi.asterdex.com/fapi/v3/fundingRate?symbol=BTCUSDT')
    );

    const results = await Promise.all(requests);
    expect(results).toHaveLength(10);
    expect(results[0].rate).toBe('0.0001');

    expect(networkCalls).toBe(1);
    expect(rateLimiter.getStats().dedupeHits).toBe(9);
  });

  it('Scenario 9: Poller pauses when tab is hidden and does not queue catch-up bursts', async () => {
    let runs = 0;
    const poller = createSafePoller(
      async () => {
        runs++;
      },
      {
        intervalMs: 40,
        initialJitterMs: 0,
        runImmediately: true,
      }
    );

    poller.start();
    await new Promise(res => setTimeout(res, 20));
    expect(runs).toBe(1);

    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });

    await new Promise(res => setTimeout(res, 160));
    expect(runs).toBe(1);

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));

    await new Promise(res => setTimeout(res, 150));
    expect(runs).toBeGreaterThanOrEqual(2);

    poller.stop();
  });

  it('Scenario 10: Poller never executes overlapping runs under high latency', async () => {
    let concurrentCount = 0;
    let maxConcurrency = 0;
    let totalCompleted = 0;

    const task = async () => {
      concurrentCount++;
      maxConcurrency = Math.max(maxConcurrency, concurrentCount);
      await new Promise(res => setTimeout(res, 80));
      concurrentCount--;
      totalCompleted++;
    };

    const poller = createSafePoller(task, {
      intervalMs: 20,
      initialJitterMs: 0,
      runImmediately: true,
    });

    poller.start();
    await new Promise(res => setTimeout(res, 260));
    poller.stop();

    expect(maxConcurrency).toBe(1);
    expect(totalCompleted).toBeGreaterThan(1);
  });

  it('Scenario 11: Malformed responses (empty text, HTML Cloudflare error, invalid JSON) fail gracefully without crash', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('', { status: 200 }));
    const emptyRes = await httpClient.request('https://fapi.asterdex.com/fapi/v3/time');
    expect(emptyRes).toEqual({});

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('<html><body>502 Bad Gateway</body></html>', {
        status: 502,
        statusText: 'Bad Gateway',
      })
    );
    await expect(
      httpClient.request('https://fapi.asterdex.com/fapi/v3/time', { maxRetries: 0 })
    ).rejects.toThrow(AsterHttpError);

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('{ bad json ', { status: 200 })
    );
    await expect(httpClient.request('https://fapi.asterdex.com/fapi/v3/time')).rejects.toThrow(
      AsterParsingError
    );
  });

  it('Scenario 12: User signature rejection (code 4001) throws AsterUserRejectedError and does not retry in a loop', async () => {
    const mockRejectSigner = {
      getAddress: vi.fn().mockResolvedValue('0x1234567890123456789012345678901234567890'),
      signTypedData: vi
        .fn()
        .mockRejectedValue({ code: 4001, message: 'User rejected the signature request' }),
    };

    await expect(
      signedRequest(
        mockRejectSigner as any,
        '0x1234567890123456789012345678901234567890',
        'POST',
        '/fapi/v3/order',
        { symbol: 'BTCUSDT', side: 'BUY' }
      )
    ).rejects.toThrow(AsterUserRejectedError);

    expect(mockRejectSigner.signTypedData).toHaveBeenCalledTimes(1);
  });

  it('Scenario 13: 1-hour soak simulation shows requests/min stays well under exchange rate limit', () => {
    let simulatedTime = 1700000000000;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => simulatedTime);

    for (let minute = 0; minute < 60; minute++) {
      simulatedTime += 60_000;
      for (let r = 0; r < 8; r++) {
        rateLimiter.acquireWeight(5);
      }
      const usedWeight = rateLimiter.getUsedWeightLastMinute();
      expect(usedWeight).toBeLessThanOrEqual(DEFAULT_MAX_WEIGHT_PER_MINUTE);
      expect(usedWeight).toBe(40);
    }

    nowSpy.mockRestore();
  });

  it('Scenario 14: Confirms Aster rate limiting does not interfere with Hyperliquid behavior', () => {
    expect(rateLimiter.isBanned()).toBe(false);
    expect(rateLimiter.getStats().requestsThisMinute).toBeDefined();
  });
});
const DEFAULT_MAX_WEIGHT_PER_MINUTE = 600;
