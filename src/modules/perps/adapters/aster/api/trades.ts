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
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch trades: ${response.statusText}`);
  }
  return response.json();
}

export async function getAggTrades(symbol: string, limit: number = 80): Promise<AggTradeData[]> {
  const url = `${getAsterRestUrl()}${ASTER_ENDPOINTS.AGG_TRADES}?symbol=${symbol}&limit=${limit}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch agg trades: ${response.statusText}`);
  }
  return response.json();
}
