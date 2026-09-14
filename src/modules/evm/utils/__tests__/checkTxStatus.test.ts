import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useWalletStore } from '../../../walletconnect/store/walletConnectStore';
import { checkTxStatus } from '../checkTxStatus';
import { rpcManager } from '../rpcProvider';

describe('checkTxStatus (RPC-based)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useWalletStore.setState({ network: 'mainnet' });
  });

  it('returns success and isConfirmed: true when transaction receipt status is 1', async () => {
    vi.spyOn(rpcManager, 'fetchWithFallback').mockResolvedValue({
      status: 1,
      blockNumber: 123456,
      hash: '0xa9440af3cc963212d34c10a1026d20ace1abbdf044c89895e78f9979a8f72637',
    } as any);

    const result = await checkTxStatus(
      '0xa9440af3cc963212d34c10a1026d20ace1abbdf044c89895e78f9979a8f72637',
      'ARB',
      'mainnet'
    );

    expect(result).toEqual({
      status: true,
      isConfirmed: true,
      message: 'success',
      chain: 'ARB',
      reqStatus: 'ok',
    });
  });

  it('returns failed and isConfirmed: true when transaction receipt status is 0 (reverted)', async () => {
    vi.spyOn(rpcManager, 'fetchWithFallback').mockResolvedValue({
      status: 0,
      blockNumber: 123456,
      hash: '0xa9440af3cc963212d34c10a1026d20ace1abbdf044c89895e78f9979a8f72637',
    } as any);

    const result = await checkTxStatus(
      '0xa9440af3cc963212d34c10a1026d20ace1abbdf044c89895e78f9979a8f72637',
      'ARB',
      'mainnet'
    );

    expect(result).toEqual({
      status: false,
      isConfirmed: true,
      message: 'failed',
      chain: 'ARB',
      reqStatus: 'failed',
    });
  });

  it('returns pending and isConfirmed: false when transaction receipt is null', async () => {
    vi.spyOn(rpcManager, 'fetchWithFallback').mockResolvedValue(null);

    const result = await checkTxStatus(
      '0xa9440af3cc963212d34c10a1026d20ace1abbdf044c89895e78f9979a8f72637',
      'ARB',
      'mainnet'
    );

    expect(result).toEqual({
      status: false,
      isConfirmed: false,
      message: 'pending',
      chain: 'ARB',
      reqStatus: 'pending',
    });
  });

  it('never calls blockscout or any external explorer API via fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    vi.spyOn(rpcManager, 'fetchWithFallback').mockResolvedValue({
      status: 1,
    } as any);

    await checkTxStatus(
      '0xa9440af3cc963212d34c10a1026d20ace1abbdf044c89895e78f9979a8f72637',
      'ARB'
    );

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
