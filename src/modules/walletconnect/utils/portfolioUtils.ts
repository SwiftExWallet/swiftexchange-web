import BigNumber from 'bignumber.js';

import { formatMarketPrice, formatNumericWithCommas } from '../../../utils/BigNumberUtils';
import { type Asset } from '../store/portfolioStore';

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

const PRICE_CACHE_TTL = 60_000; // 1 minutes
const priceCache = new Map<
  string,
  { usd: number; usd_24h_change: number; sparkline?: number[]; timestamp: number }
>();
let coingeckoCooldownUntil = 0;

const STABLECOIN_PRICES: Record<string, { usd: number; usd_24h_change: number }> = {
  USDC: { usd: 1.0, usd_24h_change: 0 },
  USDT: { usd: 1.0, usd_24h_change: 0 },
  DAI: { usd: 1.0, usd_24h_change: 0 },
  EURC: { usd: 1.08, usd_24h_change: 0 },
};

const BINANCE_PAIR_MAP: Record<string, string> = {
  XLM: 'XLMUSDT',
  BTC: 'BTCUSDT',
  WBTC: 'BTCUSDT',
  ETH: 'ETHUSDT',
  AVAX: 'AVAXUSDT',
  MATIC: 'MATICUSDT',
  BSC: 'BNBUSDT',
  TRX: 'TRXUSDT',
  DYDX: 'DYDXUSDT',
};

async function fetchBinanceFallback(
  symbols: string[]
): Promise<Record<string, { usd: number; usd_24h_change: number }>> {
  const pairsToFetch: { symbol: string; pair: string }[] = [];
  symbols.forEach(s => {
    const pair = BINANCE_PAIR_MAP[s.toUpperCase()];
    if (pair) pairsToFetch.push({ symbol: s.toUpperCase(), pair });
  });

  if (pairsToFetch.length === 0) return {};

  try {
    const query = JSON.stringify(pairsToFetch.map(p => p.pair));
    const response = await fetch(
      `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(query)}`
    );
    if (!response.ok) return {};
    const data = await response.json();
    const result: Record<string, { usd: number; usd_24h_change: number }> = {};
    if (Array.isArray(data)) {
      data.forEach((item: any) => {
        const match = pairsToFetch.find(p => p.pair === item.symbol);
        if (match) {
          result[match.symbol] = {
            usd: parseFloat(item.lastPrice) || 0,
            usd_24h_change: parseFloat(item.priceChangePercent) || 0,
          };
        }
      });
    }
    return result;
  } catch {
    return {};
  }
}

