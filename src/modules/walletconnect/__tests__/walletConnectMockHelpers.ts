import { vi } from 'vitest';

import type {
  ConnectionState,
  WalletServiceContext,
  WalletSession,
  WalletType,
} from '../services/wallet/types';

export interface MockProviderOptions {
  accounts?: string[];
  chainId?: number | string;
  peerMetadata?: {
    name?: string;
    icons?: string[];
    redirect?: { native?: string; universal?: string };
  };
  customHandlers?: Record<string, (params?: any[]) => any>;
  expiry?: number;
}

/**
 * Creates a mock WalletConnect UniversalProvider instance for end-to-end
 * testing of unified and single-chain EVM / Stellar session lifecycles.
 */
export function createMockUniversalProvider(options: MockProviderOptions = {}) {
  const {
    accounts = ['0x1111111111111111111111111111111111111111'],
    chainId = 1,
    peerMetadata = {
      name: 'Mock WalletConnect Wallet',
      icons: ['https://example.com/icon.png'],
      redirect: { native: 'mockwallet://', universal: 'https://mockwallet.com/wc' },
    },
    customHandlers = {},
    expiry = Math.floor(Date.now() / 1000) + 3600 * 24,
  } = options;

  const eventListeners: Record<string, ((...args: any[]) => void)[]> = {};

  const numChainId = typeof chainId === 'number' ? chainId : parseInt(chainId, 10) || 1;
  const hexChainId = `0x${numChainId.toString(16)}`;

  const eip155Accounts = accounts.map(a => `eip155:${numChainId}:${a}`);
  const stellarAccounts = [
    'stellar:pubnet:GAAAMOCKSTELLARPUBLICKEY12345678901234567890123456789012345678',
  ];

  const session = {
    topic: 'mock-session-topic-uuid',
    expiry,
    peer: {
      metadata: peerMetadata,
    },
    namespaces: {
      eip155: {
        accounts: eip155Accounts,
        methods: [
          'eth_sendTransaction',
          'eth_signTypedData_v4',
          'eth_signTypedData',
          'personal_sign',
        ],
        events: ['chainChanged', 'accountsChanged'],
      },
      stellar: {
        accounts: stellarAccounts,
        methods: ['stellar_signTransaction', 'stellar_signAndSubmitXDR', 'stellar_signXDR'],
        events: ['accountsChanged'],
      },
    },
  };

  const provider = {
    __providerKey: (options as any).key || 'unified',
    __debugProviderId: 'mock-debug-id',
    session,
    client: {
      core: {
        relayer: {
          transportOpen: vi.fn().mockResolvedValue(undefined),
        },
      },
    },
    request: vi.fn(async (args: { method: string; params?: any[] }) => {
      const { method, params } = args;

      if (customHandlers[method]) {
        return customHandlers[method](params);
      }

      switch (method) {
        case 'eth_requestAccounts':
        case 'eth_accounts':
          return accounts;
        case 'eth_chainId':
          return hexChainId;
        case 'personal_sign':
          return '0xMOCK_PERSONAL_SIGNATURE_999';
        case 'eth_signTypedData_v4':
        case 'eth_signTypedData':
          return '0xMOCK_TYPED_DATA_SIGNATURE_444';
        case 'eth_sendTransaction':
          return '0xMOCK_TX_HASH_ABCDEF123456';
        case 'wallet_switchEthereumChain':
          return null;
        case 'wallet_addEthereumChain':
          return null;
        case 'stellar_signXDR':
        case 'stellar_signTransaction':
          return { signedXDR: 'MOCK_SIGNED_STELLAR_XDR_DATA' };
        default:
          return null;
      }
    }),
    connect: vi.fn(async () => session),
    disconnect: vi.fn(async () => {
      provider.session = null as any;
    }),
    setDefaultChain: vi.fn(),
    on: vi.fn((event: string, callback: (...args: any[]) => void) => {
      if (!eventListeners[event]) eventListeners[event] = [];
      eventListeners[event].push(callback);
      return provider;
    }),
    emit: (event: string, ...args: any[]) => {
      const listeners = eventListeners[event] || [];
      listeners.forEach(cb => cb(...args));
    },
    removeAllListeners: vi.fn(() => {
      Object.keys(eventListeners).forEach(key => delete eventListeners[key]);
    }),
    abortPairing: vi.fn(),
  };

  return provider;
}

/**
 * Creates a mock EIP-1193 Injected Wallet Provider (e.g. MetaMask, Rabby).
 */
export function createMockInjectedProvider(
  options: {
    walletId?: string;
    accounts?: string[];
    chainId?: number | string;
    isMetaMask?: boolean;
    isTrust?: boolean;
    isRabby?: boolean;
    customHandlers?: Record<string, (params?: any[]) => any>;
  } = {}
) {
  const {
    accounts = ['0xInjectedAddress000000000000000000000001'],
    chainId = 1,
    isMetaMask = true,
    isTrust = false,
    isRabby = false,
    customHandlers = {},
  } = options;

  const numChainId = typeof chainId === 'number' ? chainId : parseInt(chainId, 10) || 1;
  const hexChainId = `0x${numChainId.toString(16)}`;
  const eventListeners: Record<string, ((...args: any[]) => void)[]> = {};

  return {
    isMetaMask,
    isTrust,
    isRabby,
    request: vi.fn(async ({ method, params }: { method: string; params?: any[] }) => {
      if (customHandlers[method]) return customHandlers[method](params);
      switch (method) {
        case 'eth_requestAccounts':
        case 'eth_accounts':
          return accounts;
        case 'eth_chainId':
          return hexChainId;
        case 'personal_sign':
          return '0xMOCK_INJECTED_PERSONAL_SIGNATURE';
        case 'eth_signTypedData_v4':
          return '0xMOCK_INJECTED_TYPED_DATA_SIGNATURE';
        case 'eth_sendTransaction':
          return '0xMOCK_INJECTED_TX_HASH';
        case 'wallet_switchEthereumChain':
          return null;
        case 'wallet_addEthereumChain':
          return null;
        default:
          return null;
      }
    }),
    on: vi.fn((event: string, callback: (...args: any[]) => void) => {
      if (!eventListeners[event]) eventListeners[event] = [];
      eventListeners[event].push(callback);
    }),
    emit: (event: string, ...args: any[]) => {
      const listeners = eventListeners[event] || [];
      listeners.forEach(cb => cb(...args));
    },
    removeListener: vi.fn(),
  };
}

/**
 * Creates an isolated WalletServiceContext fixture with test spies.
 */
export function createMockWalletServiceContext(network: 'mainnet' | 'testnet' = 'mainnet'): {
  ctx: WalletServiceContext;
  emittedStates: { type: WalletType; state: ConnectionState }[];
} {
  const emittedStates: { type: WalletType; state: ConnectionState }[] = [];

  const ctx: WalletServiceContext = {
    sessions: new Map<WalletType, WalletSession>(),
    providers: new Map<string, any>(),
    modals: new Map(),
    eip6963Providers: new Map(),
    registeredProviders: new Set(),
    lastPingAt: new Map(),
    disconnecting: new Set(),
    isSignRequestInFlight: new Map(),
    derivationInProgress: false,
    currentNetwork: network,
    emitState: (type: WalletType, state: ConnectionState) => {
      emittedStates.push({ type, state });
    },
    saveSession: vi.fn(),
    openMobileDeepLink: vi.fn(),
    handleDisconnect: vi.fn((type: WalletType) => {
      ctx.sessions.delete(type);
      ctx.providers.delete(type);
      ctx.emitState(type, 'disconnected');
    }),
  };

  return { ctx, emittedStates };
}
