import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getAccountInfo, getDepositWithdrawHistory } from '../../../adapters/aster/api/account';
import {
  startTransactionPolling,
  stopDepositPolling,
  useDepositTrackerStore,
} from '../depositTrackerStore';

vi.mock('../../../adapters/aster/api/account', () => ({
  getAccountInfo: vi.fn(),
  getDepositWithdrawHistory: vi.fn(),
}));

vi.mock('../../../../../store/notificationStore', () => ({
  useNotificationStore: {
    getState: () => ({
      showToast: vi.fn(),
    }),
  },
}));

describe('transactionPolling background poller', () => {
  const mockSigner: any = {};
  const userAddr = '0x1234567890123456789012345678901234567890';

  beforeEach(() => {
    stopDepositPolling();
    vi.clearAllMocks();
    useDepositTrackerStore.setState({
      activeTransaction: null,
      pendingDeposits: [],
      pendingWithdrawals: [],
    });

    (getAccountInfo as any).mockResolvedValue({
      assets: [
        {
          asset: 'USDT',
          walletBalance: '500',
          availableBalance: '500',
          crossWalletBalance: '500',
        },
      ],
    });
  });

  it('confirms pending deposit and updates activeTransaction to SUCCESS when indexer registers it', async () => {
    const txHash = '0xabcdef123456789';
    useDepositTrackerStore.setState({
      pendingDeposits: [
        {
          id: 'dep-1',
          txHash,
          asset: 'USDT',
          amount: '100',
          chainId: 97,
          chainName: 'BSC Testnet',
          explorerUrl: '',
          timestamp: Date.now(),
          status: 'INDEXING',
        },
      ],
      activeTransaction: {
        id: 'dep-1',
        type: 'DEPOSIT',
        step: 'CONFIRMING',
        asset: 'USDT',
        amount: '100',
        chainId: 97,
        chainName: 'BSC Testnet',
        txHash,
        timestamp: Date.now(),
      },
    });

    (getDepositWithdrawHistory as any).mockResolvedValue([
      {
        txHash,
        asset: 'USDT',
        amount: '100',
        state: 'SUCCESS',
      },
    ]);

    startTransactionPolling(mockSigner, userAddr);

    await new Promise(resolve => setTimeout(resolve, 50));

    const state = useDepositTrackerStore.getState();
    expect(state.pendingDeposits[0].status).toBe('CONFIRMED');
    expect(state.activeTransaction?.step).toBe('SUCCESS');
    expect(state.activeTransaction?.message).toContain('credited to your Aster account');
  });

  it('confirms pending withdrawal and updates activeTransaction to SUCCESS upon completion', async () => {
    const withId = 'with-test-1';
    useDepositTrackerStore.setState({
      pendingWithdrawals: [
        {
          id: withId,
          asset: 'USDC',
          amount: '50',
          chainId: 42161,
          chainName: 'Arbitrum',
          destination: '0x999',
          timestamp: Date.now(),
          status: 'PROCESSING',
        },
      ],
      activeTransaction: {
        id: withId,
        type: 'WITHDRAW',
        step: 'CONFIRMING',
        asset: 'USDC',
        amount: '50',
        chainId: 42161,
        chainName: 'Arbitrum',
        timestamp: Date.now(),
      },
    });

    (getDepositWithdrawHistory as any).mockResolvedValue([
      {
        asset: 'USDC',
        amount: '50',
        state: 'SUCCESS',
      },
    ]);

    startTransactionPolling(mockSigner, userAddr);

    await new Promise(resolve => setTimeout(resolve, 50));

    const state = useDepositTrackerStore.getState();
    expect(state.pendingWithdrawals[0].status).toBe('CONFIRMED');
    expect(state.activeTransaction?.step).toBe('SUCCESS');
    expect(state.activeTransaction?.message).toContain('dispatched successfully');
  });

  it('updates pending withdrawal and activeTransaction to FAILED if backend rejects withdrawal', async () => {
    const withId = 'with-fail-1';
    useDepositTrackerStore.setState({
      pendingWithdrawals: [
        {
          id: withId,
          asset: 'USDC',
          amount: '50',
          chainId: 42161,
          chainName: 'Arbitrum',
          destination: '0x999',
          timestamp: Date.now(),
          status: 'PROCESSING',
        },
      ],
      activeTransaction: {
        id: withId,
        type: 'WITHDRAW',
        step: 'CONFIRMING',
        asset: 'USDC',
        amount: '50',
        chainId: 42161,
        chainName: 'Arbitrum',
        timestamp: Date.now(),
      },
    });

    (getDepositWithdrawHistory as any).mockResolvedValue([
      {
        asset: 'USDC',
        amount: '50',
        state: 'REJECTED',
      },
    ]);

    startTransactionPolling(mockSigner, userAddr);

    await new Promise(resolve => setTimeout(resolve, 50));

    const state = useDepositTrackerStore.getState();
    expect(state.pendingWithdrawals[0].status).toBe('FAILED');
    expect(state.activeTransaction?.step).toBe('FAILED');
    expect(state.activeTransaction?.message).toContain('rejected or failed');
  });
});
