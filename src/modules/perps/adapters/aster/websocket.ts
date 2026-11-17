import { PerpEvent, perpEventBus } from '../../core/events';
import { usePositionStore } from '../../core/stores/positionStore';
import { useTickerStore } from '../../core/stores/tickerStore';
import { tradeStore } from '../../core/stores/tradeStore';
import { OrderbookEngine } from './OrderbookEngine';
import { getRecentTrades } from './api/trades';
import { ASTER_WS_STREAMS, getAsterWsUrl } from './constants';
import { AsterMapper } from './mapper';

type StreamHandler = (data: unknown) => void;

function cleanAsterSymbol(raw: string): string {
  const clean = raw
    .replace(/[-_]/g, '')
    .toLowerCase()
    .replace(/(usdt)+$/g, '');
  return `${clean}usdt`;
}

interface WsOptions {
  reconnectBaseMs?: number;
  maxReconnectMs?: number;
}

/**
 * Singleton WebSocket client for Aster Futures combined stream.
 * One connection, multiple stream subscriptions shared across all components.
 * Connects to /stream?streams=... and dispatches by stream name.
 */
export class AsterWebSocket {
  private static instance: AsterWebSocket | null = null;

  private ws: WebSocket | null = null;
  private msgId = 1;

  // stream name -> Set of handlers
  private handlers = new Map<string, Set<StreamHandler>>();

  // Active stream names for reconnect re-subscription
  private activeStreams = new Set<string>();

  private orderBookSubscribers = new Map<string, number>();
  private tradeSubscribers = new Map<string, number>();
  private candleSubscribers = new Map<string, number>();

  private engines = new Map<string, OrderbookEngine>();

  private reconnectBaseMs: number;
  private maxReconnectMs: number;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;

  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private lastMessageTime = 0;
  private readonly staleThresholdMs = 45_000;

  // Stable no-op used as the subscription handler for streams where dispatchBuiltIn
  // handles all routing internally (depth, aggTrade, kline).
  private readonly _noop: StreamHandler = () => {};

  private network: import('../../core/config/networks').PerpNetwork = 'mainnet';

  private constructor(opts: WsOptions = {}) {
    this.reconnectBaseMs = opts.reconnectBaseMs ?? 1000;
    this.maxReconnectMs = opts.maxReconnectMs ?? 30000;
    this.initNetworkListeners();
  }

  public static getInstance(
    network?: import('../../core/config/networks').PerpNetwork
  ): AsterWebSocket {
    if (!AsterWebSocket.instance) {
      AsterWebSocket.instance = new AsterWebSocket();
    }
    if (network) {
      AsterWebSocket.instance.setNetwork(network);
    }
    return AsterWebSocket.instance;
  }

  public setNetwork(network: import('../../core/config/networks').PerpNetwork): void {
    if (this.network !== network) {
      this.network = network;
      if (this.ws) {
        this.disconnect();
      }
    }
  }

