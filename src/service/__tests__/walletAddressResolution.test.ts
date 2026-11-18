import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useWalletStore } from '../../modules/walletconnect/store/walletConnectStore';
import { API_CONFIG, getConnectedWalletAddress } from '../apiConfig';
import { inferChainType, makeHeaders } from '../apiService';

describe('Chain-Aware Wallet Address Resolution', () => {
  const evmAddress = '0x8d7890d69df39691120c6d3ee55eee7e46a477ae';
  const stellarAddress = 'GDZSAKB7UCZESMJ7MHKE43Z3VAPVBAA22D3X7TYKW7X5W4VZPKXM7ZJX';

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();

    useWalletStore.setState({
      connectedWallets: {
        evm: {
          type: 'evm',
          walletId: 'metamask',
          address: evmAddress,
        },
        stellar: {
          type: 'stellar',
          walletId: 'freighter',
          address: stellarAddress,
        },
      },
      authenticatedChain: null,
    });
  });

  afterEach(() => {
    useWalletStore.setState({
      connectedWallets: {},
      authenticatedChain: null,
    });
  });

  describe('getConnectedWalletAddress', () => {
    it('returns stellar wallet address when chainType is stellar', () => {
      expect(getConnectedWalletAddress('stellar')).toBe(stellarAddress);
      expect(getConnectedWalletAddress('soroban')).toBe(stellarAddress);
    });

    it('returns evm wallet address when chainType is evm', () => {
      expect(getConnectedWalletAddress('evm')).toBe(evmAddress);
      expect(getConnectedWalletAddress('eth')).toBe(evmAddress);
    });

    it('infers stellar address from stellar endpoint URLs', () => {
      expect(getConnectedWalletAddress('/soroswap/quote')).toBe(stellarAddress);
      expect(getConnectedWalletAddress('/soroswap/prepare-swap')).toBe(stellarAddress);
      expect(getConnectedWalletAddress('/stellar/balance')).toBe(stellarAddress);
    });

    it('infers evm address from evm endpoint URLs', () => {
      expect(getConnectedWalletAddress('/eth/wallet-address/info')).toBe(evmAddress);
      expect(getConnectedWalletAddress('/evm/transaction')).toBe(evmAddress);
    });

    it('returns explicitly provided valid address unchanged', () => {
      expect(getConnectedWalletAddress(stellarAddress)).toBe(stellarAddress);
      expect(getConnectedWalletAddress(evmAddress)).toBe(evmAddress);
    });

    it('respects authenticatedChain when no chainType is specified', () => {
      useWalletStore.setState({ authenticatedChain: 'stellar' });
      expect(getConnectedWalletAddress()).toBe(stellarAddress);

      useWalletStore.setState({ authenticatedChain: 'evm' });
      expect(getConnectedWalletAddress()).toBe(evmAddress);
    });

    it('falls back to wallet_sessions in localStorage if store is empty', () => {
      useWalletStore.setState({ connectedWallets: {} });

      localStorage.setItem(
        'wallet_sessions',
        JSON.stringify({
          evm: { evmAddress },
          stellar: { stellarAddress },
        })
      );

      expect(getConnectedWalletAddress('stellar')).toBe(stellarAddress);
      expect(getConnectedWalletAddress('evm')).toBe(evmAddress);
    });

    it('provides API_CONFIG.getWalletAddress wrapper', () => {
      expect(API_CONFIG.getWalletAddress('stellar')).toBe(stellarAddress);
      expect(API_CONFIG.getWalletAddress('evm')).toBe(evmAddress);
    });
  });

  describe('makeHeaders and inferChainType', () => {
    it('sets x-wallet-address to stellar address for soroswap endpoints', () => {
      const headers = makeHeaders(undefined, '/soroswap/quote');
      expect(headers['x-wallet-address']).toBe(stellarAddress);
      expect(headers['x-wallet-address']).not.toBe(evmAddress);
    });

    it('sets x-wallet-address to evm address for evm endpoints', () => {
      const headers = makeHeaders(undefined, '/eth/wallet-address/info');
      expect(headers['x-wallet-address']).toBe(evmAddress);
      expect(headers['x-wallet-address']).not.toBe(stellarAddress);
    });

    it('infers chain type from payload body containing stellar address', () => {
      const headers = makeHeaders(undefined, '/bridge/quote', {
        userAddress: stellarAddress,
      });
      expect(headers['x-wallet-address']).toBe(stellarAddress);
    });

    it('infers chain type from payload body containing evm address', () => {
      const headers = makeHeaders(undefined, '/bridge/quote', {
        userAddress: evmAddress,
      });
      expect(headers['x-wallet-address']).toBe(evmAddress);
    });

    it('infers chain type from payload chainId or fromChain', () => {
      expect(inferChainType(undefined, undefined, { fromChain: 'stellar' })).toBe('stellar');
      expect(inferChainType(undefined, undefined, { fromChain: 'ethereum' })).toBe('evm');
    });

    it('honors explicitly provided x-wallet-address in extra headers', () => {
      const customAddr = 'GCUSTOMADDRESS12345';
      const headers = makeHeaders({ 'x-wallet-address': customAddr });
      expect(headers['x-wallet-address']).toBe(customAddr);
    });
  });
});
