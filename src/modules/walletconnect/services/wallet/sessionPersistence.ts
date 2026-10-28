import * as FreighterApi from '@stellar/freighter-api';

import { getStellarConfig } from '../../config/chains';
import { WALLET_METADATA_MAP } from '../../constants/Wallet';
import { setupEVMListeners, setupWalletConnectListeners } from './eventListeners';
import {
  discoverStellarExtensions,
  getOrCreateProvider,
  isSafeWalletRedirectUrl,
  resolveEvmProvider,
  wrapProviderRequests,
} from './providerRegistry';
import type { WalletServiceContext, WalletSession, WalletType } from './types';

const SESSION_STORAGE_KEY = 'wallet_sessions';
const EVM_ADDR_REGEX = /^0x[a-fA-F0-9]{8,64}$/i;
const STELLAR_ADDR_REGEX = /^[GC][A-Z0-9]{19,64}$/i;

function getSessionMetadata(walletId: string, peerMetadata?: any) {
  const fallback = WALLET_METADATA_MAP[walletId] || WALLET_METADATA_MAP['walletconnect'];
  const redirect = peerMetadata?.redirect;
  const isSafe =
    typeof redirect === 'string'
      ? isSafeWalletRedirectUrl(redirect)
      : redirect?.universal
        ? isSafeWalletRedirectUrl(redirect.universal)
        : false;
  const safeRedirect = isSafe ? redirect : undefined;
  return {
    peerName: peerMetadata?.name || fallback?.name || walletId,
    peerIcon: peerMetadata?.icons?.[0] || fallback?.icon || '',
    peerRedirect: safeRedirect || fallback?.redirects || undefined,
  };
}

export function saveSession(ctx: WalletServiceContext): void {
  try {
    if (ctx.sessions.size === 0) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      return;
    }
    const data: Record<string, WalletSession> = {};
    ctx.sessions.forEach((session, type) => {
      data[type] = {
        type: session.type,
        walletId: session.walletId,
        evmAddress: session.evmAddress,
        evmChainId: session.evmChainId,
        stellarAddress: session.stellarAddress,
        stellarChainId: session.stellarChainId,
        connectionMode: session.connectionMode,
        peerName: session.peerName,
        peerIcon: session.peerIcon,
        peerRedirect: session.peerRedirect,
      };
    });
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data));
  } catch (error: any) {
    console.error('[System] Session storage save failed:', error.message);
  }
}

export async function restoreSessions(ctx: WalletServiceContext): Promise<WalletSession[]> {
  const restored: WalletSession[] = [];

  try {
    const stored = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!stored) return [];

    let data: Record<string, WalletSession>;
    try {
      data = JSON.parse(stored);
    } catch {
      clearSessionStorage();
      return [];
    }

    for (const [typeStr, savedSession] of Object.entries(data)) {
      const type = typeStr as WalletType;
      try {
        const restoredSession = await restoreSession(ctx, type, savedSession);
        if (restoredSession) restored.push(restoredSession);
      } catch (error) {
        console.warn(`[WalletService] Failed to restore session for ${type}:`, error);
      }
    }
  } catch (error) {
    console.warn('[WalletService] Could not read stored sessions:', error);
  }

  return restored;
}

async function restoreSession(
  ctx: WalletServiceContext,
  type: WalletType,
  savedSession: WalletSession
): Promise<WalletSession | null> {
  const isWalletConnect =
    savedSession.connectionMode === 'unified' || savedSession.connectionMode === 'separate';

  if (!isWalletConnect) {
    return restoreExtensionSession(ctx, type, savedSession);
  }

  const providerKey = savedSession.connectionMode === 'unified' ? 'unified' : type;

  let provider = ctx.providers.get(providerKey);

  if (!provider) {
    try {
      provider = await getOrCreateProvider(ctx, providerKey);
    } catch (error) {
      console.warn(`[WalletService] Provider init failed for key '${providerKey}':`, error);
      return null;
    }
  }

  if (!provider?.session) {
    ctx.sessions.delete(type);
    return null;
  }

  const expiry = provider.session?.expiry ?? 0;
  if (Date.now() / 1000 > expiry) {
    console.warn(`[WalletService] Restored session for '${providerKey}' is expired`);
    try {
      await provider.disconnect();
    } catch (err) {
      console.error('Disconnect error:', err);
    }
    ctx.providers.delete(providerKey);
    ctx.sessions.delete(type);
    return null;
  }

  ctx.providers.set(providerKey, provider);
  ctx.providers.set(type, provider);

  setupWalletConnectListeners(ctx, provider, type);

  const refreshed = await refreshSessionFromProvider(provider, savedSession);

  ctx.sessions.set(type, refreshed);
  ctx.emitState(type, 'connected');
  return refreshed;
}

