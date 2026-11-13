import { useEffect, useRef, useState } from 'react';

import { PerpEvent, perpEventBus } from '../core/events';
import type { Candle } from '../core/models';
import { useCandleStore } from '../core/stores/candleStore';
import { useDynamicExchange } from './useDynamicExchange';

function mapInterval(interval: string): string {
  const map: Record<string, string> = {
    '1MIN': '1m',
    '3MINS': '3m',
    '5MINS': '5m',
    '15MINS': '15m',
    '30MINS': '30m',
    '1HOUR': '1h',
    '2HOURS': '2h',
    '4HOURS': '4h',
    '8HOURS': '8h',
    '12HOURS': '12h',
    '1DAY': '1d',
    '3DAYS': '3d',
    '1WEEK': '1w',
    '1MONTH': '1M',
  };
  return map[interval] || interval;
}

export function useCandles(market: string, rawInterval: string) {
  const interval = mapInterval(rawInterval);
  const { client: exchange } = useDynamicExchange();

  const altMarket = market.includes('-')
    ? market.replace('-', '')
    : market.replace(/(USDT|USDC)$/, '-$1');

  const storeCandles =
    useCandleStore(
      state =>
        state.candlesByMarketAndInterval[`${market}_${interval}`] ||
        state.candlesByMarketAndInterval[`${altMarket}_${interval}`]
    ) || [];
  const setCandles = useCandleStore(state => state.setCandles);
  const addLiveCandle = useCandleStore(state => state.addLiveCandle);

  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasMoreRef = useRef(true);
  const oldestTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (storeCandles.length > 0 && error) {
      setError(null);
    }
  }, [storeCandles.length, error]);

  useEffect(() => {
    let mounted = true;
    if (!exchange || !market) return;

    hasMoreRef.current = true;
    oldestTimeRef.current = null;
    setIsLoading(true);
    setError(null);

    const coin =
      market
        .replace(/[-_]/g, '')
        .toUpperCase()
        .replace(/(USDT|USDC)+$/g, '') || market.split('-')[0];
    if (exchange.subscribeCandles) {
      exchange.subscribeCandles(coin, interval);
    }

    const loadInitial = async () => {
      try {
        const endTime = Date.now();
        const timeOffset = intervalToMs(interval) * 500;
        const startTime = endTime - timeOffset;

        if (typeof exchange.getCandles !== 'function') {
          if (mounted) setIsLoading(false);
          return;
        }

        const fetched = await exchange.getCandles(coin, interval, startTime, endTime);
        if (mounted && fetched && fetched.length > 0) {
          fetched.sort((a: Candle, b: Candle) => a.startedAtTime - b.startedAtTime);
          setCandles(market, interval, fetched);
          setCandles(altMarket, interval, fetched);
          oldestTimeRef.current = fetched[0].startedAtTime;
          setError(null);
        }
      } catch (e) {
        console.error('[useCandles] Error in loadInitial:', e);
        if (mounted) {
          const existing =
            useCandleStore.getState().candlesByMarketAndInterval[`${market}_${interval}`] ||
            useCandleStore.getState().candlesByMarketAndInterval[`${altMarket}_${interval}`];
          if (!existing || existing.length === 0) {
            setError('Failed to load chart data');
            setTimeout(() => {
              setError(null);
            }, 4000);
          }
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    loadInitial();

    return () => {
      mounted = false;
      if (exchange.unsubscribeCandles) {
        exchange.unsubscribeCandles(coin, interval);
      }
    };
  }, [market, altMarket, interval, exchange]);

  useEffect(() => {
    const handleCandleUpdate = (candle: Candle) => {
      const cleanCandle = (candle.ticker || '').replace(/[-_]/g, '').toUpperCase();
      const cleanMarket = market.replace(/[-_]/g, '').toUpperCase();
      if (cleanCandle === cleanMarket && candle.resolution === interval) {
        addLiveCandle(market, interval, candle);
        addLiveCandle(altMarket, interval, candle);
        setError(null);
      }
    };

    const unsub = perpEventBus.on(PerpEvent.CANDLE_UPDATED, handleCandleUpdate);
    return unsub;
  }, [market, altMarket, interval, addLiveCandle]);

  const fetchMore = async () => {
    if (isFetchingMore || !hasMoreRef.current || !exchange || !oldestTimeRef.current) return;

    setIsFetchingMore(true);
    try {
      const coin =
        market
          .replace(/[-_]/g, '')
          .toUpperCase()
          .replace(/(USDT|USDC)+$/g, '') || market.split('-')[0];
      const endTime = oldestTimeRef.current - 1;
      const timeOffset = intervalToMs(interval) * 500;
      const startTime = endTime - timeOffset;

      const adapter = (exchange as any).marketsApi || exchange;
      if (adapter && adapter.getCandles) {
        const fetched = await adapter.getCandles(coin, interval, startTime, endTime);
        if (!fetched || fetched.length === 0) {
          hasMoreRef.current = false;
        } else {
          fetched.sort((a: Candle, b: Candle) => a.startedAtTime - b.startedAtTime);
          const current = storeCandles;
          const newCandles = [...fetched, ...current];
          setCandles(market, interval, newCandles);
          setCandles(altMarket, interval, newCandles);
          oldestTimeRef.current = fetched[0].startedAtTime;
        }
      }
    } catch (e) {
      console.error('Fetch more error', e);
    } finally {
      setIsFetchingMore(false);
    }
  };

  const latestCandle = storeCandles.length > 0 ? storeCandles[storeCandles.length - 1] : null;

  return {
    candles: storeCandles,
    latestCandle,
    isLoading,
    isFetchingMore,
    error,
    fetchMore,
  };
}

function intervalToMs(interval: string): number {
  const unit = interval.slice(-1);
  const val = parseInt(interval.slice(0, -1));
  const msMap: Record<string, number> = {
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
    M: 30 * 24 * 60 * 60 * 1000,
  };
  return val * (msMap[unit] || 60 * 1000);
}
