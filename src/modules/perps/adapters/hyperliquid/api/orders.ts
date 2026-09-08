import { HttpTransport } from '@nktkas/hyperliquid';
import {
  cancel,
  order,
  updateIsolatedMargin,
  updateLeverage,
} from '@nktkas/hyperliquid/api/exchange';
import { meta, openOrders } from '@nktkas/hyperliquid/api/info';
import type { Wallet } from 'ethers';

import { useExchangeManager } from '../../../core/ExchangeManager';

export interface HyperliquidOrderRequest {
  symbol: string;
  side: 'BUY' | 'SELL';
  type:
    | 'LIMIT'
    | 'MARKET'
    | 'STOP'
    | 'STOP_MARKET'
    | 'TAKE_PROFIT'
    | 'TAKE_PROFIT_MARKET'
    | 'POST_ONLY';
  price: string | number;
  size: string | number;
  reduceOnly?: boolean;
  timeInForce?: 'GTC' | 'IOC' | 'FOK' | 'GTX' | 'ALO' | 'FrontendMarket';
  stopPrice?: string | number;
  currentPrice?: number;
}

let cachedUniverse: { name: string; szDecimals: number; maxLeverage: number }[] | null = null;
let lastUniverseFetch = 0;

export async function getHyperliquidUniverse(
  isTestnet: boolean
): Promise<{ name: string; szDecimals: number; maxLeverage: number }[]> {
  const now = Date.now();
  if (cachedUniverse && now - lastUniverseFetch < 300000) {
    return cachedUniverse;
  }

  const transport = new HttpTransport({ isTestnet });
  const metaData = await meta({ transport });
  if (metaData && Array.isArray(metaData.universe)) {
    cachedUniverse = metaData.universe;
    lastUniverseFetch = now;
    return cachedUniverse;
  }
  return [];
}

export async function getHyperliquidAssetId(symbol: string, isTestnet: boolean): Promise<number> {
  const coin = symbol
    .split('-')[0]
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
  const universe = await getHyperliquidUniverse(isTestnet);
  const index = universe.findIndex(u => u.name.toUpperCase() === coin);
  if (index === -1) {
    throw new Error(`Hyperliquid asset not found for symbol: ${symbol} (coin: ${coin})`);
  }
  return index;
}

export function formatHyperliquidPrice(price: number | string): string {
  const num = typeof price === 'string' ? parseFloat(price) : price;
  if (isNaN(num) || num <= 0) return '0';
  if (num >= 10000) return num.toFixed(1);
  if (num >= 1000) return num.toFixed(2);
  if (num >= 100) return num.toFixed(3);
  if (num >= 1) return num.toFixed(4);
  if (num >= 0.01) return num.toFixed(5);
  return num.toFixed(6);
}

export function formatHyperliquidSize(size: number | string, szDecimals: number = 4): string {
  const num = typeof size === 'string' ? parseFloat(size) : size;
  if (isNaN(num) || num <= 0) return '0';
  return num.toFixed(szDecimals);
}

/**
 * Places an authentic order on Hyperliquid AppChain via @nktkas/hyperliquid
 */
export async function placeHyperliquidOrder(
  wallet: Wallet,
  req: HyperliquidOrderRequest,
  isTestnet: boolean = useExchangeManager.getState().currentNetwork === 'testnet'
): Promise<any> {
  const transport = new HttpTransport({ isTestnet });
  const universe = await getHyperliquidUniverse(isTestnet);
  const assetId = await getHyperliquidAssetId(req.symbol, isTestnet);
  const universeItem = universe[assetId];
  const szDecimals = universeItem?.szDecimals ?? 4;

  const isBuy = req.side.toUpperCase() === 'BUY';
  const sizeFormatted = formatHyperliquidSize(req.size, szDecimals);
  const reduceOnly = Boolean(req.reduceOnly);

  let limitPx: string;
  let orderTypeObj: any;

  if (req.type === 'MARKET') {
    const curPx =
      req.currentPrice || (typeof req.price === 'string' ? parseFloat(req.price) : req.price);
    // Apply 5% slippage protection for market execution
    const slipPrice = isBuy ? curPx * 1.05 : curPx * 0.95;
    limitPx = formatHyperliquidPrice(slipPrice);
    orderTypeObj = { limit: { tif: 'FrontendMarket' } };
  } else if (req.type === 'POST_ONLY') {
    limitPx = formatHyperliquidPrice(req.price);
    orderTypeObj = { limit: { tif: 'Alo' } };
  } else if (req.type === 'STOP_MARKET' || req.type === 'STOP') {
    const triggerPx = formatHyperliquidPrice(req.stopPrice || req.price);
    limitPx = formatHyperliquidPrice(req.price || req.stopPrice || 0);
    orderTypeObj = {
      trigger: {
        isMarket: req.type === 'STOP_MARKET',
        triggerPx,
        tpsl: 'sl',
      },
    };
  } else if (req.type === 'TAKE_PROFIT_MARKET' || req.type === 'TAKE_PROFIT') {
    const triggerPx = formatHyperliquidPrice(req.stopPrice || req.price);
    limitPx = formatHyperliquidPrice(req.price || req.stopPrice || 0);
    orderTypeObj = {
      trigger: {
        isMarket: req.type === 'TAKE_PROFIT_MARKET',
        triggerPx,
        tpsl: 'tp',
      },
    };
  } else {
    // Standard LIMIT
    limitPx = formatHyperliquidPrice(req.price);
    const tif = req.timeInForce === 'IOC' ? 'Ioc' : req.timeInForce === 'ALO' ? 'Alo' : 'Gtc';
    orderTypeObj = { limit: { tif } };
  }

  const payload = {
    orders: [
      {
        a: assetId,
        b: isBuy,
        p: limitPx,
        s: sizeFormatted,
        r: reduceOnly,
        t: orderTypeObj,
      },
    ],
    grouping: 'na' as const,
  };

  const response: any = await order({ transport, wallet: wallet as any }, payload);

  if (response?.status === 'err') {
    throw new Error(
      typeof response.response === 'string' ? response.response : 'Hyperliquid order rejected'
    );
  }

  // Check order statuses
  const statuses = response?.response?.data?.statuses;
  if (Array.isArray(statuses) && statuses.length > 0) {
    const firstStatus: any = statuses[0];
    if (typeof firstStatus === 'object' && firstStatus !== null && 'error' in firstStatus) {
      const errMsg =
        typeof firstStatus.error === 'string'
          ? firstStatus.error
          : JSON.stringify(firstStatus.error);
      throw new Error(errMsg || 'Hyperliquid order execution error');
    }
  }

  return response;
}

