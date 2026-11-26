import { describe, expect, it } from 'vitest';

import { RWA_ASSETS, llamaKey, validateAssets } from '../data/assets';
import { buildGroups, listRows, partitionGroups } from '../data/groups';
import { applyUpdate, canStartOrder, mapFusionStatus } from '../orders/orderState';
import { cleanAmountInput, fmtUsd, fromUnits, gteUnits, toUnits } from '../utils/amounts';
import { assetMarketStatus, usSession, xstocksStatus } from '../utils/marketHours';
import { quoteFigures } from '../utils/quoteMath';
import { isAssetAllowed, visibleAssets } from '../utils/regions';
import { closedText, fmtHolding, isDust, pickRoute, rateText, usdToSpend } from '../utils/swapForm';
import { payOptionsFor, tradeChecks } from '../utils/tradeRules';

describe('RWA assets & grouping', () => {
  it('loads and validates bundled RWA_ASSETS', () => {
    expect(RWA_ASSETS.length).toBeGreaterThan(100);
    const { dropped } = validateAssets(RWA_ASSETS);
    expect(dropped).toHaveLength(0);
  });

  it('builds DefiLlama keys for ETH, BSC, and XLM', () => {
    const eth = RWA_ASSETS.find(a => a.chain === 'ETH');
    const bsc = RWA_ASSETS.find(a => a.chain === 'BSC');
    expect(llamaKey(eth)).toMatch(/^ethereum:0x[0-9a-f]{40}$/);
    expect(llamaKey(bsc)).toMatch(/^bsc:0x[0-9a-f]{40}$/);
  });

  it('groups multi-chain assets and partitions cleanly', () => {
    const groups = buildGroups(RWA_ASSETS);
    const parts = partitionGroups(groups);
    expect(parts.popular.length).toBeGreaterThan(0);
    const rows = listRows(parts, { chip: 'all', query: '' });
    expect(rows.some(r => r.type === 'header' && r.title === 'Popular')).toBe(true);
    const aapl = listRows(parts, { chip: 'all', query: 'AAPL' });
    expect(aapl.some(r => r.type === 'asset' && r.group.symbol.includes('AAPL'))).toBe(true);
  });
});

describe('RWA regions (fail-closed)', () => {
  it('blocks unknown countries, US, EEA, and sanctioned countries for ondo', () => {
    const ondo = { regions: 'ondo' as const };
    expect(isAssetAllowed(ondo, null)).toBe(false);
    expect(isAssetAllowed(ondo, '')).toBe(false);
    expect(isAssetAllowed(ondo, 'US')).toBe(false);
    expect(isAssetAllowed(ondo, 'DE')).toBe(false);
    expect(isAssetAllowed(ondo, 'IR')).toBe(false);
    expect(isAssetAllowed(ondo, 'IN')).toBe(true);
    expect(isAssetAllowed(ondo, 'AE')).toBe(true);
  });

  it('filters visibleAssets by country', () => {
    const filtered = visibleAssets(RWA_ASSETS, 'US');
    expect(filtered).toHaveLength(0);
    const allowedIn = visibleAssets(RWA_ASSETS, 'IN');
    expect(allowedIn.length).toBe(RWA_ASSETS.length);
  });
});

describe('RWA amounts & math', () => {
  it('cleans and converts units accurately', () => {
    expect(cleanAmountInput('12.3456789', 6)).toBe('12.345678');
    expect(toUnits('1.5', 6)).toBe('1500000');
    expect(fromUnits('1500000', 6)).toBe('1.5');
    expect(gteUnits('1500000', '1000000')).toBe(true);
    expect(fmtUsd(123.456)).toBe('$123.46');
  });

  it('computes quote figures and trade rules', () => {
    const figs = quoteFigures({
      side: 'buy',
      amountIn: '100',
      out: '0.5',
      fee: '0.005',
      marketPrice: 198,
    });
    expect(figs.effectivePrice).toBe(200);
    expect(figs.feePct).toBeCloseTo((0.005 / 0.505) * 100, 4);

    const xAsset = RWA_ASSETS.find(a => a.issuer === 'xstocks')!;
    expect(
      tradeChecks({ asset: xAsset, side: 'buy', amount: '10', unitPriceUsd: 1 }).error
    ).toContain('$20');
    expect(
      tradeChecks({ asset: xAsset, side: 'buy', amount: '25', unitPriceUsd: 1 }).error
    ).toBeNull();

    const ondoAsset = RWA_ASSETS.find(a => a.issuer === 'ondo' && a.chain === 'ETH')!;
    expect(payOptionsFor(ondoAsset).map(p => p.symbol)).toEqual(['USDC']);
  });
});

describe('RWA market hours & swap form', () => {
  it('handles 24-7 assets and US sessions', () => {
    expect(assetMarketStatus({ marketHours: '24-7' }).open).toBe(true);
    // Saturday in UTC
    const sat = new Date('2026-11-28T15:00:00Z');
    expect(usSession(sat)).toBe('closed');
    expect(xstocksStatus({ isTradingHalted: true })?.status).toBe('halted');
    expect(closedText({ status: 'halted', label: 'Halted', open: false })).toBe('Paused');
  });

  it('handles swap form helpers', () => {
    expect(usdToSpend({ side: 'buy', usd: '50', price: 200, decimals: 6 })).toBe('50');
    expect(usdToSpend({ side: 'sell', usd: '100', price: 200, decimals: 18 })).toBe('0.5');
    expect(rateText({ side: 'buy', symbol: 'AAPL', amountIn: '200', amountOut: '1' })).toBe(
      '1 AAPL = $200.00'
    );
    expect(fmtHolding(0.0000001, 6)).toBe('<0.000001');
    expect(isDust(0.0001, 10)).toBe(true);
    const route = pickRoute({
      side: 'buy',
      chains: ['ETH', 'BSC'],
      payOptionsByChain: {
        ETH: [{ symbol: 'USDC', address: '0x1', decimals: 6 }],
        BSC: [{ symbol: 'USDC', address: '0x2', decimals: 18 }],
      },
      balances: { ETH: { USDC: 500 }, BSC: { USDC: 10 } },
    });
    expect(route).toEqual({ chain: 'ETH', paySym: 'USDC' });
  });
});

describe('RWA order state machine', () => {
  it('maps 1inch statuses and tracks balance fallback', () => {
    expect(mapFusionStatus('filled')).toEqual({ stage: 'filled' });
    expect(mapFusionStatus('partially-filled')).toEqual({ stage: 'filling' });
    const rec: any = {
      id: '1',
      stage: 'submitted',
      outBalanceBefore: '1000',
      minOut: '100',
      expiresAt: Date.now() + 60000,
    };
    const updated = applyUpdate(rec, {
      status: 'not-enough-balance-or-allowance',
      outBalance: '1100',
    });
    expect(updated.stage).toBe('filled');
    expect(updated.filledBy).toBe('balance');
    expect(canStartOrder([updated])).toEqual({ ok: true });
  });
});