  private initNetworkListeners(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => {
      if (!this.intentionalClose && (!this.ws || this.ws.readyState !== WebSocket.OPEN)) {
        this.reconnectAttempt = 0;
        this.connect();
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        if (
          !this.intentionalClose &&
          (!this.ws ||
            this.ws.readyState !== WebSocket.OPEN ||
            Date.now() - this.lastMessageTime > this.staleThresholdMs)
        ) {
          if (this.ws) {
            try {
              this.ws.close();
            } catch {
              void 0;
            }
          }
          this.reconnectAttempt = 0;
          this.connect();
        }
      }
    });
  }

  private refCount = 0;

  public connect(network?: import('../../core/config/networks').PerpNetwork): Promise<void> {
    if (network && this.network !== network) {
      this.setNetwork(network);
    }
    this.refCount++;
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return Promise.resolve();
    }

    return new Promise(resolve => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        resolve();
        return;
      }

      const rawWsUrl = getAsterWsUrl(this.network);
      const baseUrl = rawWsUrl.replace('/ws', '/stream');
      const url = `${baseUrl}?streams=${ASTER_WS_STREAMS.TICKER}/${ASTER_WS_STREAMS.MARK_PRICE}`;
      const ws = new WebSocket(url);
      this.ws = ws;
      this.intentionalClose = false;
      let hasResolved = false;

      const connectTimeout = setTimeout(() => {
        if (!hasResolved) {
          console.warn('[AsterWebSocket] Connection timed out after 6s. Retrying...');
          hasResolved = true;
          resolve();
          if (this.ws === ws) {
            this.ws = null;
            try {
              ws.close();
            } catch {
              void 0;
            }
            if (!this.intentionalClose) this.scheduleReconnect();
          }
        }
      }, 6000);

      ws.onopen = () => {
        clearTimeout(connectTimeout);
        if (this.ws !== ws) return;

        this.reconnectAttempt = 0;
        this.lastMessageTime = Date.now();
        this.startHeartbeat();
        this.resubscribeAll();
        perpEventBus.emit(PerpEvent.CONNECTED);

        if (!hasResolved) {
          hasResolved = true;
          resolve();
        }
      };

      ws.onmessage = event => {
        if (this.ws !== ws) return;
        this.lastMessageTime = Date.now();
        this.handleMessage(event);
      };

      ws.onclose = () => {
        clearTimeout(connectTimeout);
        this.stopHeartbeat();

        if (!hasResolved) {
          hasResolved = true;
          resolve();
        }
        if (this.ws === ws) {
          this.ws = null;
          if (!this.intentionalClose) this.scheduleReconnect();
        }
      };

      ws.onerror = () => {
        clearTimeout(connectTimeout);
        if (!hasResolved) {
          hasResolved = true;
          resolve();
        }
      };
    });
  }

  public disconnect(): void {
    this.refCount--;
    if (this.refCount > 0) return; // Only close if no one is using it
    this.refCount = 0;

    this.intentionalClose = true;
    this.clearReconnect();
    this.stopHeartbeat();
    this.ws?.close();
    this.ws = null;
    this.engines.forEach(engine => engine.dispose());
    this.engines.clear();
    this.orderBookSubscribers.clear();
    this.tradeSubscribers.clear();
    this.candleSubscribers.clear();
    perpEventBus.emit(PerpEvent.DISCONNECTED);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.lastMessageTime = Date.now();

    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ method: 'ping' }));
        } catch {
          void 0;
        }
      }
    }, 20_000);

    this.watchdogTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        if (Date.now() - this.lastMessageTime > this.staleThresholdMs) {
          console.warn(
            `[AsterWebSocket] No messages for ${Math.round(this.staleThresholdMs / 1000)}s. Reconnecting...`
          );
          try {
            this.ws.close();
          } catch {
            void 0;
          }
        }
      }
    }, 10_000);
  }

  private stopHeartbeat(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  private send(payload: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(payload));
      } catch {
        void 0;
      }
    }
  }

  /**
   * Subscribe a handler to a specific stream name.
   * The WS SUBSCRIBE message is only sent on the first subscriber.
   */
  public subscribe(stream: string, handler: StreamHandler): void {
    if (!this.handlers.has(stream)) {
      this.handlers.set(stream, new Set());
    }
    const set = this.handlers.get(stream)!;
    const wasEmpty = set.size === 0;
    set.add(handler);

    if (wasEmpty) {
      this.activeStreams.add(stream);
      this.send({ method: 'SUBSCRIBE', params: [stream], id: this.msgId++ });
    }
  }

  /**
   * Unsubscribe a handler. WS UNSUBSCRIBE sent when last handler for that stream leaves.
   */
  public unsubscribe(stream: string, handler: StreamHandler): void {
    const set = this.handlers.get(stream);
    if (!set) return;

    set.delete(handler);

    if (set.size === 0) {
      this.handlers.delete(stream);
      this.activeStreams.delete(stream);
      this.send({ method: 'UNSUBSCRIBE', params: [stream], id: this.msgId++ });
    }
  }

  private resubscribeAll(): void {
    const streams = Array.from(this.activeStreams);
    if (streams.length > 0) {
      this.send({ method: 'SUBSCRIBE', params: streams, id: this.msgId++ });
    }
    this.engines.forEach(engine => engine.dispose());
    this.engines.clear();
    for (const [sym, count] of this.orderBookSubscribers.entries()) {
      if (count > 0) {
        this.engines.set(sym, new OrderbookEngine(sym));
      }
    }
    for (const [sym, count] of this.tradeSubscribers.entries()) {
      if (count > 0) {
        this.resyncTrades(sym);
      }
    }
  }

  private async resyncTrades(asterSym: string): Promise<void> {
    try {
      const asterSymbol = asterSym.toUpperCase();
      const uiSymbol = asterSymbol.replace(/USDT$/, '-USDT');

      tradeStore.startSync(uiSymbol);
      tradeStore.startSync(asterSymbol);

      const trades = await getRecentTrades(asterSymbol, 100);
      const mappedTrades = trades.map(AsterMapper.mapTrade).map(t => {
        t.symbol = uiSymbol;
        return t;
      });

      const latestTimestamp = mappedTrades.reduce(
        (max, t) => (t.timestamp > max ? t.timestamp : max),
        0
      );

      tradeStore.applySnapshot(uiSymbol, mappedTrades);
      tradeStore.applySnapshot(asterSymbol, mappedTrades);

      tradeStore.reconcileAndFlush(uiSymbol, latestTimestamp);
      tradeStore.reconcileAndFlush(asterSymbol, latestTimestamp);
    } catch {
      const asterSymbol = asterSym.toUpperCase();
      const uiSymbol = asterSymbol.replace(/USDT$/, '-USDT');
      tradeStore.reconcileAndFlush(uiSymbol, 0);
      tradeStore.reconcileAndFlush(asterSymbol, 0);
    }
  }

  private handleMessage(event: MessageEvent): void {
    let raw: unknown;
    try {
      raw = JSON.parse(event.data as string);
    } catch {
      return;
    }

    if (!raw || typeof raw !== 'object') return;

    const msg = raw as Record<string, unknown>;

    if ('id' in msg && msg.result === null) return;
    if (msg.result === 'pong') return;

    const streamName = msg.stream as string | undefined;
    const data = msg.data;

    if (!streamName || data === undefined) return;

    // Dispatch to registered handlers first
    this.handlers.get(streamName)?.forEach(h => h(data));

    this.dispatchBuiltIn(streamName, data);
  }

  private dispatchBuiltIn(stream: string, data: unknown): void {
    // Global ticker array
    if (stream === ASTER_WS_STREAMS.TICKER || stream === ASTER_WS_STREAMS.MARK_PRICE) {
      if (!Array.isArray(data)) return;
      this.handleGlobalArray(data as Record<string, unknown>[]);
      return;
    }

    const payload = data as Record<string, unknown>;
    const eventType = payload.e as string | undefined;

    if (!eventType) return;

    if (eventType === 'depthUpdate') {
      // Route to the correct OrderbookEngine by symbol
      const asterSymbol = (payload.s as string).toLowerCase();
      this.engines.get(asterSymbol)?.onDiffEvent(payload as any);
      return;
    }

    if (eventType === 'aggTrade') {
      const mapped = AsterMapper.mapTrade(payload);
      const rawSymbol = mapped.symbol;
      const uiSymbol = mapped.symbol.replace(/USDT$/, '-USDT');
      mapped.symbol = uiSymbol;
      tradeStore.addTrades(uiSymbol, [mapped]);
      tradeStore.addTrades(rawSymbol, [mapped]);
      return;
    }

    if (eventType === 'kline') {
      const mapped = AsterMapper.mapLiveCandle(payload);
      perpEventBus.emit(PerpEvent.CANDLE_UPDATED, mapped);
      return;
    }

    if (eventType === 'markPriceUpdate') {
      const rawSymbol = payload.s as string;
      const uiSymbol = rawSymbol.replace(/(USDT|USDC)$/, '-$1');
      const markData = AsterMapper.mapMarkPrice(payload);
      const store = useTickerStore.getState();
      const existingUi = store.getAssetCtx(uiSymbol) || AsterMapper.mapTicker({});
      const existingRaw = store.getAssetCtx(rawSymbol) || AsterMapper.mapTicker({});
      store.setAssetCtx(uiSymbol, { ...existingUi, ...markData });
      store.setAssetCtx(rawSymbol, { ...existingRaw, ...markData });

      if (markData.markPx) {
        const posState = usePositionStore.getState();
        const pos =
          posState.positions[uiSymbol] ||
          posState.positions[rawSymbol] ||
          posState.positions[uiSymbol.replace('-', '')];
        if (pos && parseFloat(pos.size || '0') !== 0) {
          const markVal = parseFloat(markData.markPx);
          const entryVal = parseFloat(pos.entryPrice || '0');
          const sizeVal = parseFloat(pos.size || '0');
          if (markVal > 0 && entryVal > 0) {
            const isLong = sizeVal > 0;
            const livePnl = isLong
              ? (markVal - entryVal) * Math.abs(sizeVal)
              : (entryVal - markVal) * Math.abs(sizeVal);
            posState.updatePosition({
              ...pos,
              markPrice: markData.markPx,
              unrealizedPnl: livePnl.toFixed(4),
            });
          }
        }
      }
      return;
    }

    if (eventType === '24hrTicker') {
      const rawSymbol = payload.s as string;
      const uiSymbol = rawSymbol.replace(/(USDT|USDC)$/, '-$1');
      const mapped = AsterMapper.mapTicker(payload);
      useTickerStore.getState().setAssetCtx(uiSymbol, mapped);
      useTickerStore.getState().setAssetCtx(rawSymbol, mapped);
    }
  }

  private handleGlobalArray(items: Record<string, unknown>[]): void {
    const contexts: Record<string, Partial<import('../../core/stores/tickerStore').AssetCtx>> = {};
    const posState = usePositionStore.getState();
    const hasPositions = Object.keys(posState.positions).length > 0;
    const updatedPositions: import('../../core/models').Position[] = [];

    for (const item of items) {
      const rawSymbol = item.s as string | undefined;
      if (!rawSymbol) continue;
      const uiSymbol = rawSymbol.replace('USDT', '-USDT');

      if (item.e === '24hrTicker') {
        const mapped = AsterMapper.mapTicker(item);
        contexts[uiSymbol] = { ...contexts[uiSymbol], ...mapped };
        contexts[rawSymbol] = { ...contexts[rawSymbol], ...mapped };
      } else if (item.e === 'markPriceUpdate') {
        const mapped = AsterMapper.mapMarkPrice(item);
        contexts[uiSymbol] = { ...contexts[uiSymbol], ...mapped };
        contexts[rawSymbol] = { ...contexts[rawSymbol], ...mapped };

        // Live update position store on mark price tick (batched)
        if (hasPositions) {
          const markPxStr = item.p as string;
          if (markPxStr) {
            const pos =
              posState.positions[uiSymbol] ||
              posState.positions[rawSymbol] ||
              posState.positions[uiSymbol.replace('-', '')];
            if (pos && parseFloat(pos.size || '0') !== 0) {
              const markVal = parseFloat(markPxStr);
              const entryVal = parseFloat(pos.entryPrice || '0');
              const sizeVal = parseFloat(pos.size || '0');
              if (markVal > 0 && entryVal > 0) {
                const isLong = sizeVal > 0;
                const livePnl = isLong
                  ? (markVal - entryVal) * Math.abs(sizeVal)
                  : (entryVal - markVal) * Math.abs(sizeVal);
                updatedPositions.push({
                  ...pos,
                  markPrice: markPxStr,
                  unrealizedPnl: livePnl.toFixed(4),
                });
              }
            }
          }
        }
      }
    }

    if (updatedPositions.length > 0) {
      posState.batchUpdatePositions({ upsert: updatedPositions });
    }

    if (Object.keys(contexts).length === 0) return;

    const store = useTickerStore.getState();
    const merged: Record<string, import('../../core/stores/tickerStore').AssetCtx> = {};
    for (const [sym, partial] of Object.entries(contexts)) {
      const existing = store.getAssetCtx(sym) || AsterMapper.mapTicker({});
      merged[sym] = { ...existing, ...partial };
    }
    store.setMultipleAssetCtxs(merged);
  }

  // --- High-level subscription helpers called by AsterClient ---

  public subscribeOrderBook(coin: string): void {
    const asterSym = cleanAsterSymbol(coin);
    const count = (this.orderBookSubscribers.get(asterSym) || 0) + 1;
    this.orderBookSubscribers.set(asterSym, count);

    if (count === 1) {
      if (!this.engines.has(asterSym)) {
        this.engines.set(asterSym, new OrderbookEngine(asterSym));
      }

      const stream = `${asterSym}@depth`;
      this.subscribe(stream, this._noop);
    }
  }

  public unsubscribeOrderBook(coin: string): void {
    const asterSym = cleanAsterSymbol(coin);
    const count = (this.orderBookSubscribers.get(asterSym) || 1) - 1;

    if (count <= 0) {
      this.orderBookSubscribers.delete(asterSym);
      const stream = `${asterSym}@depth`;
      this.unsubscribe(stream, this._noop);
      this.engines.get(asterSym)?.dispose();
      this.engines.delete(asterSym);
    } else {
      this.orderBookSubscribers.set(asterSym, count);
    }
  }

  public async subscribeTrades(coin: string): Promise<void> {
    const asterSym = cleanAsterSymbol(coin);
    const count = (this.tradeSubscribers.get(asterSym) || 0) + 1;
    this.tradeSubscribers.set(asterSym, count);

    if (count === 1) {
      const asterSymbol = asterSym.toUpperCase();
      const uiSymbol = asterSymbol.replace(/USDT$/, '-USDT');

      tradeStore.startSync(uiSymbol);
      tradeStore.startSync(asterSymbol);

      this.subscribe(`${asterSym}@aggTrade`, this._noop);

      try {
        const trades = await getRecentTrades(asterSymbol, 100);
        const mappedTrades = trades.map(AsterMapper.mapTrade).map(t => {
          t.symbol = uiSymbol;
          return t;
        });

        const latestTimestamp = mappedTrades.reduce(
          (max, t) => (t.timestamp > max ? t.timestamp : max),
          0
        );

        tradeStore.applySnapshot(uiSymbol, mappedTrades);
        tradeStore.applySnapshot(asterSymbol, mappedTrades);

        tradeStore.reconcileAndFlush(uiSymbol, latestTimestamp);
        tradeStore.reconcileAndFlush(asterSymbol, latestTimestamp);
      } catch {
        tradeStore.reconcileAndFlush(uiSymbol, 0);
        tradeStore.reconcileAndFlush(asterSymbol, 0);
      }
    }
  }

  public unsubscribeTrades(coin: string): void {
    const asterSym = cleanAsterSymbol(coin);
    const count = (this.tradeSubscribers.get(asterSym) || 1) - 1;

    if (count <= 0) {
      this.tradeSubscribers.delete(asterSym);
      this.unsubscribe(`${asterSym}@aggTrade`, this._noop);
      const asterSymbol = asterSym.toUpperCase();
      const uiSymbol = asterSymbol.replace(/USDT$/, '-USDT');
      tradeStore.clear(uiSymbol);
      tradeStore.clear(asterSymbol);
    } else {
      this.tradeSubscribers.set(asterSym, count);
    }
  }

  public subscribeCandles(coin: string, interval: string): void {
    const asterSym = cleanAsterSymbol(coin);
    const key = `${asterSym}_${interval}`;
    const count = (this.candleSubscribers.get(key) || 0) + 1;
    this.candleSubscribers.set(key, count);

    if (count === 1) {
      this.subscribe(`${asterSym}@kline_${interval}`, this._noop);
    }
  }

  public unsubscribeCandles(coin: string, interval: string): void {
    const asterSym = cleanAsterSymbol(coin);
    const key = `${asterSym}_${interval}`;
    const count = (this.candleSubscribers.get(key) || 1) - 1;

    if (count <= 0) {
      this.candleSubscribers.delete(key);
      this.unsubscribe(`${asterSym}@kline_${interval}`, this._noop);
    } else {
      this.candleSubscribers.set(key, count);
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnect();

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return;
    }

    const delay =
      Math.min(this.reconnectBaseMs * Math.pow(2, this.reconnectAttempt), this.maxReconnectMs) +
      Math.floor(Math.random() * 1000);
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
