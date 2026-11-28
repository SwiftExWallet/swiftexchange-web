import { describe, expect, it, vi } from 'vitest';

import { useExchangeManager } from '../../../core/ExchangeManager';
import { getHyperliquidConfig } from '../../../core/config/networks';
import { depositToHyperliquid } from '../api/deposit';

// Mock ethers classes
vi.mock('ethers', async importOriginal => {
  const actual = await importOriginal<typeof import('ethers')>();

  class MockBrowserProvider {
    provider: any;
    constructor(p: any) {
      this.provider = p;
    }
    async getSigner() {
      return {
        getAddress: async () => '0xUserAddress',
      };
    }
    async getNetwork() {
      return {
        chainId: BigInt(this.provider?._mockChainId ?? 42161),
      };
    }
  }

  class MockContract {
    address: string;
    abi: any;
    signer: any;
    constructor(address: string, abi: any, signer: any) {
      this.address = address;
      this.abi = abi;
      this.signer = signer;
    }
    async transfer() {
      return {
        hash: '0xmockedtxhash123',
        wait: async () => ({ status: 1 }),
      };
    }
  }

  return {
    ...actual,
    BrowserProvider: MockBrowserProvider,
    Contract: MockContract,
  };
});

describe('Hyperliquid Deposit & Network Configuration', () => {
  it('correctly returns mainnet Arbitrum One bridge and USDC configurations', () => {
    const config = getHyperliquidConfig('mainnet');

    expect(config.l1ChainId).toBe(42161);
    expect(config.isTestnet).toBe(false);
    expect(config.depositBridge.toLowerCase()).toBe('0x2df1c51e09aecf9cacb7bc98cb1742757f163df7');
    expect(config.usdcAddress.toLowerCase()).toBe('0xaf88d065e77c8cc2239327c5edb3a432268e5831');
  });

  it('correctly returns testnet Arbitrum Sepolia bridge and USDC configurations', () => {
    const config = getHyperliquidConfig('testnet');

    expect(config.l1ChainId).toBe(421614);
    expect(config.isTestnet).toBe(true);
    expect(config.depositBridge.toLowerCase()).toBe('0x08cfc1b6b2dcf36a1480b99353a354aa8ac56f89');
    expect(config.usdcAddress.toLowerCase()).toBe('0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d');
  });

  it('rejects deposit if wallet is on incorrect chain for testnet', async () => {
    useExchangeManager.setState({ currentNetwork: 'testnet' });

    const mockProviderOnMainnet = { _mockChainId: 42161 }; // Arbitrum One instead of Sepolia

    await expect(depositToHyperliquid(mockProviderOnMainnet, '50')).rejects.toThrow(
      /Network mismatch: Wallet is connected to chain 42161, but Hyperliquid testnet requires Arbitrum Sepolia/
    );
  });

  it('rejects deposit if wallet is on incorrect chain for mainnet', async () => {
    useExchangeManager.setState({ currentNetwork: 'mainnet' });

    const mockProviderOnBsc = { _mockChainId: 56 }; // BSC instead of Arbitrum One

    await expect(depositToHyperliquid(mockProviderOnBsc, '50')).rejects.toThrow(
      /Network mismatch: Wallet is connected to chain 56, but Hyperliquid mainnet requires Arbitrum One/
    );
  });

  it('successfully executes deposit on Arbitrum Sepolia when on testnet', async () => {
    useExchangeManager.setState({ currentNetwork: 'testnet' });

    const mockProviderOnSepolia = { _mockChainId: 421614 };
    const progressMessages: string[] = [];

    const res = await depositToHyperliquid(mockProviderOnSepolia, '25.5', progress => {
      progressMessages.push(progress.step);
    });

    expect(res.txHash).toBe('0xmockedtxhash123');
    expect(res.amount).toBe('25.5');
    expect(res.asset).toBe('USDC');
    expect(res.chainId).toBe(421614);
    expect(progressMessages).toContain('DEPOSITING');
  });

  it('successfully executes deposit on Arbitrum One when on mainnet', async () => {
    useExchangeManager.setState({ currentNetwork: 'mainnet' });

    const mockProviderOnMainnet = { _mockChainId: 42161 };

    const res = await depositToHyperliquid(mockProviderOnMainnet, '100');

    expect(res.txHash).toBe('0xmockedtxhash123');
    expect(res.amount).toBe('100');
    expect(res.asset).toBe('USDC');
    expect(res.chainId).toBe(42161);
  });
});
