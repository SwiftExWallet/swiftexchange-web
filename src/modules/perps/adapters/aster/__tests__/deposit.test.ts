import { describe, expect, it, vi } from 'vitest';

import {
  ASTER_TREASURY_ABI,
  DEFAULT_BROKER_ID,
  MAX_DEPOSIT_GAS_LIMIT,
  REQUIRED_CONFIRMATIONS,
  depositAssetOnChain,
} from '../api/deposit';

vi.mock('../../../../evm/utils/evmChainUtils', () => ({
  switchOrAddChain: vi.fn().mockResolvedValue(undefined),
}));

describe('Aster Deposit Integration (DEP-01, DEP-02, DEP-03)', () => {
  it('defines correct Aster Treasury constants and confirmation requirements', () => {
    expect(DEFAULT_BROKER_ID).toBe(1n);
    expect(MAX_DEPOSIT_GAS_LIMIT).toBe(500000n);
    expect(REQUIRED_CONFIRMATIONS[56]).toBe(3); // BSC requires 3 confirmations (SEC-10)
    expect(REQUIRED_CONFIRMATIONS[1]).toBe(2); // ETH requires 2
    expect(REQUIRED_CONFIRMATIONS[42161]).toBe(2); // Arbitrum requires 2
    expect(ASTER_TREASURY_ABI).toContain('function depositNative(uint256 broker) payable');
    expect(ASTER_TREASURY_ABI).toContain(
      'function deposit(address currency, uint256 amount, uint256 broker)'
    );
  });

  it('rejects invalid or non-positive deposit amounts with BigNumber validation', async () => {
    const fakeProvider = {};
    const asset = { name: 'BNB', isNative: true };

    await expect(depositAssetOnChain(fakeProvider, asset as any, '-1.5', 56)).rejects.toThrow(
      'Please enter a valid positive deposit amount.'
    );

    await expect(depositAssetOnChain(fakeProvider, asset as any, '0', 56)).rejects.toThrow(
      'Please enter a valid positive deposit amount.'
    );

    await expect(
      depositAssetOnChain(fakeProvider, asset as any, 'invalid_amount', 56)
    ).rejects.toThrow('Please enter a valid positive deposit amount.');
  });
});
