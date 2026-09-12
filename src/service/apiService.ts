import { onJwtSessionSet } from '../modules/walletconnect/services/Siweauthservice';
import { useWalletStore } from '../modules/walletconnect/store/walletConnectStore';
import type { ApiResponse } from '../types/evm/apiResponse.type';
import {
  GAS_TTL,
  dropPnlInflight,
  getGasKey,
  getPnlCache,
  getPnlInflight,
  readLocalCache,
  readStaleCache,
  setPnlCache,
  setPnlInflight,
  writeLocalCache,
} from './apiCache';
import { API_CONFIG, getValidDeviceToken, onDeviceTokenChange } from './apiConfig';

export interface RegisterWalletPayload {
  addresses: {
    multi: string;
    [key: string]: string;
  };
  isPrimary?: boolean;
}

export interface RegisterWalletResponse {
  success?: boolean;
  message?: string;
  data?: any;
  [key: string]: any;
}

const linkedWalletsCache = new Set<string>();
const inflightWalletLinks = new Map<string, Promise<boolean>>();

function getLinkCacheKey(token: string, address: string): string {
  return `_sx_wallet_linked_${token.slice(-16)}_${address.toLowerCase()}`;
}

export function isWalletLinkedToDevice(walletAddress?: string, deviceToken?: string): boolean {
  if (typeof window === 'undefined') return false;
  // Only check against the real device_token, not the SIWE JWT
  const token = deviceToken || getValidDeviceToken();
  const address = walletAddress || getConnectedWalletAddress();
  if (!token || !address) return false;
  const key = getLinkCacheKey(token, address);
  return linkedWalletsCache.has(key) || sessionStorage.getItem(key) === 'true';
}

export async function registerWalletToDevice(
  walletAddress?: string,
  deviceToken?: string
): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  // IMPORTANT: Only use the real device_token (x-auth-device-token header).
  // Do NOT fall back to the SIWE JWT — the backend /wallet route rejects it with 401.
  const token = deviceToken || getValidDeviceToken();
  const address = walletAddress || getConnectedWalletAddress();

  if (!token || !address) {
    return false;
  }

  const key = getLinkCacheKey(token, address);
  if (linkedWalletsCache.has(key) || sessionStorage.getItem(key) === 'true') {
    return true;
  }

  if (inflightWalletLinks.has(key)) {
    return inflightWalletLinks.get(key)!;
  }

  const linkPromise = (async () => {
    try {
      const url = `${API_CONFIG.serverUrl}/wallet`;
      const payload: RegisterWalletPayload = {
        addresses: {
          multi: address,
        },
        isPrimary: true,
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-device-token': token,
        },
        body: JSON.stringify(payload),
      });

      if (res.ok || res.status === 409) {
        linkedWalletsCache.add(key);
        try {
          sessionStorage.setItem(key, 'true');
        } catch {
          /* ignore storage quota */
        }
        return true;
      }

      console.warn(
        `[apiService] Wallet registration returned status ${res.status}: ${res.statusText}`
      );
      return false;
    } catch (err) {
      console.warn('[apiService] Failed to register wallet to device token:', err);
      return false;
    } finally {
      inflightWalletLinks.delete(key);
    }
  })();

  inflightWalletLinks.set(key, linkPromise);
  return linkPromise;
}

export async function ensureWalletLinkedToDevice(
  walletAddress?: string,
  deviceToken?: string
): Promise<boolean> {
  if (isWalletLinkedToDevice(walletAddress, deviceToken)) {
    return true;
  }
  return registerWalletToDevice(walletAddress, deviceToken);
}

