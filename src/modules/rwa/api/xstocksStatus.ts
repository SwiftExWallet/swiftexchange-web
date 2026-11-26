import { XSTOCKS_API } from '../config/rwaConfig';
import type { MarketStatus } from '../types/rwa.types';
import { xstocksStatus } from '../utils/marketHours';

const TTL_MS = 5 * 60_000;
const cache = new Map<string, { status: MarketStatus | null; at: number }>();
const inflight = new Map<string, Promise<void>>();

export const getCachedXStatus = (symbol: string | null | undefined): MarketStatus | null => {
  if (!symbol) return null;
  const c = cache.get(symbol);
  return c && Date.now() - c.at < TTL_MS ? c.status : null;
};

const fetchOne = async (symbol: string): Promise<void> => {
  try {
    const r = await fetch(`${XSTOCKS_API}/assets/${encodeURIComponent(symbol)}`);
    const j = r.ok ? await r.json() : null;
    cache.set(symbol, { status: j ? xstocksStatus(j.trading) : null, at: Date.now() });
  } catch {
    cache.set(symbol, { status: null, at: Date.now() - TTL_MS + 60_000 });
  }
};

export const loadXStatuses = async (symbols: (string | null | undefined)[]): Promise<void> => {
  const need = Array.from(new Set(symbols.filter((s): s is string => Boolean(s)))).filter(
    s => !getCachedXStatus(s) && !inflight.has(s)
  );
  for (let i = 0; i < need.length; i += 4) {
    const part = need.slice(i, i + 4);
    const ps = part.map(s => {
      const p = fetchOne(s).finally(() => inflight.delete(s));
      inflight.set(s, p);
      return p;
    });
    await Promise.all(ps);
  }
};
