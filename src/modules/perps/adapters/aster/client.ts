import type { PerpNetwork } from '../../core/config/networks';
import type { PerpExchange } from '../../core/interfaces/exchange';
import type { Candle, Market, OrderBook, Ticker } from '../../core/models';
import { type AssetCtx, useTickerStore } from '../../core/stores/tickerStore';
import { asterHttpClient } from './client/asterHttpClient';
import { ASTER_ENDPOINTS, getAsterRestUrl } from './constants';
import { AsterMapper } from './mapper';
import { AsterWebSocket } from './websocket';

export class AsterClient implements PerpExchange {
  private wsClient: AsterWebSocket;
  public readonly network: PerpNetwork;

  constructor(network: PerpNetwork = 'mainnet') {
    this.network = network;
    this.wsClient = AsterWebSocket.getInstance(network);
  }

  private get restUrl(): string {
    return getAsterRestUrl(this.network);
  }

  public async connect(): Promise<void> {
    await this.wsClient.connect(this.network);
  }

  public async disconnect(): Promise<void> {
    this.wsClient.disconnect(true);
  }

  public async getMarkets(): Promise<Market[]> {
    let infoData: any = null;
    let tickerData: any = null;

    try {
      infoData = await asterHttpClient.request<any>(
        `${this.restUrl}${ASTER_ENDPOINTS.EXCHANGE_INFO}`,
        {
          method: 'GET',
          weight: 10,
          ttlMs: 300_000,
        }
      );
    } catch (err) {
      console.warn('[AsterClient] getMarkets exchangeInfo failed:', err);
    }

    try {
      tickerData = await asterHttpClient.request<any>(
        `${this.restUrl}${ASTER_ENDPOINTS.TICKER_24HR}`,
        {
          method: 'GET',
          weight: 40,
          ttlMs: 3_000,
        }
      );
    } catch (err) {
      console.warn('[AsterClient] getMarkets ticker24hr failed:', err);
    }

    if (!infoData || !infoData.symbols) return [];

    // Populate initial ticker data to avoid blanks in the UI
    if (Array.isArray(tickerData)) {
      const contexts: Record<string, AssetCtx> = {};
      for (const t of tickerData) {
        const symbol = t.symbol.replace('USDT', '-USDT');
        const mapped = AsterMapper.mapTicker(t);
        contexts[symbol] = mapped;
        contexts[t.symbol] = mapped;
      }
      useTickerStore.getState().setMultipleAssetCtxs(contexts);
    }

    return infoData.symbols
      .filter((s: any) => s.contractType === 'PERPETUAL' || s.status === 'TRADING')
      .map(AsterMapper.mapMarket);
  }

  public async getOrderBook(symbol: string): Promise<OrderBook> {
    const coin = this.extractCoinFromSymbol(symbol);
    const asterSymbol = `${coin}USDT`;
    const data = await asterHttpClient.request<any>(
      `${this.restUrl}${ASTER_ENDPOINTS.DEPTH}?symbol=${asterSymbol}&limit=50`,
      {
        method: 'GET',
        weight: 5,
        ttlMs: 1000,
      }
    );

    return AsterMapper.mapOrderBook(symbol, data);
  }

  public async subscribeOrderBook(
    symbol: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _callback?: (ob: OrderBook) => void
  ): Promise<void> {
    const coin = this.extractCoinFromSymbol(symbol);
    this.wsClient.subscribeOrderBook(coin);
  }

  public async unsubscribeOrderBook(symbol: string): Promise<void> {
    const coin = this.extractCoinFromSymbol(symbol);
    this.wsClient.unsubscribeOrderBook(coin);
  }

  public async subscribeTicker(
    symbol: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _callback?: (ticker: Ticker) => void
  ): Promise<void> {
    const coin = this.extractCoinFromSymbol(symbol);
    this.wsClient.subscribeTrades(coin);
  }

  public async unsubscribeTicker(symbol: string): Promise<void> {
    const coin = this.extractCoinFromSymbol(symbol);
    this.wsClient.unsubscribeTrades(coin);
  }

  public subscribeCandles(coin: string, interval: string): void {
    this.wsClient.subscribeCandles(coin, interval);
  }

  public unsubscribeCandles(coin: string, interval: string): void {
    this.wsClient.unsubscribeCandles(coin, interval);
  }

  public async getCandles(
    coin: string,
    interval: string,
    startTime: number,
    endTime: number
  ): Promise<Candle[]> {
    const cleanCoin = this.extractCoinFromSymbol(coin);
    const asterSymbol = `${cleanCoin}USDT`;
    const url = `${this.restUrl}${ASTER_ENDPOINTS.KLINES}?symbol=${asterSymbol}&interval=${interval}&startTime=${startTime}&endTime=${endTime}&limit=500`;

    const data = await asterHttpClient.request<any>(url, {
      method: 'GET',
      weight: 5,
      ttlMs: 5000,
    });

    if (!Array.isArray(data)) {
      return [];
    }

    const uiSymbol = `${cleanCoin}-USDT`;
    return data.map((k: any) => AsterMapper.mapCandle(uiSymbol, interval, k));
  }

  private extractCoinFromSymbol(symbol: string): string {
    return (
      symbol
        .replace(/[-_]/g, '')
        .toUpperCase()
        .replace(/(USDT|USDC)+$/g, '') || symbol
    );
  }
}
