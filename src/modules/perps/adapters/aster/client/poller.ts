import { asterRateLimiter } from './rateLimiter';

export interface SafePollerOptions {
  intervalMs: number;
  maxBackoffMs?: number;
  initialJitterMs?: number;
  runImmediately?: boolean;
}

export interface SafePoller {
  start: () => void;
  stop: () => void;
  isRunning: () => boolean;
}

export function createSafePoller(
  task: () => Promise<void>,
  options: SafePollerOptions
): SafePoller {
  const {
    intervalMs,
    maxBackoffMs = 60_000,
    initialJitterMs = 1500,
    runImmediately = true,
  } = options;

  let isStarted = false;
  let isExecuting = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let consecutiveErrors = 0;

  const clearPendingTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const shouldPause = (): boolean => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return true;
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return true;
    }
    if (asterRateLimiter.isBanned() || asterRateLimiter.isRateLimited()) {
      return true;
    }
    return false;
  };

  const scheduleNext = (delayMs: number) => {
    clearPendingTimer();
    if (!isStarted) return;

    timer = setTimeout(async () => {
      timer = null;
      if (!isStarted || isExecuting) return;

      if (shouldPause()) {
        return;
      }

      isExecuting = true;
      try {
        await task();
        consecutiveErrors = 0;
      } catch {
        consecutiveErrors++;
      } finally {
        isExecuting = false;
        if (isStarted) {
          const nextDelay =
            consecutiveErrors > 0
              ? Math.min(intervalMs * Math.pow(1.5, consecutiveErrors), maxBackoffMs)
              : intervalMs;
          scheduleNext(nextDelay);
        }
      }
    }, delayMs);
  };

  const handleWakeEvent = () => {
    if (!isStarted || isExecuting) return;
    if (!shouldPause()) {
      clearPendingTimer();
      const wakeJitter = Math.min(Math.floor(Math.random() * 50), intervalMs);
      scheduleNext(wakeJitter);
    }
  };

  const start = () => {
    if (isStarted) return;
    isStarted = true;
    consecutiveErrors = 0;

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleWakeEvent);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleWakeEvent);
    }
    const unsubLimiter = asterRateLimiter.onStateChange(handleWakeEvent);
    (start as any)._unsubLimiter = unsubLimiter;

    const initialDelay = runImmediately ? Math.floor(Math.random() * initialJitterMs) : intervalMs;
    scheduleNext(initialDelay);
  };

  const stop = () => {
    isStarted = false;
    clearPendingTimer();

    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleWakeEvent);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handleWakeEvent);
    }
    if ((start as any)._unsubLimiter) {
      (start as any)._unsubLimiter();
      (start as any)._unsubLimiter = null;
    }
  };

  const isRunning = () => isStarted;

  return { start, stop, isRunning };
}
