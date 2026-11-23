import { HttpTransport } from '@nktkas/hyperliquid';
import {
  historicalOrders,
  openOrders,
  userFills,
  userFillsByTime,
  userFunding,
  userNonFundingLedgerUpdates,
} from '@nktkas/hyperliquid/api/info';
import BigNumber from 'bignumber.js';

import { useExchangeManager } from '../../../core/ExchangeManager';
import type { DepositWithdrawRecord } from '../../aster/api/account';
import type { AsterUserTrade } from '../../aster/types/account';
import type { AsterOrderResponse, OrderSide, OrderType } from '../../aster/types/orders';

export interface HyperliquidFundingRecord {
  time: number;
  coin: string;
  size: string;
  side: 'Long' | 'Short';
  payment: string;
  rate: string;
  hash: string;
}

const getTransport = () => {
  const isTestnet = useExchangeManager.getState().currentNetwork === 'testnet';
  return new HttpTransport({ isTestnet });
};

export const getHyperliquidOpenOrders = async (userAddr: string): Promise<AsterOrderResponse[]> => {
  try {
    const transport = getTransport();
    const data = await openOrders({ transport }, { user: userAddr as `0x${string}` });
    return data.map((o: any) => {
      const coin = o.coin || '';
      const symbol = coin.includes('-') ? coin : `${coin}-USDC`;
      return {
        orderId: o.oid,
        symbol,
        status: 'NEW',
        clientOrderId: '',
        price: o.limitPx,
        avgPrice: '0',
        origQty: o.sz,
        executedQty: '0',
        cumQty: '0',
        cumQuote: '0',
        timeInForce: 'GTC' as any,
        type: 'LIMIT',
        origType: 'LIMIT',
        side: o.side === 'A' ? 'SELL' : 'BUY',
        positionSide: 'BOTH',
        stopPrice: '0',
        closePosition: o.reduceOnly || false,
        updateTime: o.timestamp || Date.now(),
        workingType: 'CONTRACT_PRICE' as any,
        priceProtect: false,
        reduceOnly: o.reduceOnly || false,
      };
    });
  } catch (err) {
    console.error('getHyperliquidOpenOrders error', err);
    return [];
  }
};

export const getHyperliquidHistoricalOrders = async (
  userAddr: string,
  options?: { endTime?: number; limit?: number }
): Promise<AsterOrderResponse[]> => {
  try {
    const transport = getTransport();
    const data = await historicalOrders({ transport }, { user: userAddr as `0x${string}` });

    let filtered = data;
    if (options?.endTime) {
      filtered = data.filter(o => o.order.timestamp <= options.endTime!);
    }

    let mapped: AsterOrderResponse[] = filtered.map(item => {
      const o = item.order;

      let mappedStatus = 'NEW';
      if (item.status === 'filled') mappedStatus = 'FILLED';
      if (item.status === 'canceled' || item.status.includes('Canceled')) mappedStatus = 'CANCELED';
      if (item.status.includes('Rejected')) mappedStatus = 'REJECTED';

      const coin = o.coin || '';
      const symbol = coin.includes('-') ? coin : `${coin}-USDC`;
      const orderQty = o.origSz || o.sz || '0';
      const executedQty =
        mappedStatus === 'FILLED'
          ? orderQty
          : new BigNumber(orderQty)
              .minus(o.sz || '0')
              .abs()
              .toFixed();
      const priceNum = o.limitPx && o.limitPx !== '0' ? o.limitPx : o.triggerPx || '0';
      const cumQuote = new BigNumber(executedQty).times(priceNum).toFixed(2);

      let direction = '';
      if (o.reduceOnly) {
        direction = o.side === 'A' ? 'Close Long' : 'Close Short';
      } else {
        direction = o.side === 'B' ? 'Long' : 'Short';
      }

      return {
        orderId: o.oid,
        symbol,
        status: mappedStatus as any,
        clientOrderId: o.cloid || '',
        price: o.limitPx,
        avgPrice: priceNum,
        origQty: orderQty,
        executedQty,
        cumQty: executedQty,
        cumQuote,
        timeInForce: (o.tif || 'GTC').toUpperCase() as any,
        type: (o.orderType === 'Limit'
          ? 'LIMIT'
          : o.orderType?.toUpperCase().includes('STOP')
            ? 'STOP_MARKET'
            : 'MARKET') as OrderType,
        origType: (o.orderType === 'Limit'
          ? 'LIMIT'
          : o.orderType?.toUpperCase().includes('STOP')
            ? 'STOP_MARKET'
            : 'MARKET') as OrderType,
        side: (o.side === 'A' ? 'SELL' : 'BUY') as OrderSide,
        positionSide: 'BOTH',
        stopPrice: o.triggerPx || '0',
        closePosition: o.reduceOnly || false,
        updateTime: item.statusTimestamp || o.timestamp,
        time: o.timestamp,
        workingType: 'CONTRACT_PRICE' as any,
        priceProtect: false,
        reduceOnly: o.reduceOnly || false,
        triggerCondition: o.triggerCondition,
        direction,
        rawOrderType: o.orderType,
      } as unknown as AsterOrderResponse;
    });

    if (options?.limit) {
      mapped = mapped.slice(0, options.limit);
    }
    return mapped as unknown as AsterOrderResponse[];
  } catch (err) {
    console.error('getHyperliquidHistoricalOrders error', err);
    return [];
  }
};

