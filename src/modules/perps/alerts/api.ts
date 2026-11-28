import type {
  DeleteDevicePayload,
  HealthResponse,
  SnapshotPayload,
  SnapshotSuccessResponse,
} from './types';

export const ALERTS_BASE_URL = 'https://alerts.swiftexchange.io';

class AlertsApiClient {
  private backoffDelayMs = 60_000;
  private readonly maxBackoffDelayMs = 600_000;
  private rateLimitedUntil = 0;

  public isRateLimited(): boolean {
    return Date.now() < this.rateLimitedUntil;
  }

  public getRateLimitedUntil(): number {
    return this.rateLimitedUntil;
  }

  public resetRateLimit(): void {
    this.rateLimitedUntil = 0;
    this.backoffDelayMs = 60_000;
  }

  private handle429(): void {
    const currentDelay = this.backoffDelayMs;
    this.rateLimitedUntil = Date.now() + currentDelay;
    this.backoffDelayMs = Math.min(this.backoffDelayMs * 2, this.maxBackoffDelayMs);
  }

  public async postSnapshot(payload: SnapshotPayload): Promise<SnapshotSuccessResponse | null> {
    if (this.isRateLimited()) {
      return null;
    }

    try {
      const response = await fetch(`${ALERTS_BASE_URL}/v1/snapshot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.status === 429) {
        this.handle429();
        return null;
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.warn(`[alertsApi] Snapshot failed (${response.status}):`, errorText);
        return null;
      }

      this.resetRateLimit();
      return (await response.json()) as SnapshotSuccessResponse;
    } catch {
      return null;
    }
  }

  public async deleteDevice(payload: DeleteDevicePayload): Promise<SnapshotSuccessResponse | null> {
    try {
      const response = await fetch(`${ALERTS_BASE_URL}/v1/device`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.status === 429) {
        this.handle429();
        return null;
      }

      if (!response.ok) {
        return null;
      }

      return (await response.json()) as SnapshotSuccessResponse;
    } catch {
      return null;
    }
  }

  public async getHealth(): Promise<HealthResponse | null> {
    try {
      const response = await fetch(`${ALERTS_BASE_URL}/health`, {
        method: 'GET',
      });

      if (!response.ok) {
        return { ok: false, error: `Health check status: ${response.status}` };
      }

      return (await response.json()) as HealthResponse;
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Network error' };
    }
  }
}

export const alertsApi = new AlertsApiClient();
