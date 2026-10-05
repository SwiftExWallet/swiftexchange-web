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
import {
  API_CONFIG,
  getValidDeviceToken,
  onDeviceTokenChange,
  setWalletAddressGetter,
} from './apiConfig';

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

  try {
    useWalletStore.subscribe(
      state => {
        const evmAddr = state.connectedWallets.evm?.address;
        const stellarAddr = state.connectedWallets.stellar?.address;
        return `${evmAddr || ''}:${stellarAddr || ''}`;
      },
      combo => {
        const token = API_CONFIG.deviceAuth;
        if (!token) return;
        const [evm, stellar] = combo.split(':');
        if (evm) ensureWalletLinkedToDevice(evm, token).catch(() => {});
        if (stellar) ensureWalletLinkedToDevice(stellar, token).catch(() => {});
      }
    );
  } catch {
    void 0;
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
      if (res.status >= 400 && res.status < 500) return res;
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
    void 0;
  }
  return res.statusText;
}

export function resolveConnectedWalletAddress(chainType?: 'evm' | 'stellar' | string): string {
  try {
    const state = useWalletStore.getState();
    const evmAddr = state?.connectedWallets?.evm?.address;
    const stellarAddr = state?.connectedWallets?.stellar?.address;

    let storedEvm = '';
    let storedStellar = '';
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('wallet_sessions');
      if (stored) {
        try {
          const data = JSON.parse(stored);
          storedEvm = data.evm?.evmAddress || data.evm?.address || '';
          storedStellar = data.stellar?.stellarAddress || data.stellar?.address || '';
        } catch {
          void 0;
        }
      }
    }

    const effectiveEvm = evmAddr || storedEvm;
    const effectiveStellar = stellarAddr || storedStellar;

    if (chainType) {
      const raw = chainType.trim();
      if (raw.startsWith('G') || raw.startsWith('C')) {
        return raw;
      }
      if (raw.startsWith('0x')) {
        return raw;
      }

      const lower = raw.toLowerCase();
      if (
        lower === 'stellar' ||
        lower === 'soroban' ||
        lower.includes('/stellar') ||
        lower.includes('/soroswap') ||
        lower.includes('stellar') ||
        lower.includes('soroban')
      ) {
        return effectiveStellar || '';
      }
      if (
        lower === 'evm' ||
        lower === 'eth' ||
        lower.includes('/eth') ||
        lower.includes('/evm') ||
        lower.includes('eth') ||
        lower.includes('evm')
      ) {
        return effectiveEvm || '';
      }
    }

    if (state?.authenticatedChain === 'stellar') {
      return effectiveStellar || effectiveEvm || '';
    }
    if (state?.authenticatedChain === 'evm') {
      return effectiveEvm || effectiveStellar || '';
    }

    return effectiveEvm || effectiveStellar || '';
  } catch {
    return '';
  }
}

setWalletAddressGetter(resolveConnectedWalletAddress);

export function getConnectedWalletAddress(chainType?: 'evm' | 'stellar' | string): string {
  return resolveConnectedWalletAddress(chainType);
}

export function inferChainType(
  chainTypeOrEndpoint?: string,
  extra?: Record<string, string>,
  body?: unknown
): 'evm' | 'stellar' | undefined {
  if (extra?.['x-wallet-chain']) {
    const c = extra['x-wallet-chain'].toLowerCase();
    if (c === 'stellar' || c === 'soroban') return 'stellar';
    if (c === 'evm' || c === 'eth') return 'evm';
  }

  if (extra?.['x-wallet-address']) {
    const addr = extra['x-wallet-address'];
    if (addr.startsWith('G') || addr.startsWith('C')) return 'stellar';
    if (addr.startsWith('0x')) return 'evm';
  }

  if (chainTypeOrEndpoint) {
    const lower = chainTypeOrEndpoint.toLowerCase();
    if (
      lower === 'stellar' ||
      lower === 'soroban' ||
      lower.includes('/stellar') ||
      lower.includes('/soroswap') ||
      lower.includes('stellar') ||
      lower.includes('soroban')
    ) {
      return 'stellar';
    }
    if (
      lower === 'evm' ||
      lower === 'eth' ||
      lower.includes('/eth') ||
      lower.includes('/evm') ||
      lower.includes('eth') ||
      lower.includes('evm')
    ) {
      return 'evm';
    }
  }

  if (body && typeof body === 'object') {
    const b = body as Record<string, any>;
    const candidateAddr =
      b.address ||
      b.walletAddress ||
      b.fromAddress ||
      b.from ||
      b.sender ||
      b.userAddress ||
      b.recipient ||
      b.toAddress;

    if (typeof candidateAddr === 'string') {
      if (candidateAddr.startsWith('G') || candidateAddr.startsWith('C')) {
        return 'stellar';
      }
      if (candidateAddr.startsWith('0x')) {
        return 'evm';
      }
    }

    const candidateChain =
      b.chainId ||
      b.fromChainId ||
      b.toChainId ||
      b.sourceChain ||
      b.destChain ||
      b.fromChain ||
      b.toChain ||
      b.chain;

    if (typeof candidateChain === 'string') {
      const lower = candidateChain.toLowerCase();
      if (lower.includes('stellar') || lower.includes('soroban')) {
        return 'stellar';
      }
      if (
        lower.includes('eth') ||
        lower.includes('evm') ||
        lower.includes('polygon') ||
        lower.includes('arbitrum') ||
        lower.includes('base') ||
        lower.includes('optimism') ||
        lower.includes('bnb')
      ) {
        return 'evm';
      }
    }
  }

  return undefined;
}

