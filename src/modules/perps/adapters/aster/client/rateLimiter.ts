import { AsterBannedError, AsterCircuitBreakerError, AsterRateLimitError } from './errors';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface RateLimiterStats {
  requestsThisMinute: number;
  weightUsedThisMinute: number;
  cacheHits: number;
  dedupeHits: number;
  blockedByBan: number;
  blockedByRateLimit: number;
  blockedByCircuitBreaker: number;
  circuitState: CircuitState;
  consecutiveFailures: number;
  isBanned: boolean;
  banRemainingMs: number;
  isRateLimited: boolean;
  rateLimitRemainingMs: number;
}

const STORAGE_BAN_KEY = 'aster_ip_ban_until_ms';
const STORAGE_COOLDOWN_KEY = 'aster_rate_limit_until_ms';
const BROADCAST_CHANNEL_NAME = 'aster_rate_protection';

const DEFAULT_MAX_WEIGHT_PER_MINUTE = 1200;
const CIRCUIT_FAILURE_THRESHOLD = 5;
const CIRCUIT_OPEN_DURATION_MS = 30_000;

export class AsterRateLimiter {
  private static instance: AsterRateLimiter | null = null;

  private weightHistory: { timestamp: number; weight: number }[] = [];
  private maxWeightPerMinute = DEFAULT_MAX_WEIGHT_PER_MINUTE;

  private circuitState: CircuitState = 'CLOSED';
  private consecutiveFailures = 0;
  private circuitOpenedAt = 0;
  private isHalfOpenProbeInFlight = false;

  private bannedUntilMs = 0;
  private cooldownUntilMs = 0;

  private broadcastChannel: BroadcastChannel | null = null;

  private cacheHitsCount = 0;
  private dedupeHitsCount = 0;
  private blockedByBanCount = 0;
  private blockedByRateLimitCount = 0;
  private blockedByCircuitCount = 0;

  private stateChangeListeners = new Set<() => void>();

  private constructor() {
    this.restoreFromStorage();
    this.initCrossTabSync();
  }

  public static getInstance(): AsterRateLimiter {
    if (!AsterRateLimiter.instance) {
      AsterRateLimiter.instance = new AsterRateLimiter();
    }
    return AsterRateLimiter.instance;
  }

  private restoreFromStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;

