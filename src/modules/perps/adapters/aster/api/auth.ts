import { type Signer, getAddress } from 'ethers';

import { getAsterChainId, getAsterRestUrl } from '../constants';
import { AsterRateLimitError, parseAsterError } from './errors';

export function buildSortedQueryString(params: Record<string, string>): string {
  const keys = Object.keys(params).sort();
  return keys.map(k => `${k}=${params[k]}`).join('&');
}

export function getAsterDomain(chainId: number = getAsterChainId()) {
  return {
    name: 'AsterSignTransaction',
    version: '1',
    chainId,
    verifyingContract: '0x0000000000000000000000000000000000000000',
  } as const;
}

const EIP712_TYPES = {
  Message: [{ name: 'msg', type: 'string' }],
};

export interface TypedDataPayload {
  types: {
    EIP712Domain: { name: string; type: string }[];
    Message: { name: string; type: string }[];
  };
  primaryType: 'Message';
  domain: ReturnType<typeof getAsterDomain>;
  message: { msg: string };
}

export function buildTypedData(msg: string, chainId: number = getAsterChainId()): TypedDataPayload {
  return {
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      Message: [{ name: 'msg', type: 'string' }],
    },
    primaryType: 'Message',
    domain: getAsterDomain(chainId),
    message: { msg },
  };
}

export class AsterApiError extends Error {
  readonly code: number;
  readonly msg: string;
  readonly userMessage: string;
  readonly isRetryable: boolean;

  constructor(raw: { code: number; msg: string }) {
    const detail = parseAsterError(raw);
    super(`Aster API error ${raw.code}: ${raw.msg}`);
    this.code = raw.code;
    this.msg = raw.msg;
    this.userMessage = detail.userMessage;
    this.isRetryable = !!detail.isRetryable;
  }
}

function throwIfApiError(data: any): void {
  if (data && typeof data.code === 'number' && data.code < 0) {
    throw new AsterApiError(data as { code: number; msg: string });
  }
}

let serverTimeOffset = 0;
let lastTimeSync = 0;
let lastGeneratedNonce = 0n;
let pendingTimeSyncPromise: Promise<number> | null = null;

export function generateMonotonicNonce(serverTimeMs: number): string {
  const baseMicro = BigInt(Math.floor(serverTimeMs)) * 1000n;
  if (baseMicro > lastGeneratedNonce) {
    lastGeneratedNonce = baseMicro;
  } else {
    lastGeneratedNonce += 1n;
  }
  return lastGeneratedNonce.toString();
}

export async function getSyncedServerTime(baseUrl?: string): Promise<number> {
  const now = Date.now();
  if (now - lastTimeSync < 60000 && lastTimeSync > 0) {
    return now + serverTimeOffset;
  }

  if (pendingTimeSyncPromise) {
    return pendingTimeSyncPromise;
  }

  const restUrl = baseUrl || getAsterRestUrl();
  pendingTimeSyncPromise = (async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);
      const res = await fetch(`${restUrl}/fapi/v3/time`, { signal: controller.signal });
      clearTimeout(timeoutId);
      const data = await res.json();
      if (data && typeof data.serverTime === 'number') {
        serverTimeOffset = data.serverTime - Date.now();
        lastTimeSync = Date.now();
        return data.serverTime;
      }
    } catch {
      // Quiet fallback to local time without blocking the UI
      lastTimeSync = Date.now();
    } finally {
      pendingTimeSyncPromise = null;
    }
    return Date.now() + serverTimeOffset;
  })();

  return pendingTimeSyncPromise;
}

export async function signedRequest(
  signer: Signer,
  userAddr: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  params: Record<string, string> = {},
  baseUrl?: string
): Promise<any> {
  const defaultBaseUrl = getAsterRestUrl();
  let effectiveBaseUrl = defaultBaseUrl;
  if (baseUrl) {
    const isAllowed =
      baseUrl.startsWith('https://fapi.asterdex.com') ||
      baseUrl.startsWith('https://fapi.asterdex-testnet.com') ||
      baseUrl.startsWith('https://sapi.asterdex.com') ||
      baseUrl.startsWith('https://www.asterdex.com');
    if (!isAllowed) {
      throw new Error(`Unauthorized base URL for signed request: ${baseUrl}`);
    }
    effectiveBaseUrl = baseUrl;
  }
  const chainId = getAsterChainId();
  const signerAddr = await signer.getAddress();
  const serverTime = await getSyncedServerTime(effectiveBaseUrl);
  const nonce = generateMonotonicNonce(serverTime);

  const allParams: Record<string, string> = {
    ...params,
    user: getAddress(userAddr),
    signer: getAddress(signerAddr),
    nonce,
    timestamp: String(serverTime),
    recvWindow: '5000',
  };

  const sortedQs = buildSortedQueryString(allParams);
  const typedData = buildTypedData(sortedQs, chainId);

  const signature = await signer.signTypedData(typedData.domain, EIP712_TYPES, typedData.message);
  const finalQs = `${sortedQs}&signature=${signature}`;

  let url: string;
  let fetchOptions: RequestInit;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  if (method === 'GET') {
    url = `${effectiveBaseUrl}${path}?${finalQs}`;
    fetchOptions = { method: 'GET', signal: controller.signal };
  } else {
    url = `${effectiveBaseUrl}${path}`;
    fetchOptions = {
      method,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: finalQs,
      signal: controller.signal,
    };
  }

  let res: Response;
  try {
    res = await fetch(url, fetchOptions);
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err?.name === 'AbortError') {
      throw new Error(`Aster API request timed out after 15s: ${method} ${path}`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (res.status === 429 || res.status === 418) {
    const retryHeader = res.headers.get('Retry-After');
    const retrySec = retryHeader ? parseInt(retryHeader, 10) || 60 : 60;
    throw new AsterRateLimitError(res.status, retrySec);
  }

  if (res.status >= 500) {
    throw new Error(
      `Aster server error (HTTP ${res.status}) on ${method} ${path}. Execution status unknown.`
    );
  }

  const data = await res.json();
  throwIfApiError(data);
  return data;
}
