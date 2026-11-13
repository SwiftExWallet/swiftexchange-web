import { orderBookStore } from '../../core/stores/orderbookStore';
import { asterHttpClient } from './client/asterHttpClient';
import { ASTER_ENDPOINTS, getAsterRestUrl } from './constants';

interface DiffEvent {
  U: number;
  u: number;
  pu?: number;
  b: [string, string][];
  a: [string, string][];
}

export class OrderbookEngine {
  private symbol: string;
  private uiSymbol: string;

  private lastAppliedU = -1;
  private isFetching = false;
  private hasSnapshot = false;
  private bridgedSnapshot = false;
  private snapshotRetryCount = 0;
  private lastResyncTime = 0;

  private isDisposed = false;
  private abortController: AbortController | null = null;

  constructor(asterSymbol: string) {
    const clean = asterSymbol
      .replace(/[-_]/g, '')
      .toUpperCase()
      .replace(/(USDT)+$/g, '');
    this.symbol = `${clean}USDT`;
    this.uiSymbol = `${clean}-USDT`;
    orderBookStore.startSync(this.uiSymbol);
    orderBookStore.startSync(this.symbol);
    this.fetchSnapshot();
  }

  public async fetchSnapshot(): Promise<void> {
    if (this.isDisposed || this.isFetching || this.hasSnapshot) return;

    this.isFetching = true;

    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();

    try {
      const url = `${getAsterRestUrl()}${ASTER_ENDPOINTS.DEPTH}?symbol=${this.symbol}&limit=100`;
      const snap = await asterHttpClient.request<any>(url, {
        method: 'GET',
        weight: 2,
        ttlMs: 1000,
        signal: this.abortController.signal,
      });

      if (!this.isDisposed && snap && snap.bids && snap.asks) {
        this.applySnapshot(snap);
      } else if (!this.hasSnapshot) {
        orderBookStore.reconcileAndFlush(this.uiSymbol, 0);
        orderBookStore.reconcileAndFlush(this.symbol, 0);
      }
    } catch (e: any) {
      if (!this.hasSnapshot) {
        orderBookStore.reconcileAndFlush(this.uiSymbol, 0);
        orderBookStore.reconcileAndFlush(this.symbol, 0);
      }
      if (e?.name !== 'AbortError' && !this.isDisposed) {
        if (!this.hasSnapshot && this.snapshotRetryCount < 2) {
          this.snapshotRetryCount++;
          setTimeout(() => {
            if (!this.isDisposed && !this.hasSnapshot) {
              this.fetchSnapshot();
            }
          }, 3000);
        }
      }
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

    orderBookStore.applySnapshot(this.uiSymbol, formattedBids, formattedAsks, lastUpdateId || 0);
    orderBookStore.applySnapshot(this.symbol, formattedBids, formattedAsks, lastUpdateId || 0);

    const flushedU1 = orderBookStore.reconcileAndFlush(this.uiSymbol, lastUpdateId || 0);
    const flushedU2 = orderBookStore.reconcileAndFlush(this.symbol, lastUpdateId || 0);

    this.hasSnapshot = true;
    this.bridgedSnapshot = false;
    this.lastAppliedU = Math.max(lastUpdateId || 0, flushedU1 || 0, flushedU2 || 0);
  }

  public onDiffEvent(raw: DiffEvent): void {
    if (this.isDisposed) return;

    if (!this.hasSnapshot) {
      const bids = raw.b.map(([price, size]) => ({ price, size }));
      const asks = raw.a.map(([price, size]) => ({ price, size }));
      orderBookStore.applyDiff(this.uiSymbol, bids, asks, raw.u, raw.U, raw.pu);
      orderBookStore.applyDiff(this.symbol, bids, asks, raw.u, raw.U, raw.pu);
      return;
    }

    if (raw.u <= this.lastAppliedU) {
      return;
    }

    if (!this.bridgedSnapshot) {
      this.bridgedSnapshot = true;
      this.lastAppliedU = raw.u;
      const bids = raw.b.map(([price, size]) => ({ price, size }));
      const asks = raw.a.map(([price, size]) => ({ price, size }));
      orderBookStore.applyDiff(this.uiSymbol, bids, asks, raw.u, raw.U, raw.pu);
      orderBookStore.applyDiff(this.symbol, bids, asks, raw.u, raw.U, raw.pu);
      return;
    }

    if (
      raw.pu !== undefined &&
      this.lastAppliedU > 0 &&
      raw.pu !== this.lastAppliedU &&
      (raw.U === undefined || raw.U > this.lastAppliedU + 1)
    ) {
      const now = Date.now();
      if (now - this.lastResyncTime > 5000) {
        this.lastResyncTime = now;
        this.hasSnapshot = false;
        this.bridgedSnapshot = false;
        this.fetchSnapshot();
      }
      return;
    }

    const bids = raw.b.map(([price, size]) => ({ price, size }));
    const asks = raw.a.map(([price, size]) => ({ price, size }));

    orderBookStore.applyDiff(this.uiSymbol, bids, asks, raw.u, raw.U, raw.pu);
    orderBookStore.applyDiff(this.symbol, bids, asks, raw.u, raw.U, raw.pu);

    if (raw.u > this.lastAppliedU) {
      this.lastAppliedU = raw.u;
    }
  }

  public dispose(): void {
    this.isDisposed = true;
    this.hasSnapshot = false;
    this.bridgedSnapshot = false;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}
