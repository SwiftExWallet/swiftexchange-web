import { parseRawChainId, switchOrAddChain } from '../modules/evm/utils/evmChainUtils';
import { WALLET_METADATA_MAP } from '../modules/walletconnect/constants/Wallet';
import { useGlobalTxStore } from '../modules/walletconnect/store/globalTxStore';
import { sendCustomNotification } from '../service/notificationService';

export function isMobileDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const isIPadOS =
    typeof navigator.platform === 'string' &&
    navigator.platform === 'MacIntel' &&
    (navigator.maxTouchPoints || 0) > 1 &&
    !/Macintosh/i.test(ua);
  return isMobileUA || isIPadOS;
}

export function isInAppBrowser(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Trust|MetaMask|Keplr|Freighter|LOBSTR|CoinbaseWallet|TokenPocket|Rainbow/i.test(ua);
}

/**
 * Formats a native deep link according to the wallet's URL scheme specification.
 */
export function buildNativeDeepLink(nativeScheme: string, uri: string): string {
  if (!nativeScheme || !uri) return '';
  const encodedUri = encodeURIComponent(uri);

  // If scheme already has a path (e.g., 'freighterwallet://wc-redirect' or 'swiftEx://app.swiftexchange.io')
  if (nativeScheme.includes('://') && nativeScheme.split('://')[1]?.length > 0) {
    const afterScheme = nativeScheme.split('://')[1];
    if (afterScheme.includes('?')) {
      return `${nativeScheme}&uri=${encodedUri}`;
    }
    // Freighter uses direct query param after wc-redirect
    if (nativeScheme.includes('wc-redirect')) {
      return `${nativeScheme}?uri=${encodedUri}`;
    }
    const separator = nativeScheme.endsWith('/') ? '' : '/';
    return `${nativeScheme}${separator}wc?uri=${encodedUri}`;
  }

  // Pure protocol schemes (e.g. 'metamask://', 'trust://', 'lobstr://', 'hotwallet://')
  const base = nativeScheme.endsWith('://') ? nativeScheme : `${nativeScheme}://`;
  return `${base}wc?uri=${encodedUri}`;
}

/**
 * Formats a universal link according to the wallet's URL specification.
 */
export function buildUniversalDeepLink(universalUrl: string, uri: string): string {
  if (!universalUrl || !uri) return '';
  const encodedUri = encodeURIComponent(uri);

  // Handle URL that already has query parameters
  if (universalUrl.includes('?')) {
    return `${universalUrl}&uri=${encodedUri}`;
  }

  // Handle paths that already include target endpoint (e.g., '/uni/wc', '/link', '/wc')
  if (
    universalUrl.endsWith('/uni/wc') ||
    universalUrl.endsWith('/link') ||
    universalUrl.endsWith('/wc')
  ) {
    return `${universalUrl}?uri=${encodedUri}`;
  }

  // Handle base domain (e.g., 'https://metamask.app.link' -> 'https://metamask.app.link/wc?uri=...')
  const cleanBase = universalUrl.replace(/\/+$/, '');
  return `${cleanBase}/wc?uri=${encodedUri}`;
}

/**
 * Returns formatted Universal Link or Native Deep Link for a given wallet ID and WC pairing URI.
 * By default, prefers native custom schemes on mobile devices to prevent intermediate website bounces.
 */
export function formatWalletDeepLink(walletId: string, uri: string, preferNative = false): string {
  if (!uri) return '';

  const meta = WALLET_METADATA_MAP[walletId];
  if (!meta || !meta.redirects) {
    return uri;
  }

  const { native, universal } = meta.redirects;

  if (preferNative && native) {
    return buildNativeDeepLink(native, uri);
  }

  if (universal) {
    return buildUniversalDeepLink(universal, uri);
  }

  if (native) {
    return buildNativeDeepLink(native, uri);
  }

  return uri;
}

/**
 * Returns both universal and native formatted links for the wallet.
 */
export function getWalletRedirectUrls(
  walletId: string,
  uri: string
): { universal?: string; native?: string; formattedUrl: string } {
  if (!uri) return { formattedUrl: '' };

  const meta = WALLET_METADATA_MAP[walletId];
  if (!meta?.redirects) {
    return { formattedUrl: uri };
  }

  const universalUrl = meta.redirects.universal
    ? buildUniversalDeepLink(meta.redirects.universal, uri)
    : undefined;

  const nativeUrl = meta.redirects.native
    ? buildNativeDeepLink(meta.redirects.native, uri)
    : undefined;

  // On mobile devices, prioritize native direct custom schemes (metamask://, trust://, etc.)
  // to avoid intermediate browser splash pages or redirect blocking.
  const formattedUrl = nativeUrl || universalUrl || uri;

  return {
    universal: universalUrl,
    native: nativeUrl,
    formattedUrl,
  };
}

