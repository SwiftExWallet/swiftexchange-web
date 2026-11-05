import { type PerpNetwork, getHyperliquidConfig } from '../../core/config/networks';
import type { PerpExchange } from '../../core/interfaces/exchange';
import type { Market, OrderBook, Ticker } from '../../core/models';
import { HyperliquidMarkets } from './markets';
import { HyperliquidOrderBook } from './orderbook';
import { HyperliquidSigner } from './signer';
import { HyperliquidWebSocket } from './websocket';

export class HyperliquidClient implements PerpExchange {
  public readonly network: PerpNetwork;
  private readonly marketsApi: HyperliquidMarkets;
  private readonly orderBookApi: HyperliquidOrderBook;
  private readonly wsClient: HyperliquidWebSocket;
  public readonly signer: HyperliquidSigner;

  constructor(network: PerpNetwork = 'mainnet') {
    this.network = network;
    const config = getHyperliquidConfig(network);
    this.marketsApi = new HyperliquidMarkets(config.restUrl);
    this.orderBookApi = new HyperliquidOrderBook(config.restUrl);
    this.wsClient = new HyperliquidWebSocket(config.wsUrl);
    this.signer = new HyperliquidSigner();
  }

  public async connect(): Promise<void> {
    await this.wsClient.connect();
  }

  public async disconnect(): Promise<void> {
    this.wsClient.disconnect();
  }

  public async getMarkets(): Promise<Market[]> {
    return this.marketsApi.getMarkets();
  }

  public async getOrderBook(symbol: string): Promise<OrderBook> {
    const coin = this.extractCoinFromSymbol(symbol);
    return this.orderBookApi.getOrderBook(coin);
  }

  public async subscribeOrderBook(
    symbol: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _callback?: (ob: OrderBook) => void
  ): Promise<void> {
    const coin = this.extractCoinFromSymbol(symbol);
    // 1. Subscribe to real-time L2 WS stream
    this.wsClient.subscribeL2Book(coin);

    // 2. Concurrently fetch instant REST L2 snapshot to eliminate any render delay
    this.orderBookApi.getOrderBook(coin).catch(err => {
      console.warn('[HyperliquidClient] HTTP initial L2 snapshot fallback error:', err);
    });
  }

  public async unsubscribeOrderBook(symbol: string): Promise<void> {
    const coin = this.extractCoinFromSymbol(symbol);
    this.wsClient.unsubscribeL2Book(coin);
  }

  public async subscribeTicker(
    symbol: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _callback?: (ticker: Ticker) => void
  ): Promise<void> {
    const coin = this.extractCoinFromSymbol(symbol);
    this.wsClient.subscribeTrades(coin);
    this.wsClient.subscribeActiveAssetCtx(coin);
  }

  public async unsubscribeTicker(symbol: string): Promise<void> {
    const coin = this.extractCoinFromSymbol(symbol);
    this.wsClient.unsubscribeTrades(coin);
    this.wsClient.unsubscribeActiveAssetCtx(coin);
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
  ): Promise<import('../../core/models').Candle[]> {
    return this.marketsApi.getCandles(coin, interval, startTime, endTime);
  }

  private extractCoinFromSymbol(symbol: string): string {
    if (!symbol) return '';
    const normalized = symbol.replace('_', '-').toUpperCase();
    return normalized.split('-')[0] || normalized;
  }
}
