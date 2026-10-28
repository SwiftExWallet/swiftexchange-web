import { describe, expect, it } from 'vitest';

import {
  buildSortedQueryString,
  buildTypedData,
  generateMonotonicNonce,
  getAsterDomain,
} from '../api/auth';

describe('Aster Authentication & Signing (AUTH-01, AUTH-02, AUTH-04)', () => {
  it('buildSortedQueryString sorts all keys in strict ASCII alphabetical order', () => {
    const params: Record<string, string> = {
      user: '0x123',
      signer: '0x456',
      nonce: '100',
      symbol: 'BTCUSDT',
      quantity: '0.5',
      price: '50000',
      timestamp: '1700000000000',
      recvWindow: '5000',
    };

    const sortedQs = buildSortedQueryString(params);
    const expected =
      'nonce=100&price=50000&quantity=0.5&recvWindow=5000&signer=0x456&symbol=BTCUSDT&timestamp=1700000000000&user=0x123';
    expect(sortedQs).toBe(expected);
  });

  it('generateMonotonicNonce produces strictly monotonic nonces', () => {
    const fixedTime = 1700000000123;
    const n1 = generateMonotonicNonce(fixedTime);
    const n2 = generateMonotonicNonce(fixedTime);
    const n3 = generateMonotonicNonce(fixedTime);

    expect(BigInt(n2)).toBe(BigInt(n1) + 1n);
    expect(BigInt(n3)).toBe(BigInt(n2) + 1n);
  });

  it('getAsterDomain conforms to Aster v3 EIP-712 specification', () => {
    const domain = getAsterDomain(1666);
    expect(domain.name).toBe('AsterSignTransaction');
    expect(domain.version).toBe('1');
    expect(domain.chainId).toBe(1666);
    expect(domain.verifyingContract).toBe('0x0000000000000000000000000000000000000000');
  });

  it('buildTypedData structures message correctly for EIP-712 signing', () => {
    const typedData = buildTypedData('a=1&b=2', 1666);
    expect(typedData.primaryType).toBe('Message');
    expect(typedData.message.msg).toBe('a=1&b=2');
  });
});