// Auto-link triggers when token or wallet address updates
if (typeof window !== 'undefined') {
  // Trigger 1: New device token received → link current wallet
  onDeviceTokenChange(token => {
    const address = getConnectedWalletAddress();
    if (address && token) {
      ensureWalletLinkedToDevice(address, token).catch(() => {});
    }
  });

  // Trigger 2: JWT (accessToken) received → link its wallet address to device token
  // Wallet address comes from the JWT payload; device_token read directly from localStorage.
  // NOTE: we must use getValidDeviceToken() here — NOT API_CONFIG.deviceAuth which falls
  // back to the SIWE JWT and would cause a 401 on the /wallet endpoint.
  onJwtSessionSet((_accessToken, walletAddress) => {
    if (!walletAddress) return;
    const deviceToken = getValidDeviceToken();
    if (!deviceToken) {
      console.warn(
        '[apiService] JWT received but no device_token in localStorage — skipping wallet link'
      );
      return;
    }
    console.log(
      '[apiService] JWT received — linking wallet to device:',
      walletAddress.slice(0, 10) + '...'
    );
    ensureWalletLinkedToDevice(walletAddress, deviceToken).catch(err => {
      console.warn('[apiService] Failed to link wallet after JWT received:', err);
    });
  });

  // Trigger 3: Wallet address changes in store → ensure link with current device token
  try {
    useWalletStore.subscribe(
      state => {
        const evmAddr = state.connectedWallets.evm?.address;
        const stellarAddr = state.connectedWallets.stellar?.address;
        return evmAddr || stellarAddr || '';
      },
      newAddress => {
        if (newAddress) {
          const token = API_CONFIG.deviceAuth;
          if (token) {
            ensureWalletLinkedToDevice(newAddress, token).catch(() => {});
          }
        }
      }
    );
  } catch {
    /* ignore store subscription errors during initialization */
  }
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 1,
  delay = 1000
): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      if (res.status >= 400 && res.status < 500) return res; // never retry 4xx
      if (i === retries - 1) return res;
    } catch (err) {
      if (i === retries - 1) throw err;
    }
    await new Promise(r => setTimeout(r, delay * (i + 1)));
  }
  throw new Error('Max retries reached');
}

async function parseError(res: Response): Promise<string> {
  try {
    const text = await res.text();
    if (!text) return res.statusText;
    const body = JSON.parse(text);
    const raw = body.message || body.error;
    if (Array.isArray(raw)) return raw.join('. ');
    if (typeof raw === 'string') return raw;
  } catch {
    /* ignore */
  }
  return res.statusText;
}

function getConnectedWalletAddress(): string {
  try {
    const state = useWalletStore.getState();
    const evmAddr = state.connectedWallets.evm?.address;
    if (evmAddr) return evmAddr;
    const stellarAddr = state.connectedWallets.stellar?.address;
    if (stellarAddr) return stellarAddr;

    // Fallback to session storage if store hasn't populated yet
    const stored = localStorage.getItem('wallet_sessions');
    if (stored) {
      const data = JSON.parse(stored);
      if (data.evm?.evmAddress) return data.evm.evmAddress;
      if (data.stellar?.stellarAddress) return data.stellar.stellarAddress;
    }
  } catch {
    /* ignore */
  }
  return '';
}

function makeHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = API_CONFIG.deviceAuth;
  const walletAddress = getConnectedWalletAddress();
  return {
    'Content-Type': 'application/json',
    'x-auth-device-token': token,
    ...(walletAddress ? { 'x-wallet-address': walletAddress } : {}),
    Authorization: token ? `Bearer ${token}` : '',
    ...extra,
  };
}

async function parseBody<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(text);
  }
}

// Public API
export async function fetchApiResponseFromProxy<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' = 'POST',
  body?: unknown,
  retries?: number,
  keepalive: boolean = false,
  signal?: AbortSignal
): Promise<ApiResponse<T>> {
  if (!endpoint.startsWith('/wallet') && !endpoint.startsWith('/device')) {
    const token = API_CONFIG.deviceAuth;
    const walletAddress = getConnectedWalletAddress();
    if (token && walletAddress && !isWalletLinkedToDevice(walletAddress, token)) {
      await ensureWalletLinkedToDevice(walletAddress, token);
    }
  }

  const res = await fetchWithRetry(
    `${API_CONFIG.serverUrl}${endpoint}`,
    {
      method,
      headers: makeHeaders(),
      body: body ? JSON.stringify(body) : undefined,
      keepalive,
      signal,
    },
    retries
  );
  if (!res.ok) throw new Error(`API error: ${await parseError(res)}`);
  return { data: await parseBody<T>(res) };
}

