import type {
  AsterSignRequestParams,
  AsterSignResponse,
  IAsterSigner,
} from '../../perps/adapters/aster/types/signer';

// Configurable signer origin via environment variable with production & dev defaults
export function getSignerOrigin(): string {
  if (import.meta.env.VITE_SIGNER_URL) {
    try {
      return new URL(import.meta.env.VITE_SIGNER_URL).origin;
    } catch {
      // Fallback if invalid URL format
    }
  }

  // If in development mode and local dev server is running
  if (import.meta.env.DEV) {
    return 'http://localhost:5174';
  }

  // Default production origin
  return 'https://signer.swiftexchange.io';
}

interface PendingRpc {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timer: any;
}

class SignerIframeBridge implements IAsterSigner {
  private iframe: HTMLIFrameElement | null = null;
  private pendingRequests = new Map<string, PendingRpc>();
  private isInitialized = false;
  private initPromise: Promise<boolean> | null = null;
  private initResolver: ((ready: boolean) => void) | null = null;
  private cachedAddress: string | null = null;
  readonly isIsolated = true;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('message', this.handleMessage.bind(this));
    }
  }

  private handleMessage(event: MessageEvent): void {
    const expectedOrigin = getSignerOrigin();

    // In dev, allow localhost on any dev port; in prod strict match
    const isDevLocal =
      import.meta.env.DEV &&
      (event.origin.startsWith('http://localhost') || event.origin.startsWith('http://127.0.0.1'));
    if (event.origin !== expectedOrigin && !isDevLocal) {
      return;
    }

    const data = event.data;
    if (!data || data.protocol !== 'SX_ISOLATED_SIGNER_V1') {
      return;
    }

    if (data.type === 'SX_SIGNER_READY') {
      this.isInitialized = true;
      if (this.initResolver) {
        this.initResolver(true);
        this.initResolver = null;
      }
      return;
    }

    if (data.requestId && this.pendingRequests.has(data.requestId)) {
      const pending = this.pendingRequests.get(data.requestId)!;
      this.pendingRequests.delete(data.requestId);
      clearTimeout(pending.timer);

      if (data.type === 'SX_SIGNER_ERROR') {
        pending.reject(new Error(`[IsolatedSigner ${data.code}]: ${data.message}`));
      } else {
        pending.resolve(data);
      }
    }
  }

  public async initialize(): Promise<boolean> {
    if (this.isInitialized && this.iframe) {
      return true;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise<boolean>(resolve => {
      let isSettled = false;
      const finish = (result: boolean) => {
        if (isSettled) return;
        isSettled = true;
        this.initResolver = null;
        if (!result) {
          this.initPromise = null; // Reset so retry can attempt handshake again
        }
        resolve(result);
      };

      this.initResolver = finish;

      try {
        if (typeof document === 'undefined') {
          finish(false);
          return;
        }

        const origin = getSignerOrigin();
        let frame = document.getElementById('sx-isolated-signer-frame') as HTMLIFrameElement | null;

        if (!frame) {
          frame = document.createElement('iframe');
          frame.id = 'sx-isolated-signer-frame';
          frame.src = `${origin}/index.html`;
          frame.style.display = 'none';
          frame.setAttribute('aria-hidden', 'true');
          frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
          document.body.appendChild(frame);
        }

        this.iframe = frame;

        // Poll with PING until ready or timeout
        let attempts = 0;
        const maxAttempts = 25;

        const checkPing = async () => {
          if (isSettled) return;
          attempts++;
          try {
            const pong = await this.sendRpc({ type: 'SX_SIGNER_PING' }, 600);
            if (pong && pong.type === 'SX_SIGNER_PONG') {
              this.isInitialized = true;
              if (pong.agentAddress) {
                this.cachedAddress = pong.agentAddress;
              }
              finish(true);
              return;
            }
          } catch {
            // Wait for next attempt
          }

          if (attempts < maxAttempts && !isSettled) {
            setTimeout(checkPing, 200);
          } else if (!isSettled) {
            console.warn('[SignerIframeBridge] Isolated signer iframe handshake timed out.');
            finish(false);
          }
        };

        let started = false;
        const startPings = () => {
          if (started) return;
          started = true;
          setTimeout(checkPing, 100);
        };

        frame.onload = startPings;
        // Also start pings eagerly in case onload already fired
        setTimeout(startPings, 300);
      } catch (e) {
        console.error('[SignerIframeBridge] Initialization error:', e);
        finish(false);
      }
    });

    return this.initPromise;
  }

  private sendRpc<T = any>(payload: any, timeoutMs = 8000): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (!this.iframe || !this.iframe.contentWindow) {
        reject(new Error('Signer iframe not attached to document'));
        return;
      }

      const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const message = {
        ...payload,
        protocol: 'SX_ISOLATED_SIGNER_V1',
        requestId,
      };

      const timer = setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error(`Signer request timeout after ${timeoutMs}ms (${payload.type})`));
        }
      }, timeoutMs);

      this.pendingRequests.set(requestId, { resolve, reject, timer });
      const targetOrigin = import.meta.env.DEV ? '*' : getSignerOrigin();
      this.iframe.contentWindow.postMessage(message, targetOrigin);
    });
  }

  public async getAddress(): Promise<string> {
    if (this.cachedAddress) return this.cachedAddress;
    const isReady = await this.initialize();
    if (!isReady) {
      throw new Error('Signer iframe is not ready');
    }
    const res = await this.sendRpc({ type: 'SX_GET_OR_CREATE_KEY' });
    this.cachedAddress = res.agentAddress;
    return res.agentAddress;
  }

  public async getOrCreateAgentKey(userAddress: string): Promise<string> {
    await this.initialize();
    const res = await this.sendRpc({
      type: 'SX_GET_OR_CREATE_KEY',
      userAddress,
    });
    this.cachedAddress = res.agentAddress;
    return res.agentAddress;
  }

  public async importLegacyKey(privKeyHex: string): Promise<string> {
    await this.initialize();
    const res = await this.sendRpc({
      type: 'SX_IMPORT_LEGACY_KEY',
      privKeyHex,
    });
    this.cachedAddress = res.agentAddress;
    return res.agentAddress;
  }

  public async signAsterRequest(params: AsterSignRequestParams): Promise<AsterSignResponse> {
    await this.initialize();
    const res = await this.sendRpc({
      type: 'SX_SIGN_ASTER_REQUEST',
      userAddress: params.userAddress,
      method: params.method,
      path: params.path,
      params: params.params,
      chainId: params.chainId,
      serverTime: params.serverTime,
    });

    return {
      signature: res.signature,
      nonce: res.nonce,
      timestamp: res.timestamp,
      signerAddress: res.signerAddress,
    };
  }

  public async signTypedData(
    domain: any,
    types: Record<string, Array<{ name: string; type: string }>>,
    value: Record<string, unknown>
  ): Promise<string> {
    await this.initialize();
    const res = await this.sendRpc({
      type: 'SX_SIGN_TYPED_DATA',
      domain,
      types,
      value,
    });
    return res.signature;
  }

  public async revokeKey(): Promise<boolean> {
    this.cachedAddress = null;
    try {
      await this.initialize();
      const res = await this.sendRpc({ type: 'SX_REVOKE_KEY' });
      return !!res.success;
    } catch (e) {
      console.error('[SignerIframeBridge] Revoke error:', e);
      return false;
    }
  }
}

export const signerIframeBridge = new SignerIframeBridge();
