import { HttpTransport } from '@nktkas/hyperliquid';
import { fundingHistory, metaAndAssetCtxs } from '@nktkas/hyperliquid/api/info';

import { useExchangeManager } from '../../../core/ExchangeManager';
import { useTickerStore } from '../../../core/stores/tickerStore';
import { HyperliquidMapper } from '../mapper';

export interface HyperliquidFundingInfo {
  symbol: string;
  lastFundingRate: string;
  fundingIntervalHours: number;
  nextFundingTime: number;
  openInterest: string;
}

export interface HyperliquidFundingHistoryItem {
  symbol: string;
  fundingRate: string;
  fundingTime: number;
}

const getTransport = () => {
  const isTestnet = useExchangeManager.getState().currentNetwork === 'testnet';
  return new HttpTransport({ isTestnet });
};

export const getHyperliquidFundingRate = async (
  coinOrSymbol: string
): Promise<HyperliquidFundingInfo | null> => {
  try {
    const rawCoin = coinOrSymbol
      .split('-')[0]
      .replace(/USDC|USDT/g, '')
      .toUpperCase();
    const transport = getTransport();
    const [meta, assetCtxs] = await metaAndAssetCtxs({ transport });
    if (!meta?.universe || !Array.isArray(assetCtxs)) return null;

    const index = meta.universe.findIndex(u => u.name.toUpperCase() === rawCoin);
    if (index === -1) return null;

    const ctx = assetCtxs[index];
    const nextFundingTime = HyperliquidMapper.getNextFundingTime();
    const coinName = meta.universe[index].name;
    const uiSymbol = `${coinName}-USDC`;

    const existingCtx = useTickerStore.getState().getAssetCtx(uiSymbol);
    useTickerStore.getState().setAssetCtx(uiSymbol, {
      ...existingCtx,
      ...ctx,
      nextFundingTime,
    });

    return {
      symbol: uiSymbol,
      lastFundingRate: String(ctx.funding || '0'),
      fundingIntervalHours: 1,
      nextFundingTime,
      openInterest: String(ctx.openInterest || '0'),
    };
  } catch (error) {
    console.error('getHyperliquidFundingRate error', error);
    return null;
  }
};

export const getHyperliquidFundingHistory = async (
  coinOrSymbol: string,
  limit: number = 336
): Promise<HyperliquidFundingHistoryItem[]> => {
  try {
    const rawCoin = coinOrSymbol
      .split('-')[0]
      .replace(/USDC|USDT/g, '')
      .toUpperCase();
    const transport = getTransport();
    const startTime = Date.now() - limit * 3600 * 1000;
    const history = await fundingHistory({ transport }, { coin: rawCoin, startTime });
    if (!Array.isArray(history)) return [];

    return history.map(item => ({
      symbol: `${item.coin}-USDC`,
      fundingRate: String(item.fundingRate || '0'),
      fundingTime: Number(item.time || 0),
    }));
  } catch (error) {
    console.error('getHyperliquidFundingHistory error', error);
    return [];
  }
};
