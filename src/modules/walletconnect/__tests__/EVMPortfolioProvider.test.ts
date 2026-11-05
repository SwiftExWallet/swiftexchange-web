import { describe, expect, it, vi } from 'vitest';

import * as apiService from '../../../service/apiService';
import { EVMPortfolioProvider } from '../portfolio/providers/EVMPortfolioProvider';

describe('EVMPortfolioProvider Spam and Chain Resolution', () => {
  it('filters out spam/airdrop tokens and correctly parses all valid mainnet tokens', async () => {
    const userPayload = {
      address: '0x9dafd83899c3d01dec08a90a5d59fe5bd2f58cf2',
      totalValueUsd: '11.434508668230611',
      stale: false,
      syncStatus: 'idle',
      lastSyncedAt: '2026-09-17T06:17:45.193Z',
      lastSyncError: null,
      tokens: [
        {
          network: 'eth-mainnet',
          tokenAddress: null,
          symbol: 'ETH',
          name: 'Ethereum',
          decimals: 18,
          logo: null,
          balanceHex: '0x0000000000000000000000000000000000000000000000000002140eaa4aacad',
          balance: '0.000585003172539565',
          priceUsd: '2436.51',
          valueUsd: '1.4253660799243755',
        },
        {
          network: 'bnb-mainnet',
          tokenAddress: null,
          symbol: 'BNB',
          name: 'BNB',
          decimals: 18,
          logo: null,
          balanceHex: '0x000000000000000000000000000000000000000000000000000c3721388432e9',
          balance: '0.003438315542164201',
          priceUsd: '724.39',
          valueUsd: '2.4906813955883256',
        },
        {
          network: 'matic-mainnet',
          tokenAddress: null,
          symbol: 'POL',
          name: 'Polygon',
          decimals: 18,
          logo: null,
          balanceHex: '0x0000000000000000000000000000000000000000000000004ef87cb00ac68756',
          balance: '5.69043522471949295',
          priceUsd: '0.09595',
          valueUsd: '0.5459972598118353',
        },
        {
          network: 'arb-mainnet',
          tokenAddress: null,
          symbol: 'ETH',
          name: 'Ethereum',
          decimals: 18,
          logo: null,
          balanceHex: '0x0000000000000000000000000000000000000000000000000000039a546a6b3e',
          balance: '0.000003961376107326',
          priceUsd: '2436.51',
          valueUsd: '0.009651932499260872',
        },
        {
          network: 'base-mainnet',
          tokenAddress: null,
          symbol: 'ETH',
          name: 'Ethereum',
          decimals: 18,
          logo: null,
          balanceHex: '0x0000000000000000000000000000000000000000000000000001250d60746d61',
          balance: '0.000322214359756129',
          priceUsd: '2436.51',
          valueUsd: '0.785078509689406',
        },
        {
          network: 'avax-mainnet',
          tokenAddress: null,
          symbol: 'AVAX',
          name: 'Avalanche',
          decimals: 18,
          logo: null,
          balanceHex: '0x0000000000000000000000000000000000000000000000000320bcc0cc063fdc',
          balance: '0.225387517611229148',
          priceUsd: '7.508',
          valueUsd: '1.6922094822251086',
        },
        {
          network: 'opt-mainnet',
          tokenAddress: null,
          symbol: 'ETH',
          name: 'Ethereum',
          decimals: 18,
          logo: null,
          balanceHex: '0x0000000000000000000000000000000000000000000000000002be77231741ac',
          balance: '0.000772368852533676',
          priceUsd: '2436.51',
          valueUsd: '1.881884432886827',
        },
        // SPAM: optibase.website
        {
          network: 'opt-mainnet',
          tokenAddress: '0x041b572415ce92ef4e6d1f33e09ed4207599284e',
          symbol: 'optibase.website 🎁',
          name: 'optibase.website ✅ claim airdrop',
          decimals: 18,
          balance: '3320',
          priceUsd: null,
          valueUsd: null,
        },
        // SPAM: 4SnowBall
        {
          network: 'bnb-mainnet',
          tokenAddress: '0x09ed1b0ef4e6fdd66291bc9bdbb9655e3403e196',
          symbol: '4SnowBall',
          name: '雪球回购销毁模式',
          decimals: 18,
          balance: '5000',
          priceUsd: null,
          valueUsd: null,
        },
        // SPAM: SpaceXcoin
        {
          network: 'bnb-mainnet',
          tokenAddress: '0x0b175544cf87bf3f17df828b1156a44018b328fa',
          symbol: 'SpaceXcoin',
          name: 'SpaceXcoin',
          decimals: 18,
          balance: '21153.21',
          priceUsd: null,
          valueUsd: null,
        },
        // SPAM: fake USDC phishing
        {
          network: 'base-mainnet',
          tokenAddress: '0x0e8eef6b9b9fc299c0e79464dc3f4485bfbfc5aa',
          symbol: 'U S D C ✅ ( t.me/s/us_pool )',
          name: '✅CIRCLE: t.me/s/us_pool',
          decimals: 0,
          balance: '1',
          priceUsd: null,
          valueUsd: null,
        },
        // SPAM DUST: 1INCH with $0.00000006
        {
          network: 'eth-mainnet',
          tokenAddress: '0x111111111117dc0aa78b770fa6a738034120c302',
          symbol: '1INCH',
          name: '1inch Network',
          decimals: 18,
          balance: '0.000000767915606282',
          priceUsd: '0.08929441856784003',
          valueUsd: '6.857057757212155e-8',
        },
        // SPAM: SROS
        {
          network: 'base-mainnet',
          tokenAddress: '0x4e49c01553a78a06b859d040f2498931945156a0',
          symbol: 'SROS',
          name: 'STRATEGIC RUSIAN OIL SUPPLY',
          decimals: 18,
          balance: '25',
          priceUsd: null,
          valueUsd: null,
        },
        // REAL: LINK
        {
          network: 'eth-mainnet',
          tokenAddress: '0x514910771af9ca656af840dff83e8264ecf986ca',
          symbol: 'LINK',
          name: 'Chainlink',
          decimals: 18,
          balance: '0.096626129630545888',
          priceUsd: '11.149012543040376',
          valueUsd: '1.0772859312364014',
        },
        // REAL: Polygon USDC
        {
          network: 'matic-mainnet',
          tokenAddress: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
          symbol: 'USDC',
          name: 'USDC',
          decimals: 6,
          balance: '4.022412',
          priceUsd: null,
          valueUsd: null,
        },
        // REAL: OP on Optimism
        {
          network: 'opt-mainnet',
          tokenAddress: '0x4200000000000000000000000000000000000042',
          symbol: 'OP',
          name: 'Optimism',
          decimals: 18,
          balance: '0.99',
          priceUsd: '0.0959452384775265',
          valueUsd: '0.09498578609275124',
        },
        // REAL: G9B
        {
          network: 'bnb-mainnet',
          tokenAddress: '0x46ceefda28dd7207059ed19b0acdc026955bb15c',
          symbol: 'G9B',
          name: 'G9B',
          decimals: 18,
          balance: '0.055905213130829737',
          priceUsd: '22.036318608772728',
          valueUsd: '1.2319450884423089',
        },
        // REAL: AP7B
        {
          network: 'bnb-mainnet',
          tokenAddress: '0x431a3bee82e2ca41e49895cbece5bb0f76a89b7a',
          symbol: 'AP7B',
          name: 'AP7B',
          decimals: 18,
          balance: '0.000598580741539605',
          priceUsd: '333.158509828486',
          valueUsd: '0.19942226786336495',
        },
      ],
    };

    vi.spyOn(apiService, 'fetchApiResponseFromServer').mockResolvedValueOnce({
      data: userPayload as any,
    });

    const provider = new EVMPortfolioProvider();
    const assets = await provider.fetch({
      connectedWallets: {
        evm: { address: '0x9dafd83899c3d01dec08a90a5d59fe5bd2f58cf2' },
      },
      network: 'mainnet',
    });

    // Verify all spam tokens are excluded
    const symbols = assets.map(a => a.symbol);
    expect(symbols).not.toContain('optibase.website 🎁');
    expect(symbols).not.toContain('4SnowBall');
    expect(symbols).not.toContain('SpaceXcoin');
    expect(symbols).not.toContain('U S D C ✅ ( t.me/s/us_pool )');
    expect(symbols).not.toContain('1INCH'); // filtered due to dust < $0.05
    expect(symbols).not.toContain('SROS');

    // Verify real tokens across multiple chains are kept
    expect(symbols).toContain('ETH');
    expect(symbols).toContain('BNB');
    expect(symbols).toContain('POL');
    expect(symbols).toContain('AVAX');
    expect(symbols).toContain('LINK');
    expect(symbols).toContain('USDC');
    expect(symbols).toContain('OP');
    expect(symbols).toContain('G9B');
    expect(symbols).toContain('AP7B');

    // Verify Polygon USDC defaulted to unit price 1.0
    const polygonUsdc = assets.find(a => a.chainId === 137 && a.symbol === 'USDC');
    expect(polygonUsdc).toBeDefined();
    expect(polygonUsdc?.current_price).toBe(1.0);
    expect(polygonUsdc?.balance).toBeCloseTo(4.022412);

    // Verify chains were properly resolved (Ethereum, Binance, Polygon, Arbitrum, Base, Avalanche, Optimism)
    const chainIds = new Set(assets.map(a => a.chainId));
    expect(chainIds.has(1)).toBe(true); // Ethereum
    expect(chainIds.has(56)).toBe(true); // BNB
    expect(chainIds.has(137)).toBe(true); // Polygon
    expect(chainIds.has(42161)).toBe(true); // Arbitrum
    expect(chainIds.has(8453)).toBe(true); // Base
    expect(chainIds.has(43114)).toBe(true); // Avalanche
    expect(chainIds.has(10)).toBe(true); // Optimism
  });
});