/**
 * Directly navigates to the mobile wallet using native deep link (preferred) or universal link.
 * Direct synchronous navigation avoids iOS Safari popup/redirect blocking.
 */
export function openMobileWallet(walletId: string, uri: string): void {
  if (!isMobileDevice() || isInAppBrowser()) return;

  const { formattedUrl } = getWalletRedirectUrls(walletId, uri);
  if (!formattedUrl) return;

  try {
    window.location.href = formattedUrl;
  } catch (err) {
    console.warn('[WalletService] Failed to open mobile wallet:', err);
  }
}

export function getRequestExpiry(minutes = 2): number {
  return Math.floor(Date.now() / 1000) + minutes * 60;
}

function isWalletConnectProvider(provider: any): boolean {
  return !!(provider?.client && provider?.session && typeof provider.client.request === 'function');
}

/**
 * Attempts to respond to a pending WalletConnect session request with an error.
 * NOTE: This works for session-level requests routed through the WC relay.
 * For in-flight signing requests already shown inside a mobile wallet app (e.g. Trust Wallet),
 * the user must manually reject inside the wallet — this is a wallet security constraint.
 */
export async function rejectPendingWCRequest(
  provider: any,
  id: number,
  topic: string
): Promise<void> {
  if (!isWalletConnectProvider(provider)) return;
  try {
    await provider.client.respond({
      topic,
      response: {
        id,
        jsonrpc: '2.0',
        error: { code: 5000, message: 'User rejected the request' },
      },
    });
  } catch {
    // Silently ignore — the request may already be resolved on the relay side
  }
}

export async function notifyWalletSignRequest(to?: string): Promise<void> {
  const token = localStorage.getItem('device_token');
  if (!token) return;

  await sendCustomNotification(token, {
    title: 'Wallet Signature Required',
    body: `Open your wallet to sign the EVM transaction${to ? ` to ${to}` : ''}.`,
  }).catch(console.error);
}

export async function sendEVMTransaction(
  provider: any,
  chainId: number | string,
  txParams: Record<string, any>
): Promise<string> {
  const store = useGlobalTxStore.getState();

  // Use isLocked() which also auto-expires stale requests older than 90s
  if (store.isLocked()) {
    throw new Error('WALLET_PENDING');
  }

  const numericChainId = Number(chainId);

  if (isWalletConnectProvider(provider)) {
    const topic = provider.session?.topic;
    if (!topic) throw new Error('No WalletConnect session topic');

    const requestId = Date.now() * 1000 + Math.floor(Math.random() * 1000);
    store.setPending({ id: requestId, topic, type: 'send' });

    try {
      await notifyWalletSignRequest(txParams.to);
      const result = await provider.client.request({
        topic,
        chainId: `eip155:${numericChainId}`,
        request: {
          id: requestId,
          method: 'eth_sendTransaction',
          params: [txParams],
        },
      });

      if (typeof result === 'string') return result;
      if (result && typeof result === 'object' && result.hash) return result.hash;

      throw new Error('Transaction succeeded but wallet did not return a transaction hash');
    } finally {
      // Only clear if WE are still the owner of the pending slot
      if (useGlobalTxStore.getState().pendingRequest?.id === requestId) {
        useGlobalTxStore.getState().clearPending();
      }
    }
  }

  // ── Injected wallet fallback (MetaMask extension, Rabby, etc.) ──────────────
  const fallbackId = Date.now();
  useGlobalTxStore.getState().setPending({ id: fallbackId, topic: 'injected', type: 'send' });
  try {
    if (typeof provider.request === 'function' && numericChainId) {
      try {
        const rawChainId = await provider.request({ method: 'eth_chainId' });
        const activeChainId = parseRawChainId(rawChainId);
        if (activeChainId && activeChainId !== numericChainId) {
          await switchOrAddChain(provider, numericChainId);
          const postRaw = await provider.request({ method: 'eth_chainId' });
          const postChainId = parseRawChainId(postRaw);
          if (postChainId && postChainId !== numericChainId) {
            throw new Error(
              `Wallet network mismatch: active network (${postChainId}) does not match required network (${numericChainId}). Transaction aborted for safety.`
            );
          }
        }
      } catch (err: any) {
        if (err?.message?.includes('Wallet network mismatch')) {
          throw err;
        }
      }
    }

    await notifyWalletSignRequest(txParams.to);
    const result = await provider.request({
      method: 'eth_sendTransaction',
      params: [txParams],
    });

    if (typeof result === 'string') return result;
    if (result && typeof result === 'object' && result.hash) return result.hash;

    throw new Error('Transaction succeeded but wallet did not return a transaction hash');
  } finally {
    if (useGlobalTxStore.getState().pendingRequest?.id === fallbackId) {
      useGlobalTxStore.getState().clearPending();
    }
  }
}
