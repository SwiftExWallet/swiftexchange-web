import { describe, expect, it } from 'vitest';

import {
  areSymbolsEqual,
  normalizeSymbol,
  toAsterSymbol,
  toExchangeSymbol,
  toHyperliquidCoin,
} from '../symbol';

describe('Symbol Normalizer', () => {
  it('normalizes various input formats to standard hyphenated UI symbol', () => {
    expect(normalizeSymbol('ETHUSDT')).toBe('ETH-USDT');
    expect(normalizeSymbol('btcusdc')).toBe('BTC-USDC');
    expect(normalizeSymbol('SOL-USDC')).toBe('SOL-USDC');
    expect(normalizeSymbol('AVAX')).toBe('AVAX-USDC');
    expect(normalizeSymbol('')).toBe('');
  });

  it('converts correctly to Aster symbol format', () => {
    expect(toAsterSymbol('ETH-USDT')).toBe('ETHUSDT');
    expect(toAsterSymbol('BTC-USDC')).toBe('BTCUSDT');
    expect(toAsterSymbol('SOL')).toBe('SOLUSDT');
    expect(toAsterSymbol('bnbusdt')).toBe('BNBUSDT');
  });

  it('converts correctly to Hyperliquid coin format', () => {
    expect(toHyperliquidCoin('ETH-USDC')).toBe('ETH');
    expect(toHyperliquidCoin('BTCUSDT')).toBe('BTC');
    expect(toHyperliquidCoin('SOL-USD')).toBe('SOL');
    expect(toHyperliquidCoin('kpepe')).toBe('KPEPE');
  });

  it('formats correctly based on active exchange', () => {
    expect(toExchangeSymbol('ETH-USDC', 'hyperliquid')).toBe('ETH');
    expect(toExchangeSymbol('ETH-USDC', 'aster')).toBe('ETHUSDT');
  });

  it('checks symbol equality across exchanges and notations', () => {
    expect(areSymbolsEqual('ETH-USDC', 'ETHUSDT')).toBe(true);
    expect(areSymbolsEqual('BTC', 'BTC-USDC')).toBe(true);
    expect(areSymbolsEqual('SOL-USDT', 'SOL')).toBe(true);
    expect(areSymbolsEqual('ETH', 'BTC')).toBe(false);
  });
});
