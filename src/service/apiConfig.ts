import { getAccessToken } from '../modules/walletconnect/services/Siweauthservice';

export const IS_DEV = import.meta.env.DEV;
export const IS_PROD = import.meta.env.PROD;

export function getValidDeviceToken(): string | null {
  if (typeof window === 'undefined') return null;
  const storedTimestamp = localStorage.getItem('device_token_timestamp');
  if (storedTimestamp) {
    const elapsed = Date.now() - parseInt(storedTimestamp, 10);
    const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    if (elapsed > ONE_WEEK_MS) {
      localStorage.removeItem('device_token');
      localStorage.removeItem('device_token_timestamp');
      return null;
    }
  }
  return localStorage.getItem('device_token');
}

type DeviceTokenListener = (token: string) => void;
const tokenListeners = new Set<DeviceTokenListener>();

export function onDeviceTokenChange(listener: DeviceTokenListener): () => void {
  tokenListeners.add(listener);
  return () => tokenListeners.delete(listener);
}

export function setDeviceToken(token: string): void {
  if (typeof window === 'undefined' || !token) return;
  localStorage.setItem('device_token', token);
  localStorage.setItem('device_token_timestamp', Date.now().toString());
  tokenListeners.forEach(listener => {
    try {
      listener(token);
    } catch (e) {
      console.error('[apiConfig] Error in token listener:', e);
    }
  });
}

export function clearDeviceToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('device_token');
  localStorage.removeItem('device_token_timestamp');
}

export function getCurrentNetwork(): 'mainnet' | 'testnet' {
  if (typeof window === 'undefined') return 'testnet';
  try {
    const isTestnetEnabled = import.meta.env.VITE_ENABLE_TESTNET === 'true';
    const isMainnetEnabled = import.meta.env.VITE_ENABLE_MAINNET !== 'false' || !isTestnetEnabled;
    if (!isTestnetEnabled) return 'mainnet';
    if (!isMainnetEnabled) return 'testnet';
    const stored = localStorage.getItem('network');
    return stored === 'mainnet' ? 'mainnet' : 'testnet';
  } catch {
    return 'testnet';
  }
}

export function getServerUrl(): string {
  const network = getCurrentNetwork();
  if (network === 'testnet') {
    return import.meta.env.VITE_BASE_SERVER_URL_TEST || 'https://dev.swiftexchange.io/api/v1';
  }
  return import.meta.env.VITE_BASE_SERVER_URL_PROD || 'https://beta-v2.swiftexchange.io/api/v1';
}

type WalletAddressGetter = (chainType?: 'evm' | 'stellar' | string) => string;

let activeWalletAddressGetter: WalletAddressGetter = (chainType?: string) => {
  if (typeof window === 'undefined') return '';
  try {
    const raw = localStorage.getItem('wallet_sessions');
    if (!raw) return '';
    const data = JSON.parse(raw);
    const evm = data.evm?.evmAddress || data.evm?.address || '';
    const stellar = data.stellar?.stellarAddress || data.stellar?.address || '';
    if (chainType) {
      const trimmed = chainType.trim();
      if (trimmed.startsWith('G') || trimmed.startsWith('C') || trimmed.startsWith('0x')) {
        return trimmed;
      }
      const lower = trimmed.toLowerCase();
      if (
        lower === 'stellar' ||
        lower === 'soroban' ||
        lower.includes('/stellar') ||
        lower.includes('/soroswap') ||
        lower.includes('stellar') ||
        lower.includes('soroban')
      ) {
        return stellar;
      }
      if (
        lower === 'evm' ||
        lower === 'eth' ||
        lower.includes('/eth') ||
        lower.includes('/evm') ||
        lower.includes('eth') ||
        lower.includes('evm')
      ) {
        return evm;
      }
    }
    return evm || stellar || '';
  } catch {
    return '';
  }
};

export function setWalletAddressGetter(getter: WalletAddressGetter): void {
  activeWalletAddressGetter = getter;
}

export function getConnectedWalletAddress(chainType?: 'evm' | 'stellar' | string): string {
  return activeWalletAddressGetter(chainType);
}

export const API_CONFIG = {
  get serverUrl(): string {
    return getServerUrl();
  },
  get proxyUrl(): string {
    return getServerUrl();
  },
  get deviceToken(): string | null {
    return getValidDeviceToken();
  },
  get deviceAuth(): string {
    return getValidDeviceToken() || getAccessToken() || import.meta.env.VITE_API_DEVICE_AUTH || '';
  },
  get deviceJwt(): string {
    return getValidDeviceToken() || getAccessToken() || '';
  },
  get walletAddress(): string {
    return getConnectedWalletAddress();
  },
  getWalletAddress(chainType?: 'evm' | 'stellar' | string): string {
    return getConnectedWalletAddress(chainType);
  },
  getActivateWalletUrl(address: string): string {
    return `${getServerUrl()}/wallet/${address}/activate-wallet`;
  },
} as const;

export function getActivateWalletUrl(address: string): string {
  return `${getServerUrl()}/wallet/${address}/activate-wallet`;
}

if (IS_DEV) {
  const missing = (Object.entries(API_CONFIG) as [string, string][])
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length) {
    console.warn(`[apiConfig] Missing env vars: ${missing.join(', ')}`);
  }
}
