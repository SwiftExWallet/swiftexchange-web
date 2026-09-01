import { describe, expect, it, vi } from 'vitest';

import { parseRawChainId, switchOrAddChain } from '../../evm/utils/evmChainUtils';
import { adjustFeeDataForMinGas } from '../../evm/utils/evmUtils';
import { buildUnifiedNamespaces, getEVMChains } from '../config/chains';
import { disconnectAll } from '../services/wallet/disconnect';
import {
  handleAccountsChanged,
  handleChainChanged,
  handleSessionUpdate,
} from '../services/wallet/eventListeners';
import { connectChainWallet } from '../services/wallet/evmConnect';
import { wrapProviderRequests } from '../services/wallet/providerRegistry';
import { saveSession } from '../services/wallet/sessionPersistence';
import { signDydxMessage, signSiweMessage, signStellarChallenge } from '../services/wallet/signing';
import { connectUnified } from '../services/wallet/unifiedConnect';
import { extractErrorMessage, isUserRejection } from '../utils/walletErrorHandler';
import {
  createMockInjectedProvider,
  createMockUniversalProvider,
  createMockWalletServiceContext,
} from './walletConnectMockHelpers';

// Mock dependencies
vi.mock('../../../../service/notificationService', () => ({
  sendCustomNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../utils/walletConnectUtils', () => ({
  isMobileDevice: vi.fn().mockReturnValue(false),
  openMobileWallet: vi.fn(),
}));

vi.mock('@walletconnect/modal', () => {
  class MockModal {
    openModal = vi.fn();
    closeModal = vi.fn();
    subscribeModal = vi.fn((cb: (state: { open: boolean }) => void) => {
      cb({ open: false });
      return () => {};
    });
  }
  return {
    WalletConnectModal: MockModal,
  };
});