export async function fetchApiResponseFromServer<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PATCH' = 'POST',
  body?: unknown,
  retries?: number
): Promise<ApiResponse<T>> {
  if (!endpoint.startsWith('/wallet') && !endpoint.startsWith('/device')) {
    const token = API_CONFIG.deviceAuth;
    const walletAddress = getConnectedWalletAddress();
    if (token && walletAddress && !isWalletLinkedToDevice(walletAddress, token)) {
      await ensureWalletLinkedToDevice(walletAddress, token);
    }
  }

  const res = await fetchWithRetry(
    `${API_CONFIG.serverUrl}${endpoint}`,
    { method, headers: makeHeaders(), body: body ? JSON.stringify(body) : undefined },
    retries
  );
  if (!res.ok) throw new Error(`API error: ${await parseError(res)}`);
  return { data: await parseBody<T>(res) };
}

// Wallet Gas Info

export interface WalletGasInfo {
  transactionCount: number;
  gasFeeData: {
    _type: string;
    gasPrice: string;
    maxFeePerGas: string;
    maxPriorityFeePerGas: string;
  };
}

export async function getWalletGasInfo(
  prefix: string,
  address: string
): Promise<WalletGasInfo | null> {
  const key = getGasKey(prefix, address);

  const cached = readLocalCache<WalletGasInfo>(key, GAS_TTL);
  if (cached) return cached;

  try {
    const { data } = await fetchApiResponseFromProxy<WalletGasInfo>(
      `/eth/wallet-address/${address}/info`,
      'GET'
    );
    if (data) {
      writeLocalCache(key, data);
      return data;
    }
    return null;
  } catch {
    return readStaleCache<WalletGasInfo>(key);
  }
}

//Stellar PnL

export async function fetchStellarPnl(
  address: string,
  from: string,
  to: string,
  includeExcel: boolean = false
): Promise<unknown> {
  const token = API_CONFIG.deviceJwt;

  const key = `${address}_${from}_${to}_${includeExcel}`;

  const cached = getPnlCache(key);
  if (cached) return cached;
  const inFlight = getPnlInflight(key);
  if (inFlight) return inFlight;

  const promise = (async () => {
    const summary = !includeExcel;
    const connectedWallets = useWalletStore.getState().connectedWallets;
    const stellarWallet = connectedWallets.stellar;
    const evmWallet = connectedWallets.evm;
    const isOwnAddress =
      stellarWallet?.address && stellarWallet.address.toLowerCase() === address.toLowerCase();

    // Only use the authenticated route if both EVM and Stellar are connected,
    // we have a token, AND the address belongs to the connected Stellar wallet.
    const useAuthRoute = Boolean(token && isOwnAddress && evmWallet?.address);

    const basePath = useAuthRoute ? '/pnl' : '/pnl-public';
    const url = `${basePath}?address=${address}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&nocache=true&summary=${summary}&excel=${includeExcel}`;

    const headers: Record<string, string> = {};
    if (useAuthRoute) {
      headers['x-auth-device-token'] = token;
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetchWithRetry(url, {
      method: 'GET',
      headers,
    });

    if (!res.ok) {
      let errorMsg = `Stellar PNL error: ${res.statusText}`;
      try {
        const errorData = await parseBody<any>(res);
        if (errorData && typeof errorData === 'object') {
          if (errorData.title === 'Resource Missing' || errorData.status === 404) {
            errorMsg =
              'It seems like your wallet is not active on the Stellar network. Please deposit at least 1 XLM to activate it.';
          } else if (errorData.error) {
            errorMsg = errorData.error;
          }
        } else if (typeof errorData === 'string') {
          errorMsg = errorData;
        }
      } catch (e) {
        if (e instanceof Error && e.message) {
          errorMsg = e.message;
        }
      }
      throw new Error(errorMsg);
    }
    const data = await parseBody<unknown>(res);
    setPnlCache(key, data);
    return data;
  })();

  setPnlInflight(key, promise);
  try {
    return await promise;
  } finally {
    dropPnlInflight(key);
  }
}