    try {
      const storedBan = localStorage.getItem(STORAGE_BAN_KEY);
      if (storedBan) {
        const banMs = parseInt(storedBan, 10);
        if (!isNaN(banMs) && banMs > Date.now()) {
          this.bannedUntilMs = banMs;
        } else {
          localStorage.removeItem(STORAGE_BAN_KEY);
        }
      }

      const storedCooldown = localStorage.getItem(STORAGE_COOLDOWN_KEY);
      if (storedCooldown) {
        const coolMs = parseInt(storedCooldown, 10);
        if (!isNaN(coolMs) && coolMs > Date.now()) {
          this.cooldownUntilMs = coolMs;
        } else {
          localStorage.removeItem(STORAGE_COOLDOWN_KEY);
        }
      }
    } catch {
      void 0;
    }
  }

  private initCrossTabSync(): void {
    if (typeof window === 'undefined') return;

    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
        this.broadcastChannel.onmessage = event => {
          const data = event.data;
          if (!data || typeof data !== 'object') return;

          if (data.type === 'BAN' && typeof data.untilMs === 'number') {
            this.setBanLocal(data.untilMs);
          } else if (data.type === 'COOLDOWN' && typeof data.untilMs === 'number') {
            this.setCooldownLocal(data.untilMs);
          } else if (data.type === 'CLEAR_BAN') {
            this.clearBanLocal();
          }
        };
      } catch {
        this.broadcastChannel = null;
      }
    }

    window.addEventListener('storage', event => {
      if (event.key === STORAGE_BAN_KEY) {
        const val = event.newValue;
        if (val) {
          this.setBanLocal(parseInt(val, 10));
        } else {
          this.clearBanLocal();
        }
      } else if (event.key === STORAGE_COOLDOWN_KEY) {
        const val = event.newValue;
        if (val) {
          this.setCooldownLocal(parseInt(val, 10));
        }
      }
    });
  }

  private setBanLocal(untilMs: number): void {
    this.bannedUntilMs = untilMs;
    this.notifyStateChange();
  }

  private setCooldownLocal(untilMs: number): void {
    this.cooldownUntilMs = untilMs;
    this.notifyStateChange();
  }

  private clearBanLocal(): void {
    this.bannedUntilMs = 0;
    this.notifyStateChange();
  }

  private notifyStateChange(): void {
    this.stateChangeListeners.forEach(listener => {
      try {
        listener();
      } catch {
        void 0;
      }
    });
  }

  public onStateChange(listener: () => void): () => void {
    this.stateChangeListeners.add(listener);
    return () => this.stateChangeListeners.delete(listener);
  }

  public isBanned(): boolean {
    if (this.bannedUntilMs === 0) return false;
    if (Date.now() >= this.bannedUntilMs) {
      this.clearBan();
      return false;
    }
    return true;
  }

  public getBanRemainingMs(): number {
    if (!this.isBanned()) return 0;
    return Math.max(0, this.bannedUntilMs - Date.now());
  }

  public recordBan(untilMs: number): void {
    if (!untilMs || isNaN(untilMs) || untilMs <= Date.now()) return;

    this.bannedUntilMs = untilMs;
    try {
      localStorage.setItem(STORAGE_BAN_KEY, String(untilMs));
    } catch {
      void 0;
    }

    try {
      this.broadcastChannel?.postMessage({ type: 'BAN', untilMs });
    } catch {
      void 0;
    }

    this.notifyStateChange();
  }

  public clearBan(): void {
    this.bannedUntilMs = 0;
    try {
      localStorage.removeItem(STORAGE_BAN_KEY);
    } catch {
      void 0;
    }

    try {
      this.broadcastChannel?.postMessage({ type: 'CLEAR_BAN' });
    } catch {
      void 0;
    }

    this.notifyStateChange();
  }

  public isRateLimited(): boolean {
    if (this.cooldownUntilMs === 0) return false;
    if (Date.now() >= this.cooldownUntilMs) {
      this.cooldownUntilMs = 0;
      try {
        localStorage.removeItem(STORAGE_COOLDOWN_KEY);
      } catch {
        void 0;
      }
      return false;
    }
    return true;
  }

  public getRateLimitRemainingMs(): number {
    if (!this.isRateLimited()) return 0;
    return Math.max(0, this.cooldownUntilMs - Date.now());
  }

  public recordRateLimit(retryAfterSec: number): void {
    const sec = Math.max(1, retryAfterSec || 60);
    const untilMs = Date.now() + sec * 1000;
    this.cooldownUntilMs = untilMs;

    try {
      localStorage.setItem(STORAGE_COOLDOWN_KEY, String(untilMs));
    } catch {
      void 0;
    }

    try {
      this.broadcastChannel?.postMessage({ type: 'COOLDOWN', untilMs });
    } catch {
      void 0;
    }

    this.notifyStateChange();
  }

  public parseAndRecordBanFromError(errorMsg: string): number | null {
    if (!errorMsg) return null;

    const matchMs = errorMsg.match(/banned until (\d{10,13})/i);
    if (matchMs && matchMs[1]) {
      let ts = parseInt(matchMs[1], 10);
      if (ts < 100000000000) ts *= 1000;
      this.recordBan(ts);
      return ts;
    }

    const defaultBanMs = Date.now() + 10 * 60 * 1000;
    this.recordBan(defaultBanMs);
    return defaultBanMs;
  }

  public getUsedWeightLastMinute(): number {
    const cutoff = Date.now() - 60_000;
    this.weightHistory = this.weightHistory.filter(w => w.timestamp > cutoff);
    return this.weightHistory.reduce((sum, item) => sum + item.weight, 0);
  }

  public acquireWeight(weight: number = 1): void {
    if (this.isBanned()) {
      this.blockedByBanCount++;
      throw new AsterBannedError(this.bannedUntilMs);
    }

    if (this.isRateLimited()) {
      this.blockedByRateLimitCount++;
      const remainingSec = Math.ceil(this.getRateLimitRemainingMs() / 1000);
      throw new AsterRateLimitError(429, remainingSec);
    }

    this.checkCircuitBreaker();

    const used = this.getUsedWeightLastMinute();
    if (used + weight > this.maxWeightPerMinute) {
      this.blockedByRateLimitCount++;
      throw new AsterRateLimitError(
        429,
        Math.ceil((60_000 - (Date.now() - (this.weightHistory[0]?.timestamp || Date.now()))) / 1000)
      );
    }

    this.weightHistory.push({ timestamp: Date.now(), weight });
  }

  public updateServerReportedWeight(usedWeight: number): void {
    if (usedWeight >= 1150) {
      this.recordRateLimit(10);
      this.maxWeightPerMinute = 150;
    } else if (usedWeight >= 950) {
      this.maxWeightPerMinute = Math.max(150, 1200 - usedWeight - 100);
    } else {
      this.maxWeightPerMinute = DEFAULT_MAX_WEIGHT_PER_MINUTE;
    }
  }

  private checkCircuitBreaker(): void {
    const now = Date.now();

    if (this.circuitState === 'OPEN') {
      const elapsed = now - this.circuitOpenedAt;
      if (elapsed >= CIRCUIT_OPEN_DURATION_MS) {
        this.circuitState = 'HALF_OPEN';
        this.isHalfOpenProbeInFlight = true;
        this.notifyStateChange();
        return;
      }
      this.blockedByCircuitCount++;
      throw new AsterCircuitBreakerError(CIRCUIT_OPEN_DURATION_MS - elapsed);
    }

    if (this.circuitState === 'HALF_OPEN') {
      if (this.isHalfOpenProbeInFlight) {
        this.blockedByCircuitCount++;
        throw new AsterCircuitBreakerError(5000);
      }
      this.isHalfOpenProbeInFlight = true;
    }
  }

  public recordSuccess(): void {
    this.consecutiveFailures = 0;
    if (this.circuitState === 'HALF_OPEN') {
      this.circuitState = 'CLOSED';
      this.isHalfOpenProbeInFlight = false;
      this.notifyStateChange();
    }
  }

  public recordFailure(): void {
    this.consecutiveFailures++;

    if (this.circuitState === 'HALF_OPEN') {
      this.circuitState = 'OPEN';
      this.circuitOpenedAt = Date.now();
      this.isHalfOpenProbeInFlight = false;
      this.notifyStateChange();
      return;
    }

    if (this.consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD && this.circuitState === 'CLOSED') {
      this.circuitState = 'OPEN';
      this.circuitOpenedAt = Date.now();
      this.notifyStateChange();
    }
  }

  public recordCacheHit(): void {
    this.cacheHitsCount++;
  }

  public recordDedupeHit(): void {
    this.dedupeHitsCount++;
  }

  public getStats(): RateLimiterStats {
    const cutoff = Date.now() - 60_000;
    const reqsInWindow = this.weightHistory.filter(w => w.timestamp > cutoff);

    return {
      requestsThisMinute: reqsInWindow.length,
      weightUsedThisMinute: reqsInWindow.reduce((sum, w) => sum + w.weight, 0),
      cacheHits: this.cacheHitsCount,
      dedupeHits: this.dedupeHitsCount,
      blockedByBan: this.blockedByBanCount,
      blockedByRateLimit: this.blockedByRateLimitCount,
      blockedByCircuitBreaker: this.blockedByCircuitCount,
      circuitState: this.circuitState,
      consecutiveFailures: this.consecutiveFailures,
      isBanned: this.isBanned(),
      banRemainingMs: this.getBanRemainingMs(),
      isRateLimited: this.isRateLimited(),
      rateLimitRemainingMs: this.getRateLimitRemainingMs(),
    };
  }

  public reset(): void {
    this.weightHistory = [];
    this.circuitState = 'CLOSED';
    this.consecutiveFailures = 0;
    this.circuitOpenedAt = 0;
    this.isHalfOpenProbeInFlight = false;
    this.bannedUntilMs = 0;
    this.cooldownUntilMs = 0;
    this.cacheHitsCount = 0;
    this.dedupeHitsCount = 0;
    this.blockedByBanCount = 0;
    this.blockedByRateLimitCount = 0;
    this.blockedByCircuitCount = 0;
    try {
      localStorage.removeItem(STORAGE_BAN_KEY);
      localStorage.removeItem(STORAGE_COOLDOWN_KEY);
    } catch {
      void 0;
    }
    this.notifyStateChange();
  }
}

export const asterRateLimiter = AsterRateLimiter.getInstance();