describe('Unified Multi-Chain & EVM Request Verification', () => {
  describe('1. Namespace Construction & Routing', () => {
    it('builds unified namespaces containing both eip155 and stellar chains for mainnet', () => {
      const namespaces = buildUnifiedNamespaces('mainnet');

      expect(namespaces.requiredNamespaces).toEqual({});
      expect(namespaces.optionalNamespaces).toBeDefined();

      const eip155 = namespaces.optionalNamespaces.eip155 as any;
      const stellar = namespaces.optionalNamespaces.stellar as any;

      expect(eip155).toBeDefined();
      expect(eip155.methods).toContain('eth_sendTransaction');
      expect(eip155.methods).toContain('personal_sign');
      expect(eip155.methods).toContain('eth_signTypedData_v4');
      expect(eip155.chains).toContain('eip155:1');
      expect(eip155.chains).toContain('eip155:42161');
      expect(eip155.chains).toContain('eip155:137');

      expect(stellar).toBeDefined();
      expect(stellar.chains).toContain('stellar:pubnet');
      expect(stellar.methods).toContain('stellar_signTransaction');
    });

    it('retrieves valid EVM chain configs for mainnet', () => {
      const chains = getEVMChains('mainnet');
      expect(chains.length).toBeGreaterThanOrEqual(7);
      const eth = chains.find(c => c.chainId === 1);
      expect(eth).toBeDefined();
      expect(eth?.name).toBe('Ethereum');
      expect(eth?.rpcUrls.length).toBeGreaterThan(0);
    });
  });

  describe('2. Unified & EVM Connection Flow', () => {
    it('connectUnified establishes dual EVM and Stellar sessions from a multi-namespace response', async () => {
      const { ctx, emittedStates } = createMockWalletServiceContext('mainnet');
      const mockProvider = createMockUniversalProvider({
        accounts: ['0x1111111111111111111111111111111111111111'],
        chainId: 1,
      });

      // Register provider in context
      ctx.providers.set('unified', mockProvider);

      const result = await connectUnified(ctx, 'swiftex');

      expect(result.evm).toBeDefined();
      expect(result.evm?.evmAddress).toBe('0x1111111111111111111111111111111111111111');
      expect(result.evm?.evmChainId).toBe(1);
      expect(result.evm?.connectionMode).toBe('unified');

      expect(result.stellar).toBeDefined();
      expect(result.stellar?.stellarAddress).toBe(
        'GAAAMOCKSTELLARPUBLICKEY12345678901234567890123456789012345678'
      );
      expect(result.stellar?.stellarChainId).toBe('pubnet');

      expect(ctx.sessions.get('evm')).toBeDefined();
      expect(ctx.sessions.get('stellar')).toBeDefined();
      expect(emittedStates).toContainEqual({ type: 'evm', state: 'connected' });
      expect(emittedStates).toContainEqual({ type: 'stellar', state: 'connected' });
    });

    it('connectChainWallet connects directly to injected EIP-1193 extension if available', async () => {
      const { ctx, emittedStates } = createMockWalletServiceContext('mainnet');
      const injectedProvider = createMockInjectedProvider({
        accounts: ['0xInjectedUser0000000000000000000000000001'],
        chainId: 1,
        isMetaMask: true,
      });

      (window as any).ethereum = injectedProvider;

      const session = await connectChainWallet(ctx, 'metamask');

      expect(session.evmAddress).toBe('0xInjectedUser0000000000000000000000000001');
      expect(session.evmChainId).toBe(1);
      expect(session.type).toBe('evm');
      expect(ctx.sessions.get('evm')).toEqual(session);
      expect(emittedStates).toContainEqual({ type: 'evm', state: 'connected' });

      delete (window as any).ethereum;
    });
  });

  describe('3. Request Interception, In-Flight Locking & Error Handling', () => {
    it('prevents concurrent in-flight sign requests with code -32002', async () => {
      const { ctx } = createMockWalletServiceContext();
      let resolveFirst: () => void;
      const firstPromise = new Promise(r => {
        resolveFirst = r as any;
      });

      const mockProvider = {
        request: vi.fn(async ({ method }: { method: string; params?: any[] }) => {
          if (method === 'personal_sign') {
            await firstPromise;
            return '0xSIGNATURE_1';
          }
          return null;
        }),
      };

      wrapProviderRequests(ctx, mockProvider);

      // Launch first request
      const req1 = mockProvider.request({
        method: 'personal_sign',
        params: ['0x123', '0xabc'],
      });

      // Immediately launch second request before first finishes
      const req2 = mockProvider.request({
        method: 'personal_sign',
        params: ['0x456', '0xabc'],
      });

      await expect(req2).rejects.toMatchObject({
        code: -32002,
        message: expect.stringContaining('already in progress'),
      });

      // Finish first request
      resolveFirst!();
      await expect(req1).resolves.toBe('0xSIGNATURE_1');
    });

    it('translates user rejections into standardized USER_REJECTED code 4001', async () => {
      const { ctx } = createMockWalletServiceContext();
      const mockProvider: { request: (args?: { method: string; params?: any[] }) => Promise<any> } =
        {
          request: vi.fn(async () => {
            const error: any = new Error('User rejected the request.');
            error.code = 4001;
            throw error;
          }),
        };

      wrapProviderRequests(ctx, mockProvider);

      await expect(
        mockProvider.request({
          method: 'eth_sendTransaction',
          params: [{ to: '0x123', value: '0x0' }],
        })
      ).rejects.toMatchObject({
        message: 'USER_REJECTED',
        code: 4001,
      });
    });

    it('correctly identifies user rejections in error handler utility', () => {
      expect(isUserRejection({ code: 4001, message: 'User denied' })).toBe(true);
      expect(isUserRejection({ code: 'ACTION_REJECTED', message: 'Rejected' })).toBe(true);
      expect(isUserRejection(new Error('User rejected transaction'))).toBe(true);
      expect(isUserRejection(new Error('Transaction reverted with code 3'))).toBe(false);
      expect(extractErrorMessage({ message: 'Execution reverted: low balance' })).toBe(
        'Execution reverted: low balance'
      );
    });
  });

  describe('4. Signing Flows (SIWE, dYdX EIP-712 & Stellar)', () => {
    it('signs SIWE message using fallback resolution across address formats', async () => {
      const provider = {
        request: vi.fn(async ({ method, params }: { method: string; params: any[] }) => {
          if (method === 'personal_sign') {
            // Simulate wallet requiring lowercase address
            if (params[1] === '0x1111111111111111111111111111111111111111') {
              return '0xMOCK_SIWE_SIGNATURE_LOWERCASE';
            }
          }
          throw new Error('Invalid params');
        }),
      };

      const sig = await signSiweMessage(
        '0x1111111111111111111111111111111111111111',
        provider,
        'Sign in to SwiftExchange'
      );

      expect(sig).toBe('0xMOCK_SIWE_SIGNATURE_LOWERCASE');
    });

    it('signs dYdX EIP-712 typed data onboard message', async () => {
      const provider = {
        request: vi.fn(async ({ method }: { method: string }) => {
          if (method === 'eth_signTypedData_v4') {
            return '0xMOCK_DYDX_TYPED_SIGNATURE';
          }
          throw new Error('Unsupported method');
        }),
      };

      const sig = await signDydxMessage('0x1111111111111111111111111111111111111111', provider);
      expect(sig).toBe('0xMOCK_DYDX_TYPED_SIGNATURE');
    });

    it('signs Stellar XDR challenge via provider stellar_signXDR', async () => {
      const provider = {
        request: vi.fn(async ({ method }: { method: string }) => {
          if (method === 'stellar_signXDR') {
            return { signedXDR: 'MOCK_SIGNED_XDR_STRING' };
          }
          throw new Error('Unsupported');
        }),
      };

      const res = await signStellarChallenge(
        'AAAAXDRCHALLENGE',
        'Public Global Stellar Network ; September 2015',
        provider
      );

      expect(res).toBe('MOCK_SIGNED_XDR_STRING');
    });
  });

  describe('5. Chain Switching, Add Chain & L2 Gas Adjustments', () => {
    it('parses raw chainId correctly in both decimal and hex formats', () => {
      expect(parseRawChainId('0x1')).toBe(1);
      expect(parseRawChainId('0x89')).toBe(137);
      expect(parseRawChainId('0xa4b1')).toBe(42161);
      expect(parseRawChainId('137')).toBe(137);
      expect(parseRawChainId('42161')).toBe(42161);
      expect(parseRawChainId(10)).toBe(10);
    });

    it('switches chain via wallet_switchEthereumChain and calls setDefaultChain for WalletConnect', async () => {
      const provider = createMockUniversalProvider();
      await switchOrAddChain(provider, 137);

      expect(provider.setDefaultChain).toHaveBeenCalledWith('eip155:137', expect.any(String));
      expect(provider.request).toHaveBeenCalledWith({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x89' }],
      });
    });

    it('adds chain via wallet_addEthereumChain if wallet returns error code 4902', async () => {
      const provider = {
        setDefaultChain: vi.fn(),
        request: vi.fn(async ({ method }: { method: string }) => {
          if (method === 'wallet_switchEthereumChain') {
            const err: any = new Error('Chain not added');
            err.code = 4902;
            throw err;
          }
          if (method === 'wallet_addEthereumChain') {
            return null;
          }
        }),
      };

      await switchOrAddChain(provider, 137);

      expect(provider.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'wallet_addEthereumChain',
          params: [
            expect.objectContaining({
              chainId: '0x89',
              chainName: 'Polygon',
            }),
          ],
        })
      );
    });

    it('adjusts fee data to respect minimum gas price on L2 networks (e.g. Polygon 30 Gwei)', () => {
      const lowFeeData = {
        gasPrice: 1000000000n, // 1 Gwei
        maxFeePerGas: 2000000000n, // 2 Gwei
        maxPriorityFeePerGas: 1000000000n, // 1 Gwei
      };

      const adjusted = adjustFeeDataForMinGas(lowFeeData, 137);

      // Polygon minGasGwei is 30 Gwei (30000000000n)
      expect(adjusted.gasPrice).toBeGreaterThanOrEqual(30000000000n);
      expect(adjusted.maxPriorityFeePerGas).toBeGreaterThanOrEqual(30000000000n);
      expect(adjusted.maxFeePerGas).toBeGreaterThanOrEqual(adjusted.maxPriorityFeePerGas);
    });
  });

  describe('6. Session Lifecycle, Event Listeners & Persistence', () => {
    it('handles accountsChanged event and updates session address', () => {
      const { ctx, emittedStates } = createMockWalletServiceContext();
      ctx.sessions.set('evm', {
        type: 'evm',
        walletId: 'metamask',
        evmAddress: '0xOldAddress',
        evmChainId: 1,
      });

      handleAccountsChanged(ctx, 'evm', ['0xNewAddress']);

      expect(ctx.sessions.get('evm')?.evmAddress).toBe('0xNewAddress');
      expect(emittedStates).toContainEqual({ type: 'evm', state: 'connected' });
    });

    it('handles chainChanged event and updates session chainId', () => {
      const { ctx, emittedStates } = createMockWalletServiceContext();
      ctx.sessions.set('evm', {
        type: 'evm',
        walletId: 'metamask',
        evmAddress: '0xUser',
        evmChainId: 1,
      });

      handleChainChanged(ctx, 'evm', '0x89');

      expect(ctx.sessions.get('evm')?.evmChainId).toBe(137);
      expect(emittedStates).toContainEqual({ type: 'evm', state: 'connected' });
    });

    it('handles session_update across multi-namespace sessions', () => {
      const { ctx } = createMockWalletServiceContext();
      ctx.sessions.set('evm', {
        type: 'evm',
        walletId: 'swiftex',
        evmAddress: '0xOld',
        evmChainId: 1,
      });

      handleSessionUpdate(ctx, 'evm', {
        eip155: {
          accounts: ['eip155:42161:0xNewArbUser'],
        },
      });

      expect(ctx.sessions.get('evm')?.evmAddress).toBe('0xNewArbUser');
      expect(ctx.sessions.get('evm')?.evmChainId).toBe(42161);
    });

    it('saves sessions to localStorage and clears correctly on disconnectAll', async () => {
      const { ctx } = createMockWalletServiceContext();
      const mockProvider = createMockUniversalProvider();
      ctx.sessions.set('evm', {
        type: 'evm',
        walletId: 'swiftex',
        evmAddress: '0x123',
        evmChainId: 1,
        connectionMode: 'unified',
      });
      ctx.providers.set('evm', mockProvider);

      saveSession(ctx);

      const stored = localStorage.getItem('wallet_sessions');
      expect(stored).toBeDefined();
      expect(JSON.parse(stored!).evm.evmAddress).toBe('0x123');

      await disconnectAll(ctx);

      expect(ctx.sessions.size).toBe(0);
      expect(mockProvider.disconnect).toHaveBeenCalled();
    });
  });
});
