import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AGENT_VALIDITY_MS,
  getStoredAgentExpiry,
  hasStoredAgentKey,
  isAgentKeyExpired,
  purgeAgentKey,
} from '../asterAgentKeyManager';

describe('asterAgentKeyManager (SEC-09)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('enforces 30-day agent validity conforming to Aster protocol', () => {
    expect(AGENT_VALIDITY_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('detects unexpired vs expired agent keys based on timestamp', () => {
    const now = Date.now();
    const futureExpiry = now + 1000 * 60 * 60;
    const pastExpiry = now - 1000 * 60;

    localStorage.setItem('_sx_aster_agentexp_mainnet', futureExpiry.toString());
    expect(getStoredAgentExpiry('mainnet')).toBe(futureExpiry);
    expect(isAgentKeyExpired('mainnet')).toBe(false);

    localStorage.setItem('_sx_aster_agentexp_mainnet', pastExpiry.toString());
    expect(isAgentKeyExpired('mainnet')).toBe(true);
  });

  it('auto-purges expired keys when hasStoredAgentKey is called', () => {
    const pastExpiry = Date.now() - 5000;
    localStorage.setItem('_sx_aster_agentkey_mainnet', '{"ciphertext":"abc","iv":"123"}');
    localStorage.setItem(
      '_sx_aster_agentaddr_mainnet',
      '0x1234567890123456789012345678901234567890'
    );
    localStorage.setItem('_sx_aster_agentexp_mainnet', pastExpiry.toString());

    const hasKey = hasStoredAgentKey('mainnet');
    expect(hasKey).toBe(false);
    expect(localStorage.getItem('_sx_aster_agentkey_mainnet')).toBeNull();
    expect(localStorage.getItem('_sx_aster_agentaddr_mainnet')).toBeNull();
    expect(localStorage.getItem('_sx_aster_agentexp_mainnet')).toBeNull();
  });

  it('purges all network keys and expiry keys cleanly', () => {
    localStorage.setItem('_sx_aster_agentkey_mainnet', 'blob1');
    localStorage.setItem('_sx_aster_agentaddr_mainnet', '0xabc');
    localStorage.setItem('_sx_aster_agentexp_mainnet', '123456');

    localStorage.setItem('_sx_aster_agentkey_testnet', 'blob2');
    localStorage.setItem('_sx_aster_agentaddr_testnet', '0xdef');
    localStorage.setItem('_sx_aster_agentexp_testnet', '654321');

    purgeAgentKey();

    expect(localStorage.getItem('_sx_aster_agentkey_mainnet')).toBeNull();
    expect(localStorage.getItem('_sx_aster_agentexp_mainnet')).toBeNull();
    expect(localStorage.getItem('_sx_aster_agentkey_testnet')).toBeNull();
    expect(localStorage.getItem('_sx_aster_agentexp_testnet')).toBeNull();
  });
});