async function restoreExtensionSession(
  ctx: WalletServiceContext,
  type: WalletType,
  savedSession: WalletSession
): Promise<WalletSession | null> {
  if (type === 'stellar') {
    // ── Freighter: use official npm package (message-passing, no window injection) ──
    if (savedSession.walletId === 'freighter') {
      try {
        const connResult = await FreighterApi.isConnected();
        const connected =
          typeof connResult === 'boolean' ? connResult : !!(connResult as any)?.isConnected;
        if (!connected) return null;

        const addrResult = await FreighterApi.getAddress();
        const publicKey =
          typeof addrResult === 'string' ? addrResult : (addrResult as any)?.address || '';
        if (!publicKey || !STELLAR_ADDR_REGEX.test(publicKey)) return null;

        const config = getStellarConfig(ctx.currentNetwork);
        const meta = getSessionMetadata('freighter');
        const freighterProvider = {
          _isFreighter: true,
          isConnected: FreighterApi.isConnected,
          isAllowed: FreighterApi.isAllowed,
          requestAccess: FreighterApi.requestAccess,
          getAddress: FreighterApi.getAddress,
          signTransaction: FreighterApi.signTransaction,
          signMessage: FreighterApi.signMessage,
          getNetwork: FreighterApi.getNetwork,
          getNetworkDetails: FreighterApi.getNetworkDetails,
        };
        const session: WalletSession = {
          type: 'stellar',
          walletId: 'freighter',
          stellarAddress: publicKey,
          stellarChainId: config.chainId,
          peerName: savedSession.peerName || meta.peerName,
          peerIcon: savedSession.peerIcon || meta.peerIcon,
          peerRedirect: savedSession.peerRedirect || meta.peerRedirect,
        };
        ctx.sessions.set('stellar', session);
        ctx.providers.set('stellar', freighterProvider);
        ctx.emitState('stellar', 'connected');
        return session;
      } catch (error) {
        console.warn('[WalletService] Freighter session restore failed:', error);
        return null;
      }
    }

    // ── Other Stellar extensions: window-probe path ──
    const discovered = discoverStellarExtensions();
    const matched = discovered.find(e => e.id === savedSession.walletId);
    const win = window as any;
    const extensionProvider =
      matched?.provider || win[savedSession.walletId] || win[`${savedSession.walletId}Api`];
    if (!extensionProvider) return null;

    try {
      if (typeof extensionProvider.isConnected === 'function') {
        const connResult = await extensionProvider.isConnected();
        // Handle both boolean and { isConnected: boolean } response shapes
        const connected = typeof connResult === 'boolean' ? connResult : !!connResult?.isConnected;
        if (!connected) return null;
      }

      let publicKey: string = '';
      if (typeof extensionProvider.getAddress === 'function') {
        const res = await extensionProvider.getAddress();
        // Handle { address, error } response shape
        publicKey = typeof res === 'string' ? res : res?.address || res?.publicKey || '';
      } else if (typeof extensionProvider.getPublicKey === 'function') {
        const res = await extensionProvider.getPublicKey();
        publicKey = typeof res === 'string' ? res : res?.address || res?.publicKey || '';
      }

      if (!publicKey || !STELLAR_ADDR_REGEX.test(publicKey)) {
        return null;
      }

      const config = getStellarConfig(ctx.currentNetwork);
      const meta = getSessionMetadata(savedSession.walletId);

      const session: WalletSession = {
        type: 'stellar',
        walletId: savedSession.walletId,
        stellarAddress: publicKey,
        stellarChainId: config.chainId,
        peerName: savedSession.peerName || meta.peerName,
        peerIcon: savedSession.peerIcon || meta.peerIcon,
        peerRedirect: savedSession.peerRedirect || meta.peerRedirect,
      };

      ctx.sessions.set('stellar', session);
      ctx.providers.set('stellar', extensionProvider);
      ctx.emitState('stellar', 'connected');
      return session;
    } catch (error) {
      console.warn(`[WalletService] ${savedSession.walletId} Stellar restore failed:`, error);
      return null;
    }
  }

  if (type === 'evm') {
    try {
      const evmProvider = await resolveEvmProvider(ctx, savedSession.walletId);
      if (!evmProvider) return null;

      const accounts: string[] = await evmProvider.request({ method: 'eth_accounts' });
      if (!accounts?.length || !EVM_ADDR_REGEX.test(accounts[0])) return null;

      const chainIdHex: string = await evmProvider.request({ method: 'eth_chainId' });
      const meta = getSessionMetadata(savedSession.walletId);
      const session: WalletSession = {
        type: 'evm',
        walletId: savedSession.walletId,
        evmAddress: accounts[0],
        evmChainId: parseInt(chainIdHex, 16),
        peerName: savedSession.peerName || meta.peerName,
        peerIcon: savedSession.peerIcon || meta.peerIcon,
        peerRedirect: savedSession.peerRedirect || meta.peerRedirect,
      };

      wrapProviderRequests(ctx, evmProvider);
      ctx.sessions.set('evm', session);
      ctx.providers.set('evm', evmProvider);
      setupEVMListeners(ctx, evmProvider);
      ctx.emitState('evm', 'connected');
      return session;
    } catch (error) {
      console.warn('[WalletService] EVM extension restore failed:', error);
      return null;
    }
  }

  return null;
}