export const getHyperliquidUserFills = async (
  userAddr: string,
  options?: { endTime?: number; limit?: number }
): Promise<AsterUserTrade[]> => {
  try {
    const transport = getTransport();
    let data: any[] = [];

    if (options?.endTime) {
      const startTime = Date.now() - 365 * 24 * 60 * 60 * 1000;
      data = await userFillsByTime(
        { transport },
        {
          user: userAddr as `0x${string}`,
          startTime,
          endTime: options.endTime,
        }
      );
    } else {
      data = await userFills({ transport }, { user: userAddr as `0x${string}` });
    }

    data.sort((a, b) => (b.time || 0) - (a.time || 0));

    if (options?.endTime) {
      data = data.filter(f => f.time <= options.endTime!);
    }

    let mapped = data.map(f => {
      const fillId =
        (f as any).tid !== undefined && (f as any).tid !== null
          ? String((f as any).tid)
          : f.hash
            ? `${f.hash}-${f.oid}`
            : `${f.oid}-${f.time}`;
      const quoteQty = new BigNumber(f.px || 0).times(f.sz || 0).toFixed(2);
      const coin = f.coin || '';
      const symbol = coin.includes('-') ? coin : `${coin}-USDC`;

      return {
        id: fillId,
        orderId: f.oid,
        symbol,
        price: f.px,
        qty: f.sz,
        quoteQty,
        realizedPnl: f.closedPnl || '0',
        commission: f.fee || '0',
        commissionAsset: (f as any).feeToken || 'USDC',
        marginAsset: 'USDC',
        time: f.time,
        buyer: f.side === 'B',
        maker: (f as any).maker !== undefined ? (f as any).maker : !f.crossed,
        side: f.side === 'B' ? 'BUY' : 'SELL',
        dir: f.dir,
        newChainData: {
          hash: f.hash,
        },
      } as unknown as AsterUserTrade;
    });

    if (options?.limit) {
      mapped = mapped.slice(0, options.limit);
    }

    return mapped;
  } catch (err) {
    console.error('getHyperliquidUserFills error', err);
    return [];
  }
};

export const getHyperliquidFundingHistory = async (
  userAddr: string,
  options?: { startTime?: number; endTime?: number; limit?: number }
): Promise<HyperliquidFundingRecord[]> => {
  try {
    const transport = getTransport();
    const startTime = options?.startTime || Date.now() - 365 * 24 * 60 * 60 * 1000;
    const data = await userFunding(
      { transport },
      {
        user: userAddr as `0x${string}`,
        startTime,
      }
    );

    let list: HyperliquidFundingRecord[] = data.map(item => {
      const sziNum = parseFloat(item.delta.szi || '0');
      const side: 'Long' | 'Short' = sziNum >= 0 ? 'Long' : 'Short';
      const absSize = Math.abs(sziNum);
      const usdcVal = parseFloat(item.delta.usdc || '0');
      const rateNum = parseFloat(item.delta.fundingRate || '0') * 100;

      return {
        time: item.time,
        coin: item.delta.coin,
        size: `${absSize} ${item.delta.coin}`,
        side,
        payment: `${usdcVal.toFixed(4)} USDC`,
        rate: `${rateNum.toFixed(4)}%`,
        hash: item.hash,
      };
    });

    list.sort((a, b) => b.time - a.time);

    if (options?.endTime) {
      list = list.filter(i => i.time <= options.endTime!);
    }

    if (options?.limit) {
      list = list.slice(0, options.limit);
    }

    return list;
  } catch (err) {
    console.error('getHyperliquidFundingHistory error', err);
    return [];
  }
};

export const getHyperliquidDepositWithdrawHistory = async (
  userAddr: string,
  options?: { limit?: number; type?: 'DEPOSIT' | 'WITHDRAW' }
): Promise<DepositWithdrawRecord[]> => {
  try {
    const isTestnet = useExchangeManager.getState().currentNetwork === 'testnet';
    const transport = getTransport();
    const updates = await userNonFundingLedgerUpdates(
      { transport },
      { user: userAddr as `0x${string}` }
    );
    if (!Array.isArray(updates)) return [];

    const chainId = isTestnet ? 421614 : 42161;
    let list: DepositWithdrawRecord[] = updates
      .map((item: any, idx: number) => {
        const delta = item.delta || {};
        const rawType = (delta.type || '').toLowerCase();
        let recordType: 'DEPOSIT' | 'WITHDRAW' = 'DEPOSIT';
        if (rawType.includes('withdraw') || rawType === 'send') {
          recordType = 'WITHDRAW';
        } else if (rawType.includes('deposit')) {
          recordType = 'DEPOSIT';
        } else {
          return null;
        }

        const amount = String(delta.usdc || delta.amount || '0');
        const fee = delta.fee ? String(delta.fee) : undefined;

        return {
          id: item.hash || `hl_${item.time}_${idx}`,
          txHash: item.hash || '',
          chainId,
          asset: 'USDC',
          amount,
          fee,
          state: 'SUCCESS' as const,
          type: recordType,
          time: Number(item.time || Date.now()),
          accountType: 'perp',
          address: delta.destination || userAddr,
        };
      })
      .filter((r): r is DepositWithdrawRecord => r !== null);

    list.sort((a, b) => b.time - a.time);

    if (options?.type) {
      list = list.filter(r => r.type === options.type);
    }
    if (options?.limit) {
      list = list.slice(0, options.limit);
    }
    return list;
  } catch (err) {
    console.error('getHyperliquidDepositWithdrawHistory error', err);
    return [];
  }
};
