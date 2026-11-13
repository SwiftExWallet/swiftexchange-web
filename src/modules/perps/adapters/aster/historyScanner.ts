import type { Signer } from 'ethers';

import { useOrderStore } from '../../core/stores/orderStore';
import { usePositionStore } from '../../core/stores/positionStore';
import { getIncomeHistory } from './api/account';
import { asterRateLimiter } from './client/rateLimiter';

export interface ScanProgress {
  scanned: number;
  total: number;
  currentSymbol: string;
}

const inMemoryHistoryCache = new Map<string, { data: any[]; lastTimestamp: number }>();
const inMemoryTradedSymbols = new Map<string, Set<string>>();

export function cleanupLegacyLocalStorageHistory(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (
        key &&
        (key.startsWith('aster_history_') ||
          key.startsWith('aster_traded_symbols_') ||
          key === 'swiftex_aster_pending_deposits')
      ) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  } catch {
    void 0;
  }
}

if (typeof window !== 'undefined' && window.localStorage) {
  cleanupLegacyLocalStorageHistory();
}

export function clearInMemoryHistory(): void {
  inMemoryHistoryCache.clear();
  inMemoryTradedSymbols.clear();
}

export function getPersistedTradedSymbols(userAddr: string): string[] {
  if (!userAddr) return [];
  const set = inMemoryTradedSymbols.get(userAddr.toLowerCase());
  return set ? Array.from(set) : [];
}

export function persistTradedSymbols(userAddr: string, symbols: string[]): void {
  if (!userAddr) return;
  const key = userAddr.toLowerCase();
  const existing = inMemoryTradedSymbols.get(key) || new Set<string>();
  symbols.forEach(s => existing.add(s));
  inMemoryTradedSymbols.set(key, existing);
}

export function getPersistedHistory<T>(
  userAddr: string,
  type: 'orders' | 'trades'
): { data: T[]; lastTimestamp: number } | null {
  if (!userAddr) return null;
  const cached = inMemoryHistoryCache.get(`${type}_${userAddr.toLowerCase()}`);
  return cached ? (cached as { data: T[]; lastTimestamp: number }) : null;
}

export function persistHistory<T>(
  userAddr: string,
  type: 'orders' | 'trades',
  data: T[],
  lastTimestamp: number
): void {
  if (!userAddr) return;
  inMemoryHistoryCache.set(`${type}_${userAddr.toLowerCase()}`, { data, lastTimestamp });
}

export async function discoverUserSymbols(
  signer: Signer,
  userAddr: string,
  signal?: AbortSignal
): Promise<string[]> {
  const discovered = new Set<string>();

  getPersistedTradedSymbols(userAddr).forEach(s => discovered.add(s));

  try {
    const positions = usePositionStore.getState().positions;
    Object.keys(positions).forEach(k => {
      discovered.add(k.replace('-', '').toUpperCase());
    });
  } catch {
    void 0;
  }

  try {
    const orders = useOrderStore.getState().orders;
    Object.values(orders).forEach(o => {
      if (o.symbol) discovered.add(o.symbol.replace('-', '').toUpperCase());
    });
  } catch {
    void 0;
  }

  try {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const incomeRecords = await getIncomeHistory(
      signer,
      userAddr,
      { startTime: sevenDaysAgo, endTime: Date.now(), limit: 1000 },
      signal
    );
    if (Array.isArray(incomeRecords)) {
      incomeRecords.forEach(rec => {
        if (rec.symbol) {
          discovered.add(rec.symbol.toUpperCase());
        }
      });
    }
  } catch {
    void 0;
  }

  if (discovered.size === 0) {
    discovered.add('BTCUSDT');
    discovered.add('ETHUSDT');
  }

  if (userAddr && discovered.size > 0) {
    persistTradedSymbols(userAddr, Array.from(discovered));
  }

  return Array.from(discovered);
}

export function buildTargetSymbolList(discoveredSymbols: string[]): string[] {
  const symbolSet = new Set<string>();
  discoveredSymbols.forEach(s => symbolSet.add(s.toUpperCase()));
  return Array.from(symbolSet);
}

export async function scanHistoryQueue<T>(
  symbols: string[],
  fetchSymbolHistory: (symbol: string) => Promise<T[]>,
  options: {
    concurrency?: number;
    signal?: AbortSignal;
    onProgress?: (progress: ScanProgress, newItems: T[]) => void;
    onPauseNotice?: (notice: string | null) => void;
  }
): Promise<T[]> {
  const results: T[] = [];
  const concurrency = Math.max(1, options.concurrency || 1);
  let currentIndex = 0;

  const waitIfBannedOrLimited = async () => {
    while (asterRateLimiter.isBanned() || asterRateLimiter.isRateLimited()) {
      if (options.signal?.aborted) return;
      const banMs = asterRateLimiter.getBanRemainingMs();
      const limitMs = asterRateLimiter.getRateLimitRemainingMs();
      const waitMs = Math.max(banMs, limitMs);
      if (waitMs <= 0) break;

      const resumeDate = new Date(Date.now() + waitMs);
      const pad = (n: number) => n.toString().padStart(2, '0');
      const notice = `Paused until ${pad(resumeDate.getHours())}:${pad(resumeDate.getMinutes())}`;
      options.onPauseNotice?.(notice);

      await new Promise(resolve => setTimeout(resolve, Math.min(waitMs + 50, 500)));
    }
    options.onPauseNotice?.(null);
  };

  const processWorker = async () => {
    while (currentIndex < symbols.length) {
      if (options.signal?.aborted) break;

      await waitIfBannedOrLimited();
      if (options.signal?.aborted) break;

      const idx = currentIndex++;
      if (idx >= symbols.length) break;

      const sym = symbols[idx];

      try {
        const items = await fetchSymbolHistory(sym);
        results.push(...items);
        options.onProgress?.(
          {
            scanned: idx + 1,
            total: symbols.length,
            currentSymbol: sym,
          },
          items
        );
      } catch (err: any) {
        if (
          err?.name === 'AsterBannedError' ||
          err?.name === 'AsterRateLimitError' ||
          err?.status === 418 ||
          err?.status === 429
        ) {
          const untilMs =
            err?.bannedUntilMs ||
            (err?.retryAfterSec ? Date.now() + err.retryAfterSec * 1000 : Date.now() + 1000);

          if (err?.bannedUntilMs) {
            asterRateLimiter.recordBan(err.bannedUntilMs);
          } else if (err?.retryAfterSec) {
            asterRateLimiter.recordRateLimit(err.retryAfterSec);
          }

          const resumeDate = new Date(untilMs);
          const pad = (n: number) => n.toString().padStart(2, '0');
          options.onPauseNotice?.(
            `Paused until ${pad(resumeDate.getHours())}:${pad(resumeDate.getMinutes())}`
          );

          currentIndex = idx;
          await waitIfBannedOrLimited();
        }
      }
    }
  };

  const workers = Array.from({ length: concurrency }, () => processWorker());
  await Promise.all(workers);

  return results;
}
