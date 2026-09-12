import React, { useEffect, useRef, useState } from 'react';

import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  TrackingModeExitMode,
  createChart,
} from 'lightweight-charts';

import { useThemeStore } from '../../../../store/themeStore';
import { useCandles } from '../../hooks/useCandles';
import type { CandleBar } from '../chart/types';
import { normalizeCandles } from '../chart/utils/candles';

interface MobileCleanChartProps {
  symbol: string;
  timeframe: string;
  chartType: 'candle' | 'line';
  className?: string;
  onPriceChange?: (price: number) => void;
}

interface HoveredData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  changePct: number;
  dateStr: string;
}

export const MobileCleanChart: React.FC<MobileCleanChartProps> = ({
  symbol,
  timeframe,
  chartType,
  className = '',
  onPriceChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);

  const candleDataMapRef = useRef<Map<number, CandleBar>>(new Map());
  const lastBarTimeRef = useRef<number>(0);
  const lastKeyRef = useRef<string>('');
  const lastNormDataRef = useRef<CandleBar[]>([]);

  const [hoveredData, setHoveredData] = useState<HoveredData | null>(null);

  const isDark = useThemeStore((s: any) => s.theme) !== 'light';
  const { candles, isLoading } = useCandles(symbol, timeframe);

  // 1. Chart Initialization - created once per mount/theme change
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: isDark ? '#848e9c' : '#5e6673',
        fontSize: 10,
        fontFamily: 'inherit',
      },
      grid: {
        vertLines: { visible: false },
        horzLines: {
          color: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
          style: LineStyle.Dotted,
        },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.25)',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: isDark ? '#1e2329' : '#e6e8ea',
        },
        horzLine: {
          color: isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.25)',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: isDark ? '#1e2329' : '#e6e8ea',
        },
      },
      rightPriceScale: {
        borderColor: 'transparent',
        scaleMargins: { top: 0.12, bottom: 0.12 },
        alignLabels: true,
        autoScale: true,
      },
      timeScale: {
        borderColor: 'transparent',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 6,
        barSpacing: 6,
        minBarSpacing: 1.5,
        fixLeftEdge: false,
        fixRightEdge: false,
        lockVisibleTimeRangeOnResize: true,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
        axisDoubleClickReset: true,
      },
      kineticScroll: {
        touch: true,
        mouse: false,
      },
      trackingMode: {
        exitMode: TrackingModeExitMode.OnTouchEnd,
      },
    });

    chartInstanceRef.current = chart;

    // Crosshair move subscription for mobile touch inspection
    chart.subscribeCrosshairMove(param => {
      if (!param || !param.time || !param.point) {
        setHoveredData(null);
        return;
      }
      const t = param.time as number;
      const bar = candleDataMapRef.current.get(t);
      if (bar) {
        const changePct = bar.open > 0 ? ((bar.close - bar.open) / bar.open) * 100 : 0;
        const d = new Date(t * 1000);
        const dateStr = d.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });
        setHoveredData({
          time: t,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          changePct,
          dateStr,
        });
      } else {
        setHoveredData(null);
      }
    });

    // Create initial series right after chart creation
    createSeries(chart, chartType);

    const handleResize = () => {
      if (containerRef.current && chartInstanceRef.current) {
        chartInstanceRef.current.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartInstanceRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Helper to create or switch series without losing chart reference
  const createSeries = (chart: any, type: 'candle' | 'line') => {
    if (!chart) return null;
    if (seriesRef.current) {
      try {
        chart.removeSeries(seriesRef.current);
      } catch {
        // Safe fallback if series was already removed
      }
      seriesRef.current = null;
    }

    let series: any;
    if (type === 'candle') {
      series = chart.addSeries(CandlestickSeries, {
        upColor: '#2ebd85',
        downColor: '#f6465d',
        borderUpColor: '#2ebd85',
        borderDownColor: '#f6465d',
        wickUpColor: '#2ebd85',
        wickDownColor: '#f6465d',
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      });
    } else {
      series = chart.addSeries(AreaSeries, {
        lineColor: '#2ebd85',
        topColor: 'rgba(46, 189, 133, 0.25)',
        bottomColor: 'rgba(46, 189, 133, 0.0)',
        lineWidth: 2,
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      });
    }
    seriesRef.current = series;

    const existing = lastNormDataRef.current;
    if (existing.length > 0) {
      if (type === 'candle') {
        series.setData(
          existing.map(c => ({
            time: c.time as any,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          }))
        );
      } else {
        series.setData(
          existing.map(c => ({
            time: c.time as any,
            value: c.close,
          }))
        );
      }
    }
    return series;
  };

  // 2. Dynamic Theme Update without destroying chart, series, or candle data
  useEffect(() => {
    const chart = chartInstanceRef.current;
    if (!chart) return;

    chart.applyOptions({
      layout: {
        textColor: isDark ? '#848e9c' : '#5e6673',
      },
      grid: {
        horzLines: {
          color: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
        },
      },
      crosshair: {
        vertLine: {
          color: isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.25)',
          labelBackgroundColor: isDark ? '#1e2329' : '#e6e8ea',
        },
        horzLine: {
          color: isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.25)',
          labelBackgroundColor: isDark ? '#1e2329' : '#e6e8ea',
        },
      },
    });
  }, [isDark]);

  // 3. Series Switch when chartType changes
  useEffect(() => {
    const chart = chartInstanceRef.current;
    if (!chart) return;
    createSeries(chart, chartType);
  }, [chartType]);

  // 4. Candle Data Feed - Smooth updates that NEVER freeze or reset the timescale
  useEffect(() => {
    const chart = chartInstanceRef.current;
    if (!chart) return;

    if (!seriesRef.current) {
      createSeries(chart, chartType);
    }
    const series = seriesRef.current;
    if (!series) return;

    const norm = normalizeCandles(candles);
    if (!norm || norm.length === 0) {
      series.setData([]);
      lastNormDataRef.current = [];
      candleDataMapRef.current.clear();
      return;
    }

    // Build lookup map for touch crosshair inspection
    const newMap = new Map<number, CandleBar>();
    norm.forEach(c => newMap.set(c.time, c));
    candleDataMapRef.current = newMap;
    lastNormDataRef.current = norm;

    const currentKey = `${symbol}_${timeframe}`;
    const isNewDataset = lastKeyRef.current !== currentKey;

    if (isNewDataset) {
      // New market or timeframe: set data and fit visible range once
      if (chartType === 'candle') {
        series.setData(
          norm.map(c => ({
            time: c.time as any,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          }))
        );
      } else {
        series.setData(
          norm.map(c => ({
            time: c.time as any,
            value: c.close,
          }))
        );
      }

      lastKeyRef.current = currentKey;
      lastBarTimeRef.current = norm[norm.length - 1]?.time || 0;

      // Fit or set visible range once on dataset switch
      if (norm.length > 45) {
        chart.timeScale().setVisibleLogicalRange({ from: norm.length - 45, to: norm.length + 3 });
      } else {
        chart.timeScale().fitContent();
      }
    } else {
      // Live tick update on same dataset: smooth series update without resetting zoom/scroll
      const latest = norm[norm.length - 1];
      if (latest) {
        if (chartType === 'candle') {
          series.update({
            time: latest.time as any,
            open: latest.open,
            high: latest.high,
            low: latest.low,
            close: latest.close,
          });
        } else {
          series.update({
            time: latest.time as any,
            value: latest.close,
          });
        }
        lastBarTimeRef.current = latest.time;
      }
    }

    const latestBar = norm[norm.length - 1];
    if (latestBar && onPriceChange) {
      onPriceChange(latestBar.close);
    }
  }, [candles, symbol, timeframe, chartType, onPriceChange]);

  return (
    <div className={`relative w-full h-full min-h-[260px] select-none ${className}`}>
      {/* Real-time Mobile Touch Inspection HUD */}
      {hoveredData && (
        <div className="absolute top-1.5 left-2 z-20 flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-secondary/95 backdrop-blur-md border border-color/80 text-[9.5px] font-mono shadow-sm pointer-events-none transition-all">
          <span className="text-muted">{hoveredData.dateStr}</span>
          <span>
            O: <span className="text-primary font-semibold">{hoveredData.open.toFixed(2)}</span>
          </span>
          <span>
            H: <span className="text-primary font-semibold">{hoveredData.high.toFixed(2)}</span>
          </span>
          <span>
            L: <span className="text-primary font-semibold">{hoveredData.low.toFixed(2)}</span>
          </span>
          <span>
            C:{' '}
            <span
              className={
                hoveredData.close >= hoveredData.open
                  ? 'text-success font-semibold'
                  : 'text-danger font-semibold'
              }
            >
              {hoveredData.close.toFixed(2)}
            </span>
          </span>
          <span
            className={
              hoveredData.changePct >= 0
                ? 'text-success font-semibold'
                : 'text-danger font-semibold'
            }
          >
            {hoveredData.changePct >= 0 ? '+' : ''}
            {hoveredData.changePct.toFixed(2)}%
          </span>
        </div>
      )}

      {/* Loading Spinner */}
      {isLoading && (!candles || candles.length === 0) && (
        <div className="absolute inset-0 flex items-center justify-center bg-transparent z-10 pointer-events-none">
          <div className="flex flex-col items-center gap-2">
            <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            <span className="text-[11px] text-muted">Loading chart...</span>
          </div>
        </div>
      )}

      {/* Chart Canvas Container with pan-y & pinch-zoom touch handling */}
      <div
        ref={containerRef}
        className="w-full h-full"
        style={{ touchAction: 'pan-y pinch-zoom' }}
      />
    </div>
  );
};