/**
 * Cancels a single order on Hyperliquid
 */
export async function cancelHyperliquidOrder(
  wallet: Wallet,
  symbol: string,
  orderId: string | number,
  isTestnet: boolean = useExchangeManager.getState().currentNetwork === 'testnet'
): Promise<any> {
  const transport = new HttpTransport({ isTestnet });
  const assetId = await getHyperliquidAssetId(symbol, isTestnet);

  const payload = {
    cancels: [
      {
        a: assetId,
        o: Number(orderId),
      },
    ],
  };

  const res: any = await cancel({ transport, wallet: wallet as any }, payload);
  if (res?.status === 'err') {
    throw new Error(
      typeof res.response === 'string' ? res.response : 'Failed to cancel order on Hyperliquid'
    );
  }
  return res;
}

/**
 * Cancels all open orders for a specific symbol or all symbols on Hyperliquid
 */
export async function cancelAllHyperliquidOrders(
  wallet: Wallet,
  userAddr: string,
  symbol?: string,
  isTestnet: boolean = useExchangeManager.getState().currentNetwork === 'testnet'
): Promise<void> {
  const transport = new HttpTransport({ isTestnet });
  const orders = await openOrders({ transport }, { user: userAddr as `0x${string}` });
  if (!orders || orders.length === 0) return;

  const targetCoin = symbol ? symbol.split('-')[0].toUpperCase() : null;
  const filtered = targetCoin ? orders.filter(o => o.coin.toUpperCase() === targetCoin) : orders;
  if (filtered.length === 0) return;

  const universe = await getHyperliquidUniverse(isTestnet);
  const coinToAssetId = new Map(universe.map((u, i) => [u.name.toUpperCase(), i]));

  const cancels = filtered
    .map(o => {
      const a = coinToAssetId.get(o.coin.toUpperCase());
      if (a === undefined) return null;
      return { a, o: o.oid };
    })
    .filter((c): c is { a: number; o: number } => c !== null);

  if (cancels.length > 0) {
    await cancel({ transport, wallet: wallet as any }, { cancels });
  }
}

/**
 * Updates leverage and margin mode (cross vs isolated) on Hyperliquid
 */
export async function updateHyperliquidLeverage(
  wallet: Wallet,
  symbol: string,
  leverage: number,
  isCross: boolean,
  isTestnet: boolean = useExchangeManager.getState().currentNetwork === 'testnet'
): Promise<any> {
  const transport = new HttpTransport({ isTestnet });
  const assetId = await getHyperliquidAssetId(symbol, isTestnet);

  const res: any = await updateLeverage(
    { transport, wallet: wallet as any },
    {
      asset: assetId,
      isCross,
      leverage,
    }
  );

  if (res?.status === 'err') {
    throw new Error(
      typeof res.response === 'string' ? res.response : 'Failed to update leverage on Hyperliquid'
    );
  }

  return res;
}

/**
 * Adds or removes isolated margin for a position on Hyperliquid
 */
export async function updateHyperliquidIsolatedMargin(
  wallet: Wallet,
  symbol: string,
  marginDeltaUsd: number,
  isBuy: boolean = true,
  isTestnet: boolean = useExchangeManager.getState().currentNetwork === 'testnet'
): Promise<any> {
  const transport = new HttpTransport({ isTestnet });
  const assetId = await getHyperliquidAssetId(symbol, isTestnet);

  const res: any = await updateIsolatedMargin(
    { transport, wallet: wallet as any },
    {
      asset: assetId,
      isBuy,
      ntli: marginDeltaUsd,
    }
  );

  if (res?.status === 'err') {
    throw new Error(
      typeof res.response === 'string'
        ? res.response
        : 'Failed to update isolated margin on Hyperliquid'
    );
  }

  return res;
}
