import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ALERTS_BASE_URL, alertsApi } from '../api';
import type { SnapshotPayload } from '../types';

describe('alertsApi', () => {
  beforeEach(() => {
    alertsApi.resetRateLimit();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockPayload: SnapshotPayload = {
    fcmToken: 'test_token_12345678901234567890',
    wallet: '0x1234567890123456789012345678901234567890',
    platform: 'web',
    snapshotAt: Date.now(),
    account: {
      assets: [],
      positions: [],
    },
  };

  it('postSnapshot returns ok:true on 200 response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    } as any);

    const res = await alertsApi.postSnapshot(mockPayload);
    expect(res).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith(
      `${ALERTS_BASE_URL}/v1/snapshot`,
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  it('postSnapshot handles 429 and sets rateLimitUntil with backoff', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
    } as any);

    const res = await alertsApi.postSnapshot(mockPayload);
    expect(res).toBeNull();
    expect(alertsApi.isRateLimited()).toBe(true);

    // Subsequent calls while rate limited immediately return null without network request
    const secondCall = await alertsApi.postSnapshot(mockPayload);
    expect(secondCall).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('deleteDevice returns ok:true on 200 response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    } as any);

    const res = await alertsApi.deleteDevice({ fcmToken: 'test_token' });
    expect(res).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith(
      `${ALERTS_BASE_URL}/v1/device`,
      expect.objectContaining({
        method: 'DELETE',
        body: JSON.stringify({ fcmToken: 'test_token' }),
      })
    );
  });

  it('getHealth parses server health response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, symbols: 801, devices: 2 }),
    } as any);

    const res = await alertsApi.getHealth();
    expect(res?.ok).toBe(true);
    expect(res?.symbols).toBe(801);
  });
});
