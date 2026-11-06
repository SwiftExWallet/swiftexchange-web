import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getSignerOrigin, signerIframeBridge } from '../signerIframeBridge';

describe('SignerIframeBridge & IAsterSigner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('determines the correct signer origin', () => {
    const origin = getSignerOrigin();
    expect(origin).toBeDefined();
    expect(typeof origin).toBe('string');
  });

  it('declares isIsolated flag as true', () => {
    expect(signerIframeBridge.isIsolated).toBe(true);
  });

  it('implements getAddress, signAsterRequest and revokeKey methods', () => {
    expect(typeof signerIframeBridge.getAddress).toBe('function');
    expect(typeof signerIframeBridge.signAsterRequest).toBe('function');
    expect(typeof signerIframeBridge.revokeKey).toBe('function');
  });
});
