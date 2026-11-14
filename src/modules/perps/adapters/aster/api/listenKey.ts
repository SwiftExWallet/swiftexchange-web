import type { Signer } from 'ethers';

import { ASTER_ENDPOINTS } from '../constants';
import { signedRequest } from './auth';

export const LISTEN_KEY_KEEPALIVE_MS = 2700000;

export async function createListenKey(signer: Signer, userAddr: string): Promise<string> {
  const data = await signedRequest(signer, userAddr, 'POST', ASTER_ENDPOINTS.LISTEN_KEY);
  if (!data.listenKey) throw new Error(`Failed to create listenKey: ${JSON.stringify(data)}`);
  return data.listenKey as string;
}

export async function keepaliveListenKey(signer: Signer, userAddr: string): Promise<void> {
  await signedRequest(signer, userAddr, 'PUT', ASTER_ENDPOINTS.LISTEN_KEY);
}

export async function deleteListenKey(signer: Signer, userAddr: string): Promise<void> {
  await signedRequest(signer, userAddr, 'DELETE', ASTER_ENDPOINTS.LISTEN_KEY);
}
