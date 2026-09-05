import { PerpEvent, perpEventBus } from '../../core/events';
import { orderBookStore } from '../../core/stores/orderbookStore';
import { type AssetCtx, useTickerStore } from '../../core/stores/tickerStore';
import { tradeStore } from '../../core/stores/tradeStore';
import { WebSocketManager } from '../../core/websocket/manager';
import { HyperliquidMapper } from './mapper';

export class HyperliquidWebSocket extends WebSocketManager {
  constructor(url: string = 'wss://api.hyperliquid.xyz/ws') {
    super({
      url,
      pingIntervalMs: 50000,
      reconnectBaseDelayMs: 1000,
    });
  }

  protected ping(): void {
    this.send({ method: 'ping' });
  }

  protected onReconnect(): void {
    this.send({ method: 'subscribe', subscription: { type: 'allMids' } });

    for (const [topicId] of this.subscriptions.entries()) {
      if (topicId.startsWith('l2Book:')) {
        const coin = topicId.split(':')[1];
        this.send({ method: 'subscribe', subscription: { type: 'l2Book', coin } });
      } else if (topicId.startsWith('trades:')) {
        const coin = topicId.split(':')[1];
        this.send({ method: 'subscribe', subscription: { type: 'trades', coin } });
      } else if (topicId.startsWith('activeAssetCtx:')) {
        const coin = topicId.split(':')[1];
        this.send({ method: 'subscribe', subscription: { type: 'activeAssetCtx', coin } });
      } else if (topicId.startsWith('candle:')) {
        const [, coin, interval] = topicId.split(':');
        this.send({ method: 'subscribe', subscription: { type: 'candle', coin, interval } });
      }
    }
  }

  public subscribeL2Book(coin: string): void {
    const topicId = `l2Book:${coin}`;
    this.subscribe(topicId, { method: 'subscribe', subscription: { type: 'l2Book', coin } });
  }

  public unsubscribeL2Book(coin: string): void {
    const topicId = `l2Book:${coin}`;
    this.unsubscribe(topicId, { method: 'unsubscribe', subscription: { type: 'l2Book', coin } });
  }

  public subscribeTrades(coin: string): void {
    const topicId = `trades:${coin}`;
    this.subscribe(topicId, { method: 'subscribe', subscription: { type: 'trades', coin } });
  }

  public unsubscribeTrades(coin: string): void {
    const topicId = `trades:${coin}`;
    this.unsubscribe(topicId, { method: 'unsubscribe', subscription: { type: 'trades', coin } });
  }

  public subscribeActiveAssetCtx(coin: string): void {
    const topicId = `activeAssetCtx:${coin}`;
    this.subscribe(topicId, {
      method: 'subscribe',
      subscription: { type: 'activeAssetCtx', coin },
    });
  }

  public unsubscribeActiveAssetCtx(coin: string): void {
    const topicId = `activeAssetCtx:${coin}`;
    this.unsubscribe(topicId, {
      method: 'unsubscribe',
      subscription: { type: 'activeAssetCtx', coin },
    });
  }

  public subscribeCandles(coin: string, interval: string): void {
    const topicId = `candle:${coin}:${interval}`;
    this.subscribe(topicId, {
      method: 'subscribe',
      subscription: { type: 'candle', coin, interval },
    });
  }

  public unsubscribeCandles(coin: string, interval: string): void {
    const topicId = `candle:${coin}:${interval}`;
    this.unsubscribe(topicId, {
      method: 'unsubscribe',
      subscription: { type: 'candle', coin, interval },
    });
  }

  protected handleMessage(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data);

      if (data.channel === 'pong') return;

      if (data.channel === 'l2Book' && data.data) {
        const mappedBook = HyperliquidMapper.mapOrderBook(data.data);
        orderBookStore.applySnapshot(
          mappedBook.symbol,
          mappedBook.bids,
          mappedBook.asks,
          mappedBook.updateId ?? data.data.time ?? 0
        );
      }

      if (data.channel === 'trades' && data.data) {
        const trades = data.data;
        if (trades && trades.length > 0) {
          const mappedTrades = HyperliquidMapper.mapTrade(trades);
          if (mappedTrades.length > 0) {
            tradeStore.addTrades(mappedTrades[0].symbol, mappedTrades);
          }
        }
      }

      if (data.channel === 'activeAssetCtx' && data.data) {
        const { coin, ctx } = data.data;
        if (coin && ctx) {
          const uiSymbol = `${coin}-USDC`;
          ctx.nextFundingTime = HyperliquidMapper.getNextFundingTime();
          useTickerStore.getState().setAssetCtx(uiSymbol, ctx);
        }
      }

      if (data.channel === 'candle' && data.data) {
        const mappedCandles = HyperliquidMapper.mapCandle([data.data]);
        if (mappedCandles.length > 0) {
          perpEventBus.emit(PerpEvent.CANDLE_UPDATED, mappedCandles[0]);
        }
      }

      if (data.channel === 'allMids' && data.data?.mids) {
        const mids = data.data.mids;
        const currentMap = useTickerStore.getState().assetCtxByMarket;
        const updates: Record<string, AssetCtx> = {};
        for (const [coin, midPx] of Object.entries(mids)) {
          const uiSymbol = `${coin}-USDC`;
          const existing = currentMap[uiSymbol];
          if (existing) {
            updates[uiSymbol] = { ...existing, markPx: midPx as string, midPx: midPx as string };
          }
        }
        if (Object.keys(updates).length > 0) {
          useTickerStore.getState().setMultipleAssetCtxs(updates);
        }
      }

      if (data.channel === 'webData2' && data.data) {
        const assetCtxs = data.data.assetCtxs;
        const meta = data.data.meta;
        if (Array.isArray(assetCtxs) && meta?.universe) {
          const contexts: Record<string, AssetCtx> = {};
          assetCtxs.forEach((ctx: any, index: number) => {
            const coin = meta.universe[index]?.name;
            if (coin) {
              const uiSymbol = `${coin}-USDC`;
              ctx.nextFundingTime = HyperliquidMapper.getNextFundingTime();
              contexts[uiSymbol] = ctx;
            }
          });
          useTickerStore.getState().setMultipleAssetCtxs(contexts);
        }
      }
    } catch (e) {
      console.error('Failed to parse Hyperliquid WS message', e);
    }
  }
}
