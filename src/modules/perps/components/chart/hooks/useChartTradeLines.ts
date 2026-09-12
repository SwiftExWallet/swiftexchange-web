import { useEffect, useRef } from 'react';

import { type ISeriesApi, LineStyle } from 'lightweight-charts';

import { useOrderStore } from '../../../core/stores/orderStore';
import { usePositionStore } from '../../../core/stores/positionStore';
import { useTickerStore } from '../../../core/stores/tickerStore';

interface UseChartTradeLinesProps {
  series: ISeriesApi<any> | null;
  market: string;
}

function matchesMarket(sym: string, market: string): boolean {
  if (!sym || !market) return false;
  if (sym === market) return true;
  const cleanSym = sym.replace(/[-_/]/g, '').toUpperCase();
  const cleanMkt = market.replace(/[-_/]/g, '').toUpperCase();
  if (cleanSym === cleanMkt) return true;
  const [base] = market.split('-');
  return sym.toUpperCase() === base.toUpperCase();
}

export function useChartTradeLines({ series, market }: UseChartTradeLinesProps) {
  const positions = usePositionStore(state => state.positions);
  const orders = useOrderStore(state => state.orders);
  const assetCtx = useTickerStore(
    state =>
      state.assetCtxByMarket[market] ||
      state.assetCtxByMarket[market.replace('-', '')] ||
      state.assetCtxByMarket[market.replace('USDT', '-USDT')]
  );

  // References to active price lines on the current series
  const entryLineRef = useRef<any>(null);
  const liqLineRef = useRef<any>(null);
  const orderLinesRef = useRef<Map<string, any>>(new Map());

  // Helper to remove a price line safely
  const safeRemove = (line: any) => {
    if (!series || !line) return;
    try {
      series.removePriceLine(line);
    } catch {
      /* series or line might already be detached */
    }
  };

  // Find matching position
  const activePosition = Object.values(positions).find(p => matchesMarket(p.symbol, market));

  // Find matching open orders
  const activeOrders = Object.values(orders).filter(
    o =>
      matchesMarket(o.symbol, market) &&
      (o.status === 'new' || o.status === 'partially_filled') &&
      parseFloat(o.price) > 0
  );

  // Manage Position Lines (Entry + Liq)
  const markPxStr = assetCtx?.markPx || activePosition?.markPrice;

  useEffect(() => {
    if (!series) {
      entryLineRef.current = null;
      liqLineRef.current = null;
      return;
    }

    // 1. Buying / Entry Price Line
    const entryPx = activePosition ? parseFloat(activePosition.entryPrice) : 0;
    const size = activePosition ? parseFloat(activePosition.size) : 0;

    if (entryPx > 0 && size !== 0) {
      const isLong = size > 0;
      const absSize = Math.abs(size);
      const markPx = parseFloat(markPxStr || '0') || entryPx;
      const pnl = isLong ? (markPx - entryPx) * absSize : (entryPx - markPx) * absSize;
      const pnlPrefix = pnl >= 0 ? '+$' : '-$';
      const pnlFormatted = `${pnlPrefix}${Math.abs(pnl).toFixed(2)}`;
      const coin = market.split('-')[0] || '';
      const title = `${absSize} ${coin} · ${isLong ? 'Long' : 'Short'} @ $${entryPx.toLocaleString()} · PnL: ${pnlFormatted}`;
      const color = isLong ? '#10b981' : '#f43f5e';

      if (entryLineRef.current) {
        try {
          entryLineRef.current.applyOptions({
            price: entryPx,
            color,
            title,
          });
        } catch {
          entryLineRef.current = null;
        }
      }

      if (!entryLineRef.current) {
        try {
          entryLineRef.current = series.createPriceLine({
            price: entryPx,
            color,
            lineWidth: 2,
            lineStyle: LineStyle.Solid,
            axisLabelVisible: true,
            title,
          });
        } catch {
          /* ignore */
        }
      }
    } else {
      if (entryLineRef.current) {
        safeRemove(entryLineRef.current);
        entryLineRef.current = null;
      }
    }

    // 2. Liquidation Price Line
    const liqPx = activePosition ? parseFloat(activePosition.liquidationPrice) : 0;
    if (liqPx > 0 && size !== 0) {
      const title = `Liquidation Price: $${liqPx.toLocaleString()}`;
      const color = '#f59e0b'; // Amber warning

      if (liqLineRef.current) {
        try {
          liqLineRef.current.applyOptions({
            price: liqPx,
            color,
            title,
          });
        } catch {
          liqLineRef.current = null;
        }
      }

      if (!liqLineRef.current) {
        try {
          liqLineRef.current = series.createPriceLine({
            price: liqPx,
            color,
            lineWidth: 2,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title,
          });
        } catch {
          /* ignore */
        }
      }
    } else {
      if (liqLineRef.current) {
        safeRemove(liqLineRef.current);
        liqLineRef.current = null;
      }
    }
  }, [series, activePosition, markPxStr]);

  // Manage Limit Order Lines
  useEffect(() => {
    if (!series) {
      orderLinesRef.current.clear();
      return;
    }

    const currentOrderIds = new Set(activeOrders.map(o => o.id));

    // Remove any lines for orders that are no longer active
    for (const [id, line] of orderLinesRef.current.entries()) {
      if (!currentOrderIds.has(id)) {
        safeRemove(line);
        orderLinesRef.current.delete(id);
      }
    }

    // Add or update lines for active orders
    for (const order of activeOrders) {
      const px = parseFloat(order.price);
      const isBuy = order.side === 'buy';
      const color = isBuy ? '#10b981' : '#f43f5e';
      const title = `${isBuy ? 'Limit Buy' : 'Limit Sell'} ${order.size} @ ${px.toLocaleString()}`;

      const existingLine = orderLinesRef.current.get(order.id);
      if (existingLine) {
        try {
          existingLine.applyOptions({
            price: px,
            color,
            title,
          });
        } catch {
          orderLinesRef.current.delete(order.id);
        }
      } else {
        try {
          const newLine = series.createPriceLine({
            price: px,
            color,
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: true,
            title,
          });
          orderLinesRef.current.set(order.id, newLine);
        } catch {
          /* ignore */
        }
      }
    }
  }, [series, activeOrders]);

  // Cleanup on unmount or market change
  useEffect(() => {
    return () => {
      if (entryLineRef.current) {
        safeRemove(entryLineRef.current);
        entryLineRef.current = null;
      }
      if (liqLineRef.current) {
        safeRemove(liqLineRef.current);
        liqLineRef.current = null;
      }
      for (const line of orderLinesRef.current.values()) {
        safeRemove(line);
      }
      orderLinesRef.current.clear();
    };
  }, [market, series]);
}
