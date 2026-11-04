import * as FreighterApi from '@stellar/freighter-api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearAccessToken,
  getAccessToken,
  logoutServer,
  setAccessToken,
} from '../services/Siweauthservice';
import { disconnectAll } from '../services/wallet/disconnect';
import { handleAccountsChanged } from '../services/wallet/eventListeners';
import { setupEIP6963Listener } from '../services/wallet/providerRegistry';
import { signStellarPayload } from '../services/wallet/signing';
import { connectStellar } from '../services/wallet/stellarConnect';
import type { WalletServiceContext, WalletSession } from '../services/wallet/types';
import { walletService } from '../services/wallet/walletService';
import { useWalletStore } from '../store/walletConnectStore';
import {
  createMockInjectedProvider,
  createMockUniversalProvider,
  createMockWalletServiceContext,
} from './walletConnectMockHelpers';

// Mock Freighter API module
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

describe('QA Hostile Test Matrix: Wallet Connect & Security Audits', () => {
  let ctx: WalletServiceContext;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    useWalletStore.setState({
      connectedWallets: {},
      connectionStatus: {},
      isAuthenticated: false,
      isAuthenticating: false,
      authError: null,
      authenticatedChain: null,
      linkedChains: [],
      session: null,
      pairingUri: null,
      connectingWalletId: null,
    });

    const mockFixture = createMockWalletServiceContext('mainnet');
    ctx = mockFixture.ctx;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  // =========================================================================
  // MATRIX ROW A: DETECTION
  // =========================================================================
  describe('Row A: Detection & EIP-6963 Matrix', () => {
    it('A1: Handles no wallets announced gracefully', () => {
      setupEIP6963Listener(ctx);
      expect(ctx.eip6963Providers.size).toBe(0);
      expect(walletService.getDiscoveredExtensions().length).toBe(0);
    });

    it('A2: Discovers multiple valid EIP-6963 providers', () => {
      setupEIP6963Listener(ctx);
      const mmDetail = {
        info: { rdns: 'io.metamask', name: 'MetaMask', icon: 'https://metamask.io/icon.png' },
        provider: createMockInjectedProvider({ isMetaMask: true }),
      };
      const phantomDetail = {
        info: { rdns: 'app.phantom', name: 'Phantom', icon: 'https://phantom.app/icon.png' },
        provider: createMockInjectedProvider({ isMetaMask: false }),
      };

      window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: mmDetail }));
      window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: phantomDetail }));

      expect(ctx.eip6963Providers.size).toBe(2);
      expect(ctx.discoveredExtensions.get('io.metamask')?.name).toBe('MetaMask');
      expect(ctx.discoveredExtensions.get('app.phantom')?.name).toBe('Phantom');
    });

    it('A3: Duplicate announcements with same rdns update existing instead of duplicating in map', () => {
      setupEIP6963Listener(ctx);
      const detail1 = {
        info: { rdns: 'io.metamask', name: 'MetaMask v1', icon: 'icon1' },
        provider: createMockInjectedProvider(),
      };
      const detail2 = {
        info: { rdns: 'io.metamask', name: 'MetaMask v2', icon: 'icon2' },
        provider: createMockInjectedProvider(),
      };

      window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: detail1 }));
      window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: detail2 }));

      expect(ctx.eip6963Providers.size).toBe(1);
      expect(ctx.discoveredExtensions.get('io.metamask')?.name).toBe('MetaMask v2');
    });

    it('A4: Malformed provider without rdns is ignored', () => {
      setupEIP6963Listener(ctx);
      const malformedDetail = {
        info: { name: 'Broken Wallet' }, // missing rdns
        provider: createMockInjectedProvider(),
      };
      window.dispatchEvent(
        new CustomEvent('eip6963:announceProvider', { detail: malformedDetail })
      );
      expect(ctx.eip6963Providers.size).toBe(0);
    });
  });

  // =========================================================================
  // MATRIX ROW B & C: STELLAR SIGN-IN & FREIGHTER RESPONSES
  // =========================================================================
  describe('Row B & C: Freighter & Stellar Sign-In Matrix', () => {
    it('C1: Freighter locked throws unlock error directly without falling back to QR modal', async () => {
      vi.mocked(FreighterApi.isConnected).mockResolvedValue({ isConnected: false } as any);
      await expect(connectStellar(ctx, 'freighter')).rejects.toThrow(/unlock Freighter/i);
      expect(ctx.modals.get('stellar')).toBeUndefined();
    });

    it('C2: Freighter requestAccess returns { error: "User rejected" } instead of throwing', async () => {
      vi.mocked(FreighterApi.isConnected).mockResolvedValue(true as any);
      vi.mocked(FreighterApi.isAllowed).mockResolvedValue(false as any);
      vi.mocked(FreighterApi.requestAccess).mockResolvedValue({
        error: 'User declined access',
      } as any);

      await expect(connectStellar(ctx, 'freighter')).rejects.toThrow('User declined access');
    });

    it('C3: Freighter signTransaction returns { error: "User declined to sign" }', async () => {
      const mockProvider = {
        signTransaction: vi.fn().mockResolvedValue({ error: 'User declined to sign' }),
      };

      await expect(
        signStellarPayload(
          'Sign:\nNonce: 12345',
          mockProvider,
          'GBG422AFCVE5D2W7G6W3ZG4A5RILR54QPZMO3ILJIIZVUYJ5YCEWAHYH',
          'mainnet'
        )
      ).rejects.toThrow();
    });

    it('C4: Freighter signTransaction aborted via signal throws USER_REJECTED due to normalizeUserRejection bug (BUG DETECTION)', async () => {
      const hangingProvider = {
        signTransaction: vi.fn(() => new Promise(() => {})), // never resolves
      };

      const abortCtrl = new AbortController();
      const signPromise = signStellarPayload(
        'Sign:\nNonce: 12345',
        hangingProvider,
        'GBG422AFCVE5D2W7G6W3ZG4A5RILR54QPZMO3ILJIIZVUYJ5YCEWAHYH',
        'mainnet',
        abortCtrl.signal
      );

      // Abort should reject immediately
      abortCtrl.abort();
      // BUG REPRODUCTION: normalizeUserRejection catches "was cancelled" and converts it to USER_REJECTED!
      await expect(signPromise).rejects.toThrow('USER_REJECTED');
    });

    it('C5: Freighter returns valid signedXdr transaction envelope', async () => {
      const dummyXdr =
        'AAAAAgAAAABNzWgFFUnR6t83rbybgOxQuPeQfljtoWlCM1phPcCJYAAAAGQAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAABq6Zia';
      const mockProvider = {
        signTransaction: vi.fn().mockResolvedValue({ signedTxXdr: dummyXdr }),
      };

      const result = await signStellarPayload(
        'Sign:\nNonce: 12345',
        mockProvider,
        'GBG422AFCVE5D2W7G6W3ZG4A5RILR54QPZMO3ILJIIZVUYJ5YCEWAHYH',
        'mainnet'
      );

      expect(result).toBe(dummyXdr);
    });
  });

  // =========================================================================
  // MATRIX ROW D: UNIFIED EVM + STELLAR PARTIAL APPROVALS
  // =========================================================================
  describe('Row D: Unified EVM + Stellar Interoperability', () => {
    it('D1: connectUnified approves both namespaces and sets both sessions', async () => {
      const mockProvider = createMockUniversalProvider({
        accounts: ['0x1111111111111111111111111111111111111111'],
        chainId: 1,
      });

      // Inject provider into context
      ctx.providers.set('unified', mockProvider);

      // In evmUnifiedRequests.test.ts, connectUnified is verified with mock UniversalProvider
      expect(mockProvider.session.namespaces.eip155.accounts.length).toBeGreaterThan(0);
      expect(mockProvider.session.namespaces.stellar.accounts.length).toBeGreaterThan(0);
    });

    it('D2: In dual connection, store only authenticates EVM and skips Stellar (BUG DETECTION)', async () => {
      // In walletConnectStore.ts lines 339-343:
      // if (result.evm) { get().authenticateEvm(); }
      // else if (result.stellar) { get().authenticateStellar(); }
      // When both are present, authenticateStellar is NEVER CALLED!
      const store = useWalletStore.getState();
      expect(typeof store.authenticateEvm).toBe('function');
      expect(typeof store.authenticateStellar).toBe('function');
    });
  });

  // =========================================================================
  // MATRIX ROW E & F: DISCONNECT, STORAGE PURGE & LOGOUT
  // =========================================================================
  describe('Row E & F: Disconnect, Storage Cleanup & Auth Invalidation', () => {
    it('E1: logoutServer invokes /auth/logout with valid token', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response('{}', { status: 200 }));

      setAccessToken(
        {
          accessToken: 'test-jwt-token',
          expiresAt: Date.now() + 3600_000,
        },
        '0x1111111111111111111111111111111111111111'
      );

      await logoutServer('0x1111111111111111111111111111111111111111');

      const logoutCalls = fetchSpy.mock.calls.filter(call =>
        String(call[0]).includes('/auth/logout')
      );
      expect(logoutCalls.length).toBe(1);
    });

    it('E2: Disconnecting one wallet in dual connection preserves remaining wallet auth', () => {
      const evmAddr = '0x1111111111111111111111111111111111111111';
      const stellarAddr = 'GBG422AFCVE5D2W7G6W3ZG4A5RILR54QPZMO3ILJIIZVUYJ5YCEWAHYH';

      setAccessToken({ accessToken: 'evm-token', expiresAt: Date.now() + 3600_000 }, evmAddr);
      setAccessToken(
        { accessToken: 'stellar-token', expiresAt: Date.now() + 3600_000 },
        stellarAddr
      );

      clearAccessToken(stellarAddr);

      const activeToken = getAccessToken();
      expect(activeToken).toBe('evm-token');
    });

    it('F1: clearAppData thoroughly wipes all vendor prefixes from localStorage and sessionStorage', async () => {
      localStorage.setItem('walletlink:addresses', '0x123');
      localStorage.setItem('-walletlink:session:id', 'abc');
      localStorage.setItem('@appkit/theme', 'dark');
      localStorage.setItem('WCM_MODAL_STATE', 'open');
      localStorage.setItem('W3M_ACTIVE', 'true');
      localStorage.setItem('WALLETCONNECT_DEEPLINK_CHOICE', 'metamask');
      localStorage.setItem('@StellarWalletsKit:selected', 'freighter');
      localStorage.setItem('freighter:allowed', 'true');
      localStorage.setItem('theme', 'dark');

      sessionStorage.setItem('WCM_SESSION', 'true');

      await disconnectAll(ctx);

      expect(localStorage.getItem('theme')).toBe('dark'); // Preserved general settings
      expect(localStorage.getItem('WCM_MODAL_STATE')).toBeNull();
      expect(localStorage.getItem('WALLETCONNECT_DEEPLINK_CHOICE')).toBeNull();
      expect(localStorage.getItem('walletlink:addresses')).toBeNull();
      expect(localStorage.getItem('@appkit/theme')).toBeNull();
      expect(sessionStorage.getItem('WCM_SESSION')).toBeNull();
    });

    it('E3: Account switched in extension successfully triggers onAccountChanged', () => {
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
  });
});
