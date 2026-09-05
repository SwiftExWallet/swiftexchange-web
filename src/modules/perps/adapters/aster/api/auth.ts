import { type Signer, getAddress } from 'ethers';

import { getAsterChainId, getAsterRestUrl } from '../constants';
import { parseAsterError } from './errors';

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

  constructor(raw: { code: number; msg: string }) {
    const detail = parseAsterError(raw);
    super(`Aster API error ${raw.code}: ${raw.msg}`);
    this.code = raw.code;
    this.msg = raw.msg;
    this.userMessage = detail.userMessage;
  }
}

function throwIfApiError(data: any): void {
  if (data && typeof data.code === 'number' && data.code < 0) {
    throw new AsterApiError(data as { code: number; msg: string });
  }
}

let serverTimeOffset = 0;
let lastTimeSync = 0;

export async function getSyncedServerTime(baseUrl?: string): Promise<number> {
  const restUrl = baseUrl || getAsterRestUrl();
  const now = Date.now();
  if (now - lastTimeSync < 60000 && lastTimeSync > 0) {
    return now + serverTimeOffset;
  }
  try {
    const res = await fetch(`${restUrl}/fapi/v3/time`);
    const data = await res.json();
    if (data && typeof data.serverTime === 'number') {
      serverTimeOffset = data.serverTime - Date.now();
      lastTimeSync = Date.now();
      return data.serverTime;
    }
  } catch (err) {
    console.warn('[aster] Failed to sync server time, falling back to local time', err);
  }
  return Date.now();
}

export async function signedRequest(
  signer: Signer,
  userAddr: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  params: Record<string, string> = {},
  baseUrl?: string
): Promise<any> {
  const effectiveBaseUrl = baseUrl || getAsterRestUrl();
  const chainId = getAsterChainId();
  const signerAddr = await signer.getAddress();
  const serverTime = await getSyncedServerTime(effectiveBaseUrl);
  const nonce = String(serverTime * 1000);

  const ordered: Record<string, string> = {
    user: getAddress(userAddr),
    signer: getAddress(signerAddr),
    ...params,
    nonce,
  };

  const qs = new URLSearchParams(ordered).toString();
  const typedData = buildTypedData(qs, chainId);

  const signature = await signer.signTypedData(typedData.domain, EIP712_TYPES, typedData.message);

  const finalQs = `${qs}&signature=${signature}`;

  let url: string;
  let fetchOptions: RequestInit;

  if (method === 'GET') {
    url = `${effectiveBaseUrl}${path}?${finalQs}`;
    fetchOptions = { method: 'GET' };
  } else {
    url = `${effectiveBaseUrl}${path}`;
    fetchOptions = {
      method,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: finalQs,
    };
  }

  const res = await fetch(url, fetchOptions);
  const data = await res.json();
  throwIfApiError(data);
  return data;
}
