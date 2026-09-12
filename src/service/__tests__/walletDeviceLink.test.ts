import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  API_CONFIG,
  clearDeviceToken,
  getValidDeviceToken,
  onDeviceTokenChange,
  setDeviceToken,
} from '../apiConfig';
import {
  ensureWalletLinkedToDevice,
  isWalletLinkedToDevice,
  registerWalletToDevice,
} from '../apiService';

describe('Wallet to Device Token Linking', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('apiConfig token management', () => {
    it('sets, gets and clears device token', () => {
      expect(getValidDeviceToken()).toBeNull();

      setDeviceToken('test-device-token-123');
      expect(getValidDeviceToken()).toBe('test-device-token-123');
      expect(API_CONFIG.deviceToken).toBe('test-device-token-123');

      clearDeviceToken();
      expect(getValidDeviceToken()).toBeNull();
    });

    it('triggers onDeviceTokenChange listener when token is set', () => {
      const listener = vi.fn();
      const unsubscribe = onDeviceTokenChange(listener);

      setDeviceToken('token-abc');
      expect(listener).toHaveBeenCalledWith('token-abc');

      unsubscribe();
      setDeviceToken('token-def');
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('registerWalletToDevice & ensureWalletLinkedToDevice', () => {
    it('returns false when no token or wallet address is available', async () => {
      const res = await registerWalletToDevice('', '');
      expect(res).toBe(false);
    });

    it('successfully calls /wallet API with correct payload and headers', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      });
      global.fetch = mockFetch;

      const walletAddr = '0x1234567890123456789012345678901234567890';
      const deviceToken = 'mock-device-token-xyz';

      const success = await registerWalletToDevice(walletAddr, deviceToken);
      expect(success).toBe(true);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [calledUrl, calledOptions] = mockFetch.mock.calls[0];
      expect(calledUrl).toContain('/wallet');
      expect(calledOptions.method).toBe('POST');
      expect(calledOptions.headers).toMatchObject({
        'Content-Type': 'application/json',
        'x-auth-device-token': deviceToken,
      });

      const body = JSON.parse(calledOptions.body);
      expect(body).toEqual({
        addresses: {
          multi: walletAddr,
        },
        isPrimary: true,
      });

      expect(isWalletLinkedToDevice(walletAddr, deviceToken)).toBe(true);
    });

    it('deduplicates calls and caches linked status in memory and sessionStorage', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      });
      global.fetch = mockFetch;

      const walletAddr = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
      const deviceToken = 'mock-device-token-cached';

      // First call
      await ensureWalletLinkedToDevice(walletAddr, deviceToken);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second call with same token and wallet address should use cache and not hit network
      const cachedResult = await ensureWalletLinkedToDevice(walletAddr, deviceToken);
      expect(cachedResult).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('deduplicates concurrent in-flight requests', async () => {
      let resolveFetch: any;
      const fetchPromise = new Promise(resolve => {
        resolveFetch = resolve;
      });

      const mockFetch = vi.fn().mockReturnValue(
        fetchPromise.then(() => ({
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
        }))
      );
      global.fetch = mockFetch;

      const walletAddr = '0x9999999999999999999999999999999999999999';
      const deviceToken = 'concurrent-token-test';

      const p1 = registerWalletToDevice(walletAddr, deviceToken);
      const p2 = registerWalletToDevice(walletAddr, deviceToken);

      resolveFetch();

      const [res1, res2] = await Promise.all([p1, p2]);
      expect(res1).toBe(true);
      expect(res2).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});