export const portfolioUtils = {
  calculateTotalUSD(assets: Asset[]): number {
    return assets.reduce((total, asset) => {
      const value = (asset.balance || 0) * (asset.current_price || 0);
      return total + value;
    }, 0);
  },

  calculatePortfolioChange(assets: Asset[]): number {
    let totalValue = 0;
    let weightedChange = 0;
    for (const asset of assets) {
      if (asset.balance && (asset.current_price || 0) > 0) {
        const assetValue = asset.balance * asset.current_price;
        totalValue += assetValue;
        weightedChange += assetValue * (asset.price_change_percentage_24h || 0);
      }
    }
    return totalValue > 0 ? weightedChange / totalValue : 0;
  },

  formatBalance(balance: number | string | null | undefined): string {
    if (balance === null || balance === undefined) return '0.00';
    try {
      const bn = new BigNumber(balance);
      if (bn.isNaN()) return '0.00';
      if (bn.isZero()) return '0.00';

      const abs = bn.abs();
      let formatted: string;

      if (abs.gte(1)) {
        formatted = bn.toFormat(2, BigNumber.ROUND_DOWN);
      } else if (abs.gte(0.0001)) {
        formatted = bn.toFormat(4, BigNumber.ROUND_DOWN);
      } else {
        const str = bn.toFixed();
        const match = str.match(/\.0*([1-9])/);
        if (match) {
          const firstSigDigitIndex = match[0].length - 1;
          formatted = bn.toFormat(Math.min(20, firstSigDigitIndex + 2), BigNumber.ROUND_HALF_UP);
          if (formatted.includes('.')) {
            formatted = formatted.replace(/0+$/, '').replace(/\.$/, '');
          }
        } else {
          formatted = '0.00';
        }
      }

      return formatted;
    } catch (error) {
      console.error('[portfolioUtils] formatBalance error:', error);
      return '0';
    }
  },

  formatUSD(value: number | string | null | undefined): string {
    if (value === null || value === undefined) return '$0.00';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (num < 0.01 && num > 0) {
      return formatMarketPrice(value, '$');
    }
    return formatNumericWithCommas(value, 2, '$');
  },

  async fetchBatchPrices(
    symbols: string[]
  ): Promise<Record<string, { usd: number; usd_24h_change: number; sparkline?: number[] }>> {
    const COMMON_TOKENS: Record<string, string> = {
      XLM: 'stellar',
      USDC: 'usd-coin',
      USDT: 'tether',
      BTC: 'bitcoin',
      ETH: 'ethereum',
      AQUA: 'aquarius',
      YXLM: 'yxlm',
      EURC: 'euro-coin',
      DAI: 'dai',
      WBTC: 'wrapped-bitcoin',
      BSC: 'binancecoin',
      MATIC: 'matic-network',
      AVAX: 'avalanche-2',
      TRX: 'tron',
      DYDX: 'dydx',
    };

    const now = Date.now();
    const result: Record<string, { usd: number; usd_24h_change: number; sparkline?: number[] }> =
      {};
    const missingSymbols: string[] = [];

    // 1. Check in-memory cache and stablecoins
    symbols.forEach(rawSymbol => {
      const sym = rawSymbol.toUpperCase();
      if (STABLECOIN_PRICES[sym]) {
        result[sym] = { ...STABLECOIN_PRICES[sym] };
        return;
      }
      const cached = priceCache.get(sym);
      if (cached && now - cached.timestamp < PRICE_CACHE_TTL) {
        result[sym] = {
          usd: cached.usd,
          usd_24h_change: cached.usd_24h_change,
          sparkline: cached.sparkline,
        };
      } else {
        missingSymbols.push(sym);
      }
    });

    if (missingSymbols.length === 0) {
      return result;
    }

    // 2. Fetch missing symbols via CoinGecko if not in cooldown
    if (now >= coingeckoCooldownUntil) {
      const idsToFetch = Array.from(new Set(missingSymbols.map(s => COMMON_TOKENS[s]))).filter(
        Boolean
      );

      if (idsToFetch.length > 0) {
        try {
          const response = await fetch(
            `${COINGECKO_BASE}/coins/markets?vs_currency=usd&ids=${idsToFetch.join(',')}&sparkline=true`
          );
          if (response.ok) {
            const data = await response.json();
            const dataMap = data.reduce((acc: any, item: any) => {
              acc[item.id] = item;
              return acc;
            }, {});

            missingSymbols.forEach(symbol => {
              const id = COMMON_TOKENS[symbol];
              if (id && dataMap[id]) {
                const itemData = {
                  usd: dataMap[id].current_price,
                  usd_24h_change: dataMap[id].price_change_percentage_24h || 0,
                  sparkline: dataMap[id].sparkline_in_7d?.price,
                };
                result[symbol] = itemData;
                priceCache.set(symbol, { ...itemData, timestamp: now });
              }
            });
          } else {
            // CoinGecko returned non-ok (e.g. 429 Too Many Requests)
            coingeckoCooldownUntil = Date.now() + 120_000;
          }
        } catch {
          // Network / CORS / 429 failure
          coingeckoCooldownUntil = Date.now() + 120_000;
        }
      }
    }

    // 3. Fallback to Binance for any remaining unresolved symbols
    const remainingToFetch = missingSymbols.filter(s => !result[s]);
    if (remainingToFetch.length > 0) {
      try {
        const binancePrices = await fetchBinanceFallback(remainingToFetch);
        Object.entries(binancePrices).forEach(([sym, data]) => {
          result[sym] = data;
          priceCache.set(sym, { ...data, timestamp: now });
        });
      } catch {
        // Silently continue
      }
    }

    return result;
  },
};
