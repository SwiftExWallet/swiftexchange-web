import { Interface } from 'ethers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CCTP_MESSAGE_TRANSMITTER_V2,
  buildReceiveMessageTx,
  discoverUnclaimedCctpBurns,
  inspectCctpRecovery,
} from '../cctpRecoveryService';

const txInterface = new Interface([
  'function usedNonces(bytes32 nonce) view returns (uint256)',
  'function receiveMessage(bytes message, bytes attestation) returns (bool)',
]);

describe('cctpRecoveryService', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns BURN_FAILED when Stellar burn transaction failed on Horizon', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ successful: false }),
    }) as any;

    const res = await inspectCctpRecovery({
      network: 'testnet',
      sourceKind: 'STELLAR',
      txHash: 'abc123',
    });

    expect(res.phase).toBe('BURN_FAILED');
  });

  it('returns ATTESTATION_PENDING when Iris returns 404', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ successful: true }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
      }) as any;

    const res = await inspectCctpRecovery({
      network: 'testnet',
      sourceKind: 'STELLAR',
      txHash: 'abc123',
    });

    expect(res.phase).toBe('ATTESTATION_PENDING');
  });

  it('returns ALREADY_CLAIMED when destination EVM usedNonces is non-zero', async () => {
    const usedEncoded = txInterface.encodeFunctionResult('usedNonces', [1n]);
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ successful: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          messages: [
            {
              status: 'complete',
              message: '0x1234',
              attestation: '0x5678',
              decodedMessage: {
                nonce: '0x' + '11'.repeat(32),
                destinationDomain: 0,
                expirationBlock: '0',
                decodedMessageBody: { amount: '5000000' },
              },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ result: usedEncoded }),
      }) as any;

    const res = await inspectCctpRecovery({
      network: 'testnet',
      sourceKind: 'STELLAR',
      txHash: 'abc123',
    });

    expect(res.phase).toBe('ALREADY_CLAIMED');
  });

  it('returns EXPIRED_NEEDS_REATTEST when expirationBlock has passed', async () => {
    const unusedEncoded = txInterface.encodeFunctionResult('usedNonces', [0n]);
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ successful: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          messages: [
            {
              status: 'complete',
              message: '0x1234',
              attestation: '0x5678',
              decodedMessage: {
                nonce: '0x' + '22'.repeat(32),
                destinationDomain: 0,
                expirationBlock: '100',
              },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ result: unusedEncoded }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ result: '0xc8' }), // block 200 >= 100
      }) as any;

    const res = await inspectCctpRecovery({
      network: 'testnet',
      sourceKind: 'STELLAR',
      txHash: 'abc123',
    });

    expect(res.phase).toBe('EXPIRED_NEEDS_REATTEST');
  });

  it('returns CLAIMABLE_EVM and builds valid receiveMessage tx when unminted and unexpired', async () => {
    const unusedEncoded = txInterface.encodeFunctionResult('usedNonces', [0n]);
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ successful: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          messages: [
            {
              status: 'complete',
              message: '0x1234',
              attestation: '0x5678',
              decodedMessage: {
                nonce: '0x' + '33'.repeat(32),
                destinationDomain: 0,
                expirationBlock: '500',
                decodedMessageBody: { amount: '2500000' },
              },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ result: unusedEncoded }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ result: '0x64' }), // block 100 < 500
      }) as any;

    const res = await inspectCctpRecovery({
      network: 'testnet',
      sourceKind: 'STELLAR',
      txHash: 'abc123',
    });

    expect(res.phase).toBe('CLAIMABLE_EVM');
    expect(res.destinationChainId).toBe(11155111);
    expect(res.amountUsdc).toBe('2.50');

    const tx = buildReceiveMessageTx({
      network: 'testnet',
      message: res.message!,
      attestation: res.attestation!,
    });
    expect(tx.to).toBe(CCTP_MESSAGE_TRANSMITTER_V2.testnet);
    expect(tx.data.startsWith('0x')).toBe(true);
  });

  it('discoverUnclaimedCctpBurns ignores non-CCTP Horizon txs and returns only unminted burns', async () => {
    localStorage.clear();
    const unusedEncoded = txInterface.encodeFunctionResult('usedNonces', [0n]);

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/accounts/GSTAR/transactions')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            _embedded: {
              records: [
                { successful: true, hash: 'regular_xlm_tx' },
                { successful: true, hash: 'cctp_burn_tx' },
              ],
            },
          }),
        };
      }
      if (url.includes('/transactions/regular_xlm_tx')) {
        return { ok: true, status: 200, json: async () => ({ successful: true }) };
      }
      if (url.includes('/transactions/cctp_burn_tx')) {
        return { ok: true, status: 200, json: async () => ({ successful: true }) };
      }
      if (url.includes('transactionHash=regular_xlm_tx')) {
        return { ok: false, status: 404 };
      }
      if (url.includes('transactionHash=cctp_burn_tx')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            messages: [
              {
                status: 'complete',
                message: '0x1234',
                attestation: '0x5678',
                decodedMessage: {
                  nonce: '0x' + '44'.repeat(32),
                  destinationDomain: 0,
                  expirationBlock: '0',
                  decodedMessageBody: { amount: '7000000' },
                },
              },
            ],
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ result: unusedEncoded }),
      };
    }) as any;

    const found = await discoverUnclaimedCctpBurns({
      network: 'testnet',
      stellarAddress: 'GSTAR',
    });

    expect(found).toHaveLength(1);
    expect(found[0].txHash).toBe('cctp_burn_tx');
    expect(found[0].phase).toBe('CLAIMABLE_EVM');
    expect(found[0].amountUsdc).toBe('7.00');
  });
});
