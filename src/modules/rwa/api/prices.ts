import { LLAMA_API } from '../config/rwaConfig';
import type { RwaPriceInfo } from '../types/rwa.types';

const TTL_MS = 60_000;
const cache = new Map<string, RwaPriceInfo & { at: number }>();

export const getCachedPrice = (key: string | null | undefined): RwaPriceInfo | null => {
  if (!key) return null;
  const c = cache.get(key);
  if (!c || Date.now() - c.at >= TTL_MS) return null;
  return { price: c.price, change24h: c.change24h };
};

const fetchJson = async (url: string, ms = 12_000): Promise<any> => {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), ms) : null;
  try {
    const res = await fetch(url, controller ? { signal: controller.signal } : undefined);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export const loadPrices = async (keys: (string | null | undefined)[]): Promise<void> => {
  const need = Array.from(new Set(keys.filter((k): k is string => Boolean(k)))).filter(
    k => !getCachedPrice(k)
  );
  if (!need.length) return;

  // DefiLlama accepts comma-separated keys in chunks
  for (let i = 0; i < need.length; i += 60) {
    const chunk = need.slice(i, i + 60);
    const joined = chunk.map(encodeURIComponent).join(',');
    const [curr, pct] = await Promise.all([
      fetchJson(`${LLAMA_API}/prices/current/${joined}`),
      fetchJson(`${LLAMA_API}/percentage/${joined}`),
    ]);
    const coins = curr?.coins || {};
    const changes = pct?.coins || {};
    const now = Date.now();
    chunk.forEach(k => {
      const c = coins[k];
      const ch = changes[k];
      cache.set(k, {
        price: c && typeof c.price === 'number' ? c.price : null,
        change24h: typeof ch === 'number' ? ch : null,
        at: now,
      });
    });
  }
};
