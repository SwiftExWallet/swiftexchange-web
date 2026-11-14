import { asterHttpClient } from '../client/asterHttpClient';
import { ASTER_ENDPOINTS, getAsterRestUrl } from '../constants';

export interface AggTradeData {
  a: number; // Aggregate tradeId
  p: string; // Price
  q: string; // Quantity
  f: number; // First tradeId
  l: number; // Last tradeId
  T: number; // Timestamp
  m: boolean; // Was the buyer the maker?
}

export interface AsterTradeData {
  id: number;
  price: string;
  qty: string;
  quoteQty: string;
  time: number;
  isBuyerMaker: boolean;
}

export async function getRecentTrades(
  symbol: string,
  limit: number = 50
): Promise<AsterTradeData[]> {
  const cleanSymbol = symbol.replace('-', '').replace('/', '');
  const url = `${getAsterRestUrl()}${ASTER_ENDPOINTS.TRADES}?symbol=${cleanSymbol}&limit=${limit}`;

  return asterHttpClient.request<AsterTradeData[]>(url, {
    method: 'GET',
    weight: 1,
    ttlMs: 1000,
  });
}

export async function getAggTrades(symbol: string, limit: number = 80): Promise<AggTradeData[]> {
  const cleanSymbol = symbol.replace('-', '').replace('/', '');
  const url = `${getAsterRestUrl()}${ASTER_ENDPOINTS.AGG_TRADES}?symbol=${cleanSymbol}&limit=${limit}`;

  return asterHttpClient.request<AggTradeData[]>(url, {
    method: 'GET',
    weight: 1,
    ttlMs: 1000,
  });
}
