import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useWalletStore } from '../walletConnectStore';

// Removed deviceId mock

vi.mock('../../services/walletService', () => ({
  walletService: {
    connectChainWallet: vi.fn().mockResolvedValue({
      evmAddress: '0x123',
      evmChainId: 1,
    }),
    connectStellar: vi.fn().mockResolvedValue({
      stellarAddress: 'GCMOCKADDRESS',
      stellarChainId: 'testnet',
    }),
    connectUnified: vi.fn().mockResolvedValue({
      evm: { evmAddress: '0x123', evmChainId: 1 },
      stellar: { stellarAddress: 'GCMOCKADDRESS', stellarChainId: 'testnet' },
    }),
    restoreSessions: vi.fn().mockResolvedValue([]),
    getProvider: vi.fn().mockReturnValue({ session: {} }),
    signSiweMessage: vi.fn().mockResolvedValue('mock-signature'),
    signStellarPayload: vi.fn().mockResolvedValue('mock-stellar-signature'),
    disconnect: vi.fn().mockResolvedValue(undefined),
    disconnectAll: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../../service/deviceService', () => ({
  isSwiftExPeer: vi.fn((peerMeta?: { name?: string; url?: string } | null) => {
    const name = typeof peerMeta?.name === 'string' ? peerMeta.name.toLowerCase() : '';
    const url = typeof peerMeta?.url === 'string' ? peerMeta.url.toLowerCase() : '';
    return name.includes('swiftex') || url.includes('swiftexchange.io');
  }),
  isValidDevicePayload: vi.fn().mockReturnValue(true),
  ensureSwiftExDeviceAuth: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../../../service/apiConfig', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../../service/apiConfig')>();
  return {
    ...actual,
    getValidDeviceToken: vi.fn().mockReturnValue(null),
    clearDeviceToken: vi.fn(),
  };
});

vi.mock('../../services/Siweauthservice', () => ({
  buildSiweMessage: vi.fn().mockResolvedValue('mock-message'),
  verifySiwe: vi.fn().mockResolvedValue({
    accessToken: 'mock-access',
    expiresIn: 3600,
    refreshToken: 'mock-refresh',
  }),
  restoreAuthSession: vi.fn().mockResolvedValue(null),
  setAccessToken: vi.fn(),
  getAccessToken: vi.fn().mockReturnValue(null),
  buildStellarPayload: vi.fn().mockResolvedValue('mock-payload'),
  verifyStellarPayload: vi.fn().mockResolvedValue({
    accessToken: 'mock-stellar-access',
    expiresIn: 3600,
    refreshToken: 'mock-stellar-refresh',
  }),
  getCurrentTokenInfo: vi.fn().mockReturnValue(null),
  clearAccessToken: vi.fn(),
  logoutServer: vi.fn().mockResolvedValue(undefined),
  isAuthenticated: vi.fn().mockReturnValue(false),
  onJwtSessionSet: vi.fn().mockReturnValue(() => {}),
}));

describe('walletConnectStore', () => {
  beforeEach(() => {
    useWalletStore.setState({
      connectedWallets: {
        evm: {
          type: 'evm',
          walletId: 'metamask',
          address: '0x123',
          chainId: 1,
        },
      },
      isModalOpen: false,
      isAuthenticated: false,
      authenticatedChain: null,
      linkedChains: [],
    });
    vi.clearAllMocks();
  });

  it('authenticates EVM and calls verifySiwe with deviceId and fingerprint', async () => {
    const { verifySiwe } = await import('../../services/Siweauthservice');

    await useWalletStore.getState().authenticateEvm();

    expect(verifySiwe).toHaveBeenCalledWith(
      'mock-message',
      'mock-signature',
      expect.objectContaining({
        address: '0x123',
        chainId: 1,
      })
    );
  });

  it('opens modal correctly', () => {
    useWalletStore.getState().openModal();
    expect(useWalletStore.getState().isModalOpen).toBe(true);
  });

  it('authenticates Stellar and completes the verification flow', async () => {
    const { verifyStellarPayload, buildStellarPayload } =
      await import('../../services/Siweauthservice');
    const { walletService } = await import('../../services/walletService');

    // Add stellar wallet to state
    useWalletStore.setState({
      connectedWallets: {
        stellar: {
          type: 'stellar',
          walletId: 'freighter',
          address: 'GCMOCKADDRESS',
          chainId: 'testnet',
        },
      },
    });

    await useWalletStore.getState().authenticateStellar();

    expect(buildStellarPayload).toHaveBeenCalled();
    expect(walletService.signStellarPayload).toHaveBeenCalledWith(
      'mock-payload',
      expect.anything(),
      'GCMOCKADDRESS',
      expect.anything(),
      expect.anything()
    );
    expect(verifyStellarPayload).toHaveBeenCalledWith(
      'mock-payload',
      'mock-stellar-signature',
      expect.objectContaining({
        address: 'GCMOCKADDRESS',
        stellarAddress: 'GCMOCKADDRESS',
      })
    );

    const state = useWalletStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.authenticatedChain).toBe('stellar');
    expect(state.linkedChains).toEqual(['stellar']);
  });

  it('keeps primary wallet authenticated when secondary wallet disconnects', async () => {
    useWalletStore.setState({
      connectedWallets: {
        evm: { type: 'evm', walletId: 'metamask', address: '0x123', chainId: 1 },
        stellar: {
          type: 'stellar',
          walletId: 'freighter',
          address: 'GCMOCKADDRESS',
          chainId: 'testnet',
        },
      },
      isAuthenticated: true,
      authenticatedChain: 'evm',
      linkedChains: ['evm', 'stellar'],
    });

    await useWalletStore.getState().disconnect('stellar');

    const state = useWalletStore.getState();
    expect(state.connectedWallets.stellar).toBeUndefined();
    expect(state.connectedWallets.evm).toBeDefined();
    expect(state.isAuthenticated).toBe(true);
    expect(state.authenticatedChain).toBe('evm');
    expect(state.linkedChains).toEqual(['evm']);
  });

  it('hands over auth when primary wallet disconnects and remaining wallet has stored session', async () => {
    const { restoreAuthSession } = await import('../../services/Siweauthservice');
    vi.mocked(restoreAuthSession).mockImplementation(async (addr?: string) => {
      if (addr === 'GCMOCKADDRESS') {
        return {
          accessToken: 'stored-stellar-token',
          expiresAt: Date.now() + 100000,
          address: 'GCMOCKADDRESS',
          issuedAt: Date.now(),
        };
      }
      return null;
    });

    useWalletStore.setState({
      connectedWallets: {
        evm: { type: 'evm', walletId: 'metamask', address: '0x123', chainId: 1 },
        stellar: {
          type: 'stellar',
          walletId: 'freighter',
          address: 'GCMOCKADDRESS',
          chainId: 'testnet',
        },
      },
      isAuthenticated: true,
      authenticatedChain: 'evm',
      linkedChains: ['evm', 'stellar'],
    });

    await useWalletStore.getState().disconnect('evm');

    const state = useWalletStore.getState();
    expect(state.connectedWallets.evm).toBeUndefined();
    expect(state.connectedWallets.stellar).toBeDefined();
    expect(state.isAuthenticated).toBe(true);
    expect(state.authenticatedChain).toBe('stellar');
    expect(state.linkedChains).toEqual(['stellar']);
  });

  it('skips SIWE signing for SwiftEx one-click connect when deviceToken is obtained', async () => {
    const { ensureSwiftExDeviceAuth } = await import('../../../../service/deviceService');
    const { buildSiweMessage } = await import('../../services/Siweauthservice');
    const { walletService } = await import('../../services/walletService');

    vi.mocked(ensureSwiftExDeviceAuth).mockResolvedValueOnce('swiftex-device-token-123');
    vi.mocked(walletService.getProvider).mockReturnValue({
      session: {
        peer: {
          metadata: {
            name: 'SwiftEx Wallet',
            userDevice: { uniqueId: 'dev-1', fcmToken: 'fcm-1' },
          },
        },
      },
    } as any);

    useWalletStore.setState({ connectedWallets: {}, isAuthenticated: false, linkedChains: [] });
    await useWalletStore.getState().connectWallet('evm', 'swiftex');

    expect(ensureSwiftExDeviceAuth).toHaveBeenCalled();
    expect(buildSiweMessage).not.toHaveBeenCalled();
    const state = useWalletStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.isAuthenticating).toBe(false);
    expect(state.authenticatedChain).toBe('evm');
    expect(state.linkedChains).toEqual(['evm']);
  });

  it('skips SIWE/Stellar signing on connectUnified for SwiftEx when deviceToken is obtained', async () => {
    const { ensureSwiftExDeviceAuth } = await import('../../../../service/deviceService');
    const { buildSiweMessage, buildStellarPayload } =
      await import('../../services/Siweauthservice');

    vi.mocked(ensureSwiftExDeviceAuth).mockResolvedValueOnce('swiftex-device-token-unified');

    useWalletStore.setState({ connectedWallets: {}, isAuthenticated: false, linkedChains: [] });
    await useWalletStore.getState().connectUnified('swiftex');

    expect(buildSiweMessage).not.toHaveBeenCalled();
    expect(buildStellarPayload).not.toHaveBeenCalled();
    const state = useWalletStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.authenticatedChain).toBe('evm');
    expect(state.linkedChains).toEqual(['evm', 'stellar']);
  });

  it('falls back to SIWE when SwiftEx deviceToken is unavailable', async () => {
    const { ensureSwiftExDeviceAuth } = await import('../../../../service/deviceService');
    const { buildSiweMessage, verifySiwe } = await import('../../services/Siweauthservice');

    vi.mocked(ensureSwiftExDeviceAuth).mockResolvedValueOnce(null);

    useWalletStore.setState({ connectedWallets: {}, isAuthenticated: false, linkedChains: [] });
    await useWalletStore.getState().connectWallet('evm', 'swiftex');

    // authenticateEvm is kicked off asynchronously when falling back
    await vi.waitFor(() => {
      expect(buildSiweMessage).toHaveBeenCalled();
      expect(verifySiwe).toHaveBeenCalled();
    });
  });

  it('restores SwiftEx auth from valid deviceToken on restoreSessions', async () => {
    const { getValidDeviceToken } = await import('../../../../service/apiConfig');
    const { walletService } = await import('../../services/walletService');

    vi.mocked(getValidDeviceToken).mockReturnValue('persisted-device-token');
    vi.mocked(walletService.restoreSessions).mockResolvedValueOnce([
      { type: 'evm', walletId: 'swiftex', evmAddress: '0x123', evmChainId: 1 } as any,
    ]);

    useWalletStore.setState({
      connectedWallets: {},
      hasRestoredSessions: false,
      isRestoringSession: false,
      isAuthenticated: false,
    });
    await useWalletStore.getState().restoreSessions();

    const state = useWalletStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.authenticatedChain).toBe('evm');
    expect(state.linkedChains).toEqual(['evm']);
  });

  it('clears deviceToken and all wallet sessions on logoutAuth without address', async () => {
    const { clearDeviceToken } = await import('../../../../service/apiConfig');
    const { logoutServer } = await import('../../services/Siweauthservice');

    useWalletStore.setState({
      connectedWallets: {
        evm: { type: 'evm', walletId: 'swiftex', address: '0x123', chainId: 1 },
        stellar: {
          type: 'stellar',
          walletId: 'swiftex',
          address: 'GCMOCKADDRESS',
          chainId: 'testnet',
        },
      },
      isAuthenticated: true,
      authenticatedChain: 'evm',
      linkedChains: ['evm', 'stellar'],
    });

    await useWalletStore.getState().logoutAuth();

    expect(logoutServer).toHaveBeenCalledWith('0x123');
    expect(logoutServer).toHaveBeenCalledWith('GCMOCKADDRESS');
    expect(clearDeviceToken).toHaveBeenCalled();
    expect(useWalletStore.getState().isAuthenticated).toBe(false);
  });
});
