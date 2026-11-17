import {
  AsterBannedError,
  AsterCircuitBreakerError,
  AsterHttpError,
  AsterNetworkError,
  AsterParsingError,
  AsterRateLimitError,
} from './errors';
import { AsterRateLimiter, asterRateLimiter } from './rateLimiter';

export interface AsterRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: string | FormData | URLSearchParams | Record<string, any>;
  weight?: number;
  ttlMs?: number;
  signal?: AbortSignal;
  maxRetries?: number;
  timeoutMs?: number;
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export class AsterHttpClient {
  private static instance: AsterHttpClient | null = null;
  private rateLimiter: AsterRateLimiter;

  private inFlightRequests = new Map<string, Promise<any>>();
  private responseCache = new Map<string, CacheEntry<any>>();

  private constructor(limiter: AsterRateLimiter = asterRateLimiter) {
    this.rateLimiter = limiter;
  }

  public static getInstance(): AsterHttpClient {
    if (!AsterHttpClient.instance) {
      AsterHttpClient.instance = new AsterHttpClient();
    }
    return AsterHttpClient.instance;
  }

  public async request<T = any>(url: string, options: AsterRequestOptions = {}): Promise<T> {
    const method = (options.method || 'GET').toUpperCase() as 'GET' | 'POST' | 'PUT' | 'DELETE';
    const isGet = method === 'GET';
    const weight = options.weight ?? 1;
    const ttlMs = options.ttlMs ?? 0;
    const maxRetries = options.maxRetries ?? (isGet ? 2 : 0);
    const timeoutMs = options.timeoutMs ?? 30_000;

    if (this.rateLimiter.isBanned()) {
      throw new AsterBannedError(this.rateLimiter.getStats().banRemainingMs + Date.now());
    }

    if (this.rateLimiter.isRateLimited()) {
      const remainingSec = Math.ceil(this.rateLimiter.getRateLimitRemainingMs() / 1000);
      throw new AsterRateLimitError(429, remainingSec);
    }

    const cacheKey = this.generateCacheKey(method, url, options.body);

    if (isGet && ttlMs > 0) {
      const cached = this.responseCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        this.rateLimiter.recordCacheHit();
        return cached.data as T;
      }
      if (cached) {
        this.responseCache.delete(cacheKey);
      }
    }

    if (this.inFlightRequests.has(cacheKey)) {
      this.rateLimiter.recordDedupeHit();
      return this.inFlightRequests.get(cacheKey) as Promise<T>;
    }

    const executionPromise = this.executeWithRetry<T>(
      url,
      method,
      options,
      weight,
      maxRetries,
      timeoutMs
    )
      .then(result => {
        if (isGet && ttlMs > 0) {
          this.responseCache.set(cacheKey, {
            data: result,
            expiresAt: Date.now() + ttlMs,
          });
        }
        return result;
      })
      .finally(() => {
        this.inFlightRequests.delete(cacheKey);
      });

    this.inFlightRequests.set(cacheKey, executionPromise);
    return executionPromise;
  }

  private async executeWithRetry<T>(
    url: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    options: AsterRequestOptions,
    weight: number,
    maxRetries: number,
    timeoutMs: number,
    attempt = 0
  ): Promise<T> {
    this.rateLimiter.acquireWeight(weight);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    if (options.signal) {
      if (options.signal.aborted) {
        clearTimeout(timeoutId);
        throw new Error('Request aborted');
      }
      options.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    let fetchBody: any = options.body;
    const headers: Record<string, string> = { ...(options.headers || {}) };

    if (
      fetchBody &&
      typeof fetchBody === 'object' &&
      !(fetchBody instanceof FormData) &&
      !(fetchBody instanceof URLSearchParams)
    ) {
      if (!headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
        fetchBody = JSON.stringify(fetchBody);
      }
    }

    const fetchOptions: RequestInit = {
      method,
      headers,
      body: method === 'GET' ? undefined : fetchBody,
      signal: controller.signal,
    };

    try {
      const response = await fetch(url, fetchOptions);
      clearTimeout(timeoutId);

      const usedWeightHeader =
        response.headers.get('x-mbx-used-weight-1m') || response.headers.get('x-mbx-used-weight');
      if (usedWeightHeader) {
        const usedWeight = parseInt(usedWeightHeader, 10);
        if (!isNaN(usedWeight)) {
          this.rateLimiter.updateServerReportedWeight(usedWeight);
        }
      }

      if (response.status === 418) {
        this.rateLimiter.recordFailure();
        const errorText = await response.text();
        const bannedUntil = this.rateLimiter.parseAndRecordBanFromError(errorText);
        throw new AsterBannedError(bannedUntil || Date.now() + 600_000, errorText);
      }

      if (response.status === 429) {
        this.rateLimiter.recordFailure();
        const retryHeader = response.headers.get('Retry-After');
        const retrySec = retryHeader ? parseInt(retryHeader, 10) || 60 : 60;
        this.rateLimiter.recordRateLimit(retrySec);
        throw new AsterRateLimitError(429, retrySec);
      }

      if (response.status >= 500) {
        this.rateLimiter.recordFailure();
        const errorText = await response.text();

        const isIdempotent = method === 'GET';
        if (isIdempotent && attempt < maxRetries) {
          const delayMs = Math.min(500 * Math.pow(2, attempt) + Math.random() * 200, 5000);
          await new Promise(res => setTimeout(res, delayMs));
          return this.executeWithRetry<T>(
            url,
            method,
            options,
            weight,
            maxRetries,
            timeoutMs,
            attempt + 1
          );
        }

        throw new AsterHttpError(response.status, response.statusText, errorText);
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new AsterHttpError(response.status, response.statusText, errorText);
      }

      this.rateLimiter.recordSuccess();

      const rawText = await response.text();
      if (!rawText || rawText.trim() === '') {
        return {} as T;
      }

      let parsed: any;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        throw new AsterParsingError('Failed to parse response as JSON', rawText);
      }

      if (
        parsed &&
        typeof parsed === 'object' &&
        typeof parsed.code === 'number' &&
        parsed.code < 0
      ) {
        if (parsed.code === -1003) {
          const bannedUntil = this.rateLimiter.parseAndRecordBanFromError(parsed.msg || '');
          throw new AsterBannedError(bannedUntil || Date.now() + 600_000, parsed.msg);
        }
      }

      return parsed as T;
    } catch (err: any) {
      clearTimeout(timeoutId);

      if (
        err instanceof AsterBannedError ||
        err instanceof AsterRateLimitError ||
        err instanceof AsterCircuitBreakerError ||
        err instanceof AsterHttpError ||
        err instanceof AsterParsingError
      ) {
        throw err;
      }

      if (options.signal?.aborted || err?.name === 'AbortError') {
        if (options.signal?.aborted) {
          throw new Error('Request aborted');
        }
        throw new AsterNetworkError(
          `Request timed out after ${timeoutMs}ms: ${method} ${url}`,
          err
        );
      }

      const isIdempotent = method === 'GET';
      if (isIdempotent && attempt < maxRetries) {
        const delayMs = Math.min(500 * Math.pow(2, attempt) + Math.random() * 200, 5000);
        await new Promise(res => setTimeout(res, delayMs));
        return this.executeWithRetry<T>(
          url,
          method,
          options,
          weight,
          maxRetries,
          timeoutMs,
          attempt + 1
        );
      }

      this.rateLimiter.recordFailure();

      throw new AsterNetworkError(
        `Network error during ${method} ${url}: ${err instanceof Error ? err.message : String(err)}`,
        err
      );
    }
  }

  private generateCacheKey(method: string, url: string, body?: any): string {
    let bodyStr = '';
    if (body) {
      if (typeof body === 'string') {
        bodyStr = body;
      } else {
        try {
          bodyStr = JSON.stringify(body);
        } catch {
          bodyStr = String(body);
        }
      }
    }
    return `${method}:${url}:${bodyStr}`;
  }

  public clearCache(): void {
    this.responseCache.clear();
  }
}

export const asterHttpClient = AsterHttpClient.getInstance();
