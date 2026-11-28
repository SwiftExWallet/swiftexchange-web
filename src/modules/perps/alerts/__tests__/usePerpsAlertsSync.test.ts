import { act, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useWalletStore } from '../../../walletconnect/store/walletConnectStore';
import { useExchangeManager } from '../../core/ExchangeManager';
import { useAccountStore } from '../../core/stores/accountStore';
import { usePositionStore } from '../../core/stores/positionStore';
import { alertsApi } from '../api';
import { usePerpsAlertsSync } from '../usePerpsAlertsSync';

describe('usePerpsAlertsSync', () => {
  const mockWallet = '0x1111111111111111111111111111111111111111';
  const mockFcmToken = 'fcm_token_valid_12345678901234567890';

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(alertsApi, 'getHealth').mockResolvedValue({ ok: true });
    useExchangeManager.setState({ currentExchange: 'aster' });
    useWalletStore.setState({
      network: 'mainnet',
      connectedWallets: {
        evm: { address: mockWallet } as any,
      },
      session: null,
    });
    usePositionStore.setState({ positions: {} });
    useAccountStore.setState({ balances: {}, multiAssetsMargin: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('bypasses API sync completely when not connected via SwiftEx app (no fcmToken)', async () => {
    const postSnapshotSpy = vi.spyOn(alertsApi, 'postSnapshot').mockResolvedValue({ ok: true });

    // Non-SwiftEx session (e.g. MetaMask / Rabby without userDevice)
    useWalletStore.setState({
      connectedWallets: {
        evm: { address: mockWallet } as any,
      },
      session: {
        peer: {
          metadata: {
            name: 'MetaMask',
          },
        },
      } as any,
    });

    const { result } = renderHook(() => usePerpsAlertsSync());
    expect(result.current.isSwiftExConnected).toBe(false);

    await act(async () => {
      await result.current.syncSnapshot(true);
    });

    expect(postSnapshotSpy).not.toHaveBeenCalled();
  });

  it('bypasses API sync on testnet even when connected via SwiftEx app', async () => {
    const postSnapshotSpy = vi.spyOn(alertsApi, 'postSnapshot').mockResolvedValue({ ok: true });

    useWalletStore.setState({
      network: 'testnet',
      connectedWallets: {
        evm: { address: mockWallet } as any,
      },
      session: {
        peer: {
          metadata: {
            name: 'SwiftEx Mobile',
            userDevice: {
              fcmToken: mockFcmToken,
              model: 'iPhone 15 Pro',
            },
          },
        },
      } as any,
    });

    const { result } = renderHook(() => usePerpsAlertsSync());

    await act(async () => {
      await result.current.syncSnapshot(true);
    });

    expect(postSnapshotSpy).not.toHaveBeenCalled();
  });

  it('syncs snapshot when connected via SwiftEx app', async () => {
    const postSnapshotSpy = vi.spyOn(alertsApi, 'postSnapshot').mockResolvedValue({ ok: true });

    useWalletStore.setState({
      connectedWallets: {
        evm: { address: mockWallet } as any,
      },
      session: {
        peer: {
          metadata: {
            name: 'SwiftEx Mobile',
            userDevice: {
              fcmToken: mockFcmToken,
              model: 'iPhone 15 Pro',
            },
          },
        },
      } as any,
    });

    usePositionStore.setState({
      positions: {
        BTCUSDT: {
          symbol: 'BTCUSDT',
          size: '0.5',
          entryPrice: '60000',
          markPrice: '61000',
          marginType: 'cross',
        } as any,
      },
    });

    const { result } = renderHook(() => usePerpsAlertsSync());
    expect(result.current.isSwiftExConnected).toBe(true);

    await act(async () => {
      await result.current.syncSnapshot(true);
    });

    expect(postSnapshotSpy).toHaveBeenCalledTimes(1);
    const sentPayload = postSnapshotSpy.mock.calls[0][0];
    expect(sentPayload.fcmToken).toBe(mockFcmToken);
    expect(sentPayload.wallet).toBe(mockWallet.toLowerCase());
    expect(sentPayload.account.positions).toHaveLength(1);
    expect(sentPayload.account.positions[0].symbol).toBe('BTCUSDT');
  });

  it('sends empty positions list when all positions are closed on another platform', async () => {
    const postSnapshotSpy = vi.spyOn(alertsApi, 'postSnapshot').mockResolvedValue({ ok: true });

    useWalletStore.setState({
      connectedWallets: {
        evm: { address: mockWallet } as any,
      },
      session: {
        peer: {
          metadata: {
            name: 'SwiftEx Mobile',
            userDevice: {
              fcmToken: mockFcmToken,
            },
          },
        },
      } as any,
    });

    // Positions empty
    usePositionStore.setState({ positions: {} });

    const { result } = renderHook(() => usePerpsAlertsSync());

    await act(async () => {
      await result.current.syncSnapshot(true);
    });

    expect(postSnapshotSpy).toHaveBeenCalledTimes(1);
    const sentPayload = postSnapshotSpy.mock.calls[0][0];
    expect(sentPayload.account.positions).toEqual([]);
  });

  it('still sends snapshot even if health endpoint is down (non-blocking)', async () => {
    vi.spyOn(alertsApi, 'getHealth').mockResolvedValue({ ok: false, error: 'Stale prices (503)' });
    const postSnapshotSpy = vi.spyOn(alertsApi, 'postSnapshot').mockResolvedValue({ ok: true });

    useWalletStore.setState({
      connectedWallets: {
        evm: { address: mockWallet } as any,
      },
      session: {
        peer: {
          metadata: {
            name: 'SwiftEx Mobile',
            userDevice: {
              fcmToken: mockFcmToken,
            },
          },
        },
      } as any,
    });

    const { result } = renderHook(() => usePerpsAlertsSync());

    await act(async () => {
      await result.current.syncSnapshot(true);
    });

    // Health check is informational only — snapshot must still be sent
    expect(postSnapshotSpy).toHaveBeenCalledTimes(1);
  });
});