export function makeHeaders(
  extra?: Record<string, string>,
  chainTypeOrEndpoint?: 'evm' | 'stellar' | string,
  body?: unknown
): Record<string, string> {
  const token = API_CONFIG.deviceAuth;
  const inferredChain = inferChainType(chainTypeOrEndpoint, extra, body);
  const walletAddress =
    extra?.['x-wallet-address'] || getConnectedWalletAddress(inferredChain || chainTypeOrEndpoint);

  const cleanExtra = { ...extra };
  delete cleanExtra['x-wallet-chain'];

  return {
    'Content-Type': 'application/json',
    'x-auth-wallet-token': token,
    'x-auth-device-token': token,
    ...(walletAddress ? { 'x-wallet-address': walletAddress } : {}),
    Authorization: token ? `Bearer ${token}` : '',
    ...cleanExtra,
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

export async function fetchApiResponseFromProxy<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' = 'POST',
  body?: unknown,
  retries?: number,
  keepalive: boolean = false,
  signal?: AbortSignal,
  chainTypeOverride?: 'evm' | 'stellar'
): Promise<ApiResponse<T>> {
  const targetChain = chainTypeOverride || inferChainType(endpoint, undefined, body);
  if (
    !endpoint.startsWith('/wallet') &&
    !endpoint.startsWith('/device') &&
    !endpoint.startsWith('/app-available')
  ) {
    const token = API_CONFIG.deviceAuth;
    const walletAddress = getConnectedWalletAddress(targetChain || endpoint);
    if (token && walletAddress && !isWalletLinkedToDevice(walletAddress, token)) {
      await ensureWalletLinkedToDevice(walletAddress, token);
    }
  }

  const res = await fetchWithRetry(
    `${API_CONFIG.serverUrl}${endpoint}`,
    {
      method,
      headers: makeHeaders(undefined, targetChain || endpoint, body),
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
  retries?: number,
  chainTypeOverride?: 'evm' | 'stellar'
): Promise<ApiResponse<T>> {
  const targetChain = chainTypeOverride || inferChainType(endpoint, undefined, body);
  if (
    !endpoint.startsWith('/wallet') &&
    !endpoint.startsWith('/device') &&
    !endpoint.startsWith('/app-available')
  ) {
    const token = API_CONFIG.deviceAuth;
    const walletAddress = getConnectedWalletAddress(targetChain || endpoint);
    if (token && walletAddress && !isWalletLinkedToDevice(walletAddress, token)) {
      await ensureWalletLinkedToDevice(walletAddress, token);
    }
  }

  const res = await fetchWithRetry(
    `${API_CONFIG.serverUrl}${endpoint}`,
    {
      method,
      headers: makeHeaders(undefined, targetChain || endpoint, body),
      body: body ? JSON.stringify(body) : undefined,
    },
    retries
  );
  if (!res.ok) throw new Error(`API error: ${await parseError(res)}`);
  return { data: await parseBody<T>(res) };
}

export async function fetchAppAvailability(): Promise<
  import('../types/availability').AppAvailabilityResponse
> {
  const url = `${API_CONFIG.serverUrl}/app-available`;
  const res = await fetchWithRetry(
    url,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    },
    2
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch app availability: ${res.statusText}`);
  }
  return parseBody<import('../types/availability').AppAvailabilityResponse>(res);
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
