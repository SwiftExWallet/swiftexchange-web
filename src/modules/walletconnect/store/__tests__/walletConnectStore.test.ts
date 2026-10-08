import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useWalletStore } from '../walletConnectStore';

// Removed deviceId mock

vi.mock('../../services/walletService', () => ({
  walletService: {
    connectChainWallet: vi.fn().mockResolvedValue({
      evmAddress: '0x123',
      evmChainId: 1,
    }),
    getProvider: vi.fn().mockReturnValue({ session: {} }),
    signSiweMessage: vi.fn().mockResolvedValue('mock-signature'),
    signStellarPayload: vi.fn().mockResolvedValue('mock-stellar-signature'),
    disconnect: vi.fn().mockResolvedValue(undefined),
    disconnectAll: vi.fn().mockResolvedValue(undefined),
  },
}));

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
});
