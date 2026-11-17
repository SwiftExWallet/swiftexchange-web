import * as FreighterApi from '@stellar/freighter-api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearAccessToken,
  getAccessToken,
  logoutServer,
  setAccessToken,
} from '../services/Siweauthservice';
import { clearAppData } from '../services/wallet/disconnect';
import { handleAccountsChanged } from '../services/wallet/eventListeners';
import { connectStellar } from '../services/wallet/stellarConnect';
import type { WalletServiceContext, WalletSession } from '../services/wallet/types';
import { createMockWalletServiceContext } from './walletConnectMockHelpers';

vi.mock('@stellar/freighter-api', () => ({
  isConnected: vi.fn().mockResolvedValue({ isConnected: false }),
  isAllowed: vi.fn().mockResolvedValue({ isAllowed: false }),
  requestAccess: vi
    .fn()
    .mockResolvedValue({ address: 'GBG422AFCVE5D2W7G6W3ZG4A5RILR54QPZMO3ILJIIZVUYJ5YCEWAHYH' }),
  getAddress: vi
    .fn()
    .mockResolvedValue({ address: 'GBG422AFCVE5D2W7G6W3ZG4A5RILR54QPZMO3ILJIIZVUYJ5YCEWAHYH' }),
  signTransaction: vi.fn().mockResolvedValue({ signedTxXdr: 'AAAA' }),
  signMessage: vi.fn().mockResolvedValue({ signedMessage: 'AAAA' }),
  getNetwork: vi.fn().mockResolvedValue('PUBLIC'),
  getNetworkDetails: vi
    .fn()
    .mockResolvedValue({
      network: 'PUBLIC',
      networkPassphrase: 'Public Global Stellar Network ; September 2015',
    }),
}));

describe('QA Phase 5 Verification Tests (Must fail before fix, pass after fix)', () => {
  let ctx: WalletServiceContext;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    const fixture = createMockWalletServiceContext('mainnet');
    ctx = fixture.ctx;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('TEST-FIX-01: logoutServer sends POST /auth/logout with token before clearing session', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));

    setAccessToken(
      { accessToken: 'valid-bearer-token-123', expiresAt: Date.now() + 3600_000 },
      '0x1111111111111111111111111111111111111111'
    );

    // Call logoutServer directly or via store logoutAuth
    await logoutServer('0x1111111111111111111111111111111111111111');

    const logoutCalls = fetchSpy.mock.calls.filter(call =>
      String(call[0]).includes('/auth/logout')
    );
    expect(logoutCalls.length).toBe(1);
    expect(logoutCalls[0][1]?.headers).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer valid-bearer-token-123',
      })
    );
  });

  it('TEST-FIX-02: handleAccountsChanged invokes ctx.onAccountChanged when address changes', () => {
    const session: WalletSession = {
      type: 'evm',
      walletId: 'metamask',
      evmAddress: '0xOldAddress00000000000000000000000000000001',
      evmChainId: 1,
    };
    ctx.sessions.set('evm', session);

    const onAccountChangedSpy = vi.fn();
    ctx.onAccountChanged = onAccountChangedSpy;

    handleAccountsChanged(ctx, 'evm', ['0xNewAddress00000000000000000000000000000002']);

    expect(onAccountChangedSpy).toHaveBeenCalledTimes(1);
    expect(onAccountChangedSpy).toHaveBeenCalledWith(
      'evm',
      '0xNewAddress00000000000000000000000000000002',
      '0xOldAddress00000000000000000000000000000001'
    );
  });

  it('TEST-FIX-03: Disconnecting one wallet in dual session preserves ACTIVE_ADDRESS_KEY for the remaining wallet', () => {
    const evmAddr = '0x1111111111111111111111111111111111111111';
    const stellarAddr = 'GBG422AFCVE5D2W7G6W3ZG4A5RILR54QPZMO3ILJIIZVUYJ5YCEWAHYH';

    setAccessToken({ accessToken: 'evm-token', expiresAt: Date.now() + 3600_000 }, evmAddr);
    setAccessToken({ accessToken: 'stellar-token', expiresAt: Date.now() + 3600_000 }, stellarAddr);

    // Disconnect Stellar
    clearAccessToken(stellarAddr);

    // EVM token must remain active and accessible
    const activeToken = getAccessToken();
    expect(activeToken).toBe('evm-token');
  });

  it('TEST-FIX-05: connectStellar throws error when Freighter is locked instead of falling back to WalletConnect QR', async () => {
    vi.mocked(FreighterApi.isConnected).mockResolvedValue({ isConnected: false } as any);

    // Should reject with the unlock message and NOT create a WalletConnect QR modal
    await expect(connectStellar(ctx, 'freighter')).rejects.toThrow(/unlock Freighter/i);
    expect(ctx.modals.get('stellar')).toBeUndefined();
  });

  it('TEST-FIX-06: clearAppData wipes all vendor prefixes from both localStorage and sessionStorage', async () => {
    localStorage.setItem('walletlink:addresses', '0x123');
    localStorage.setItem('-walletlink:session:id', 'abc');
    localStorage.setItem('@appkit/theme', 'dark');
    localStorage.setItem('WCM_MODAL_STATE', 'open');
    localStorage.setItem('W3M_ACTIVE', 'true');
    localStorage.setItem('WALLETCONNECT_DEEPLINK_CHOICE', 'metamask');
    localStorage.setItem('@StellarWalletsKit:selected', 'freighter');
    localStorage.setItem('freighter:allowed', 'true');
    localStorage.setItem('theme', 'dark');

    sessionStorage.setItem('WCM_TEMP', '1');
    sessionStorage.setItem('user_session', 'abc');

    await clearAppData();

    expect(localStorage.getItem('theme')).toBe('dark'); // Preserved
    expect(localStorage.getItem('walletlink:addresses')).toBeNull();
    expect(localStorage.getItem('-walletlink:session:id')).toBeNull();
    expect(localStorage.getItem('@appkit/theme')).toBeNull();
    expect(localStorage.getItem('WCM_MODAL_STATE')).toBeNull();
    expect(localStorage.getItem('W3M_ACTIVE')).toBeNull();
    expect(localStorage.getItem('WALLETCONNECT_DEEPLINK_CHOICE')).toBeNull();
    expect(localStorage.getItem('@StellarWalletsKit:selected')).toBeNull();
    expect(localStorage.getItem('freighter:allowed')).toBeNull();
    expect(sessionStorage.getItem('WCM_TEMP')).toBeNull();
  });
});
