import { type Signer, getAddress } from 'ethers';

import { asterHttpClient } from '../client/asterHttpClient';
import { AsterUserRejectedError } from '../client/errors';
import { getAsterChainId, getAsterRestUrl } from '../constants';
import type { IAsterSigner } from '../types/signer';
import { parseAsterError } from './errors';

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

export const EIP712_TYPES = {
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

export function throwIfApiError(data: any): void {
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
      const data = await asterHttpClient.request<any>(`${restUrl}/fapi/v3/time`, {
        method: 'GET',
        weight: 1,
        ttlMs: 60_000,
        timeoutMs: 2500,
      });
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

const ALLOWED_ASTER_HOSTNAMES = new Set([
  'fapi.asterdex.com',
  'fapi.asterdex-testnet.com',
  'sapi.asterdex.com',
  'www.asterdex.com',
]);

export async function signedRequest(
  signer: Signer | IAsterSigner,
  userAddr: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  params: Record<string, string> = {},
  baseUrl?: string,
  signal?: AbortSignal,
  weight: number = 1
): Promise<any> {
  if (signal?.aborted) {
    throw new Error('Request aborted');
  }

  if (!signer || !userAddr) {
    throw new Error('Wallet signer and user address are required for private Aster requests.');
  }

  const defaultBaseUrl = getAsterRestUrl();
  let effectiveBaseUrl = defaultBaseUrl;
  if (baseUrl) {
    try {
      const parsed = new URL(baseUrl);
      if (parsed.protocol !== 'https:') {
        throw new Error(`Insecure protocol: ${parsed.protocol}`);
      }
      if (!ALLOWED_ASTER_HOSTNAMES.has(parsed.hostname)) {
        throw new Error(`Unauthorized base URL hostname: ${parsed.hostname}`);
      }
      effectiveBaseUrl = baseUrl;
    } catch (err) {
      throw new Error(
        `Unauthorized base URL for signed request: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  const chainId = getAsterChainId();
  let signature: string;
  let finalQs: string;

  if ('signAsterRequest' in signer) {
    const serverTime = await getSyncedServerTime(effectiveBaseUrl);
    const signResult = await signer.signAsterRequest({
      userAddress: userAddr,
      method,
      path,
      params,
      chainId,
      serverTime,
    });
    signature = signResult.signature;

    const allParams: Record<string, string> = {
      ...params,
      user: getAddress(userAddr),
      signer: getAddress(signResult.signerAddress),
      nonce: signResult.nonce,
      timestamp: signResult.timestamp,
      recvWindow: '5000',
    };
    const sortedQs = buildSortedQueryString(allParams);
    finalQs = `${sortedQs}&signature=${signature}`;
  } else {
    let signerAddr: string;
    try {
      signerAddr = await signer.getAddress();
    } catch (err: any) {
      if (err?.code === 4001 || /rejected|denied/i.test(err?.message || '')) {
        throw new AsterUserRejectedError('User rejected address retrieval.');
      }
      throw err;
    }

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

    try {
      signature = await signer.signTypedData(typedData.domain, EIP712_TYPES, typedData.message);
    } catch (err: any) {
      if (err?.code === 4001 || /rejected|denied|user rejected/i.test(err?.message || '')) {
        throw new AsterUserRejectedError('User rejected cryptographic signature.');
      }
      throw err;
    }

    finalQs = `${sortedQs}&signature=${signature}`;
  }

  let url: string;
  let options: import('../client/asterHttpClient').AsterRequestOptions;

  if (method === 'GET') {
    url = `${effectiveBaseUrl}${path}?${finalQs}`;
    options = {
      method: 'GET',
      weight,
      signal,
    };
  } else {
    url = `${effectiveBaseUrl}${path}`;
    options = {
      method,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: finalQs,
      weight,
      signal,
    };
  }

  const data = await asterHttpClient.request(url, options);
  throwIfApiError(data);
  return data;
}
