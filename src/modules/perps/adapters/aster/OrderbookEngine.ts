import { orderBookStore } from '../../core/stores/orderbookStore';
import { ASTER_ENDPOINTS, getAsterRestUrl } from './constants';

interface DiffEvent {
  U: number; // First update ID in event
  u: number; // Final update ID in event
  pu: number; // Final update ID in last event
  b: [string, string][]; // Bids: [price, size]
  a: [string, string][]; // Asks: [price, size]
}

export class OrderbookEngine {
  private symbol: string; // Aster REST symbol, e.g. "BTCUSDT"
  private uiSymbol: string; // UI symbol, e.g. "BTC-USDT"

  private buffer: DiffEvent[] = [];
  private lastAppliedU = -1;
  private isFetching = false;
  private hasSnapshot = false;

  constructor(asterSymbol: string) {
    this.symbol = asterSymbol.toUpperCase();
    this.uiSymbol = this.symbol.replace('USDT', '-USDT');
    // Fetch initial snapshot immediately on instantiation to guarantee instant orderbook render
    this.fetchSnapshot();
  }

  public async fetchSnapshot(): Promise<void> {
    if (this.isFetching) return;
    this.isFetching = true;

    try {
      const url = `${getAsterRestUrl()}${ASTER_ENDPOINTS.DEPTH}?symbol=${this.symbol}&limit=100`;
      const res = await fetch(url);
      const snap = await res.json();
      if (snap && snap.bids && snap.asks) {
        this.applySnapshot(snap);
      }
    } catch (e) {
      console.warn(`[OrderbookEngine] Initial depth snapshot error for ${this.symbol}:`, e);
    } finally {
      this.isFetching = false;
    }
  }

  private applySnapshot(snap: {
    lastUpdateId: number;
    bids: [string, string][];
    asks: [string, string][];
  }): void {
    const { lastUpdateId } = snap;
    if (!snap.bids || !snap.asks) return;

    const formattedBids = snap.bids.map(([price, size]) => ({ price, size }));
    const formattedAsks = snap.asks.map(([price, size]) => ({ price, size }));

    // Apply to both UI symbol (BTC-USDT) and raw symbol (BTCUSDT)
    orderBookStore.applySnapshot(this.uiSymbol, formattedBids, formattedAsks, lastUpdateId || 0);
    orderBookStore.applySnapshot(this.symbol, formattedBids, formattedAsks, lastUpdateId || 0);

    this.hasSnapshot = true;
    this.lastAppliedU = lastUpdateId || 0;

    // Drain buffered diff events that arrived while snapshot was in flight
    if (this.buffer.length > 0) {
      const validDiffs = this.buffer;
      this.buffer = [];
      for (const diff of validDiffs) {
        if (diff.u >= this.lastAppliedU) {
          this.applyDiff(diff);
        }
      }
    }
  }

  /**
   * Called by the WS client when a `@depth` diff event arrives.
   */
  public onDiffEvent(raw: DiffEvent): void {
    if (!this.hasSnapshot) {
      this.buffer.push(raw);
      if (this.buffer.length > 100) this.buffer.shift();
      if (!this.isFetching) {
        this.fetchSnapshot();
      }
      return;
    }

    this.applyDiff(raw);
  }

  private applyDiff(event: DiffEvent): void {
    // Discard diffs older than the applied snapshot
    if (this.lastAppliedU !== -1 && event.u < this.lastAppliedU) {
      return;
    }

    const bids = event.b.map(([price, size]) => ({ price, size }));
    const asks = event.a.map(([price, size]) => ({ price, size }));

    // Apply to both keys in store
    orderBookStore.applyDiff(this.uiSymbol, bids, asks, event.u);
    orderBookStore.applyDiff(this.symbol, bids, asks, event.u);

    this.lastAppliedU = event.u;
  }

  public dispose(): void {
    this.buffer = [];
    this.hasSnapshot = false;
  }
}