export async function refreshSessionFromProvider(
  provider: any,
  saved: WalletSession
): Promise<WalletSession> {
  const session = provider.session;
  let evmAddress: string | undefined;
  let evmChainId: number | undefined;
  let stellarAddress: string | undefined;
  let stellarChainId: string | undefined;

  const evmAccount: string | undefined = session?.namespaces?.eip155?.accounts?.[0];
  if (evmAccount) {
    const [, chainIdStr, addr] = evmAccount.split(':');
    if (addr && EVM_ADDR_REGEX.test(addr)) {
      evmAddress = addr;
      evmChainId = parseInt(chainIdStr, 10);
    }
  }

  const stellarAccount: string | undefined = session?.namespaces?.stellar?.accounts?.[0];
  if (stellarAccount) {
    const [, chainId, addr] = stellarAccount.split(':');
    if (addr && STELLAR_ADDR_REGEX.test(addr)) {
      stellarAddress = addr;
      stellarChainId = chainId;
    }
  }

  const peerMetadata = session?.peer?.metadata;
  const meta = getSessionMetadata(saved.walletId, peerMetadata);

  const refreshed: WalletSession = {
    type: saved.type,
    walletId: saved.walletId,
    connectionMode: saved.connectionMode,
    evmAddress: evmAddress || saved.evmAddress,
    evmChainId: evmChainId ?? saved.evmChainId,
    stellarAddress: stellarAddress || saved.stellarAddress,
    stellarChainId: stellarChainId || saved.stellarChainId,
    peerName: meta.peerName || saved.peerName,
    peerIcon: meta.peerIcon || saved.peerIcon,
    peerRedirect: meta.peerRedirect || saved.peerRedirect,
  };

  return refreshed;
}

export function clearSessionStorage(): void {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch (error) {
    console.warn('[WalletService] Session storage clear failed:', error);
  }
}

export function setupCrossTabSync(ctx: WalletServiceContext): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleStorageChange = (e: StorageEvent) => {
    if (e.key !== SESSION_STORAGE_KEY) return;
    if (!e.newValue) {
      // Another tab cleared sessions or logged out
      ctx.sessions.clear();
      ctx.emitState('evm', 'disconnected');
      ctx.emitState('stellar', 'disconnected');
    }
  };

  window.addEventListener('storage', handleStorageChange);
  return () => window.removeEventListener('storage', handleStorageChange);
}
