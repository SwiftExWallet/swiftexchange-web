import { removeEVMListeners } from './eventListeners';
import { saveSession } from './sessionPersistence';
import type { WalletServiceContext, WalletType } from './types';

// ---------------------------------------------------------------------------
// disconnect (single wallet type)
// ---------------------------------------------------------------------------

export async function disconnect(ctx: WalletServiceContext, type: WalletType): Promise<void> {
  if (ctx.disconnecting.has(type)) return;
  ctx.disconnecting.add(type);

  const provider = ctx.providers.get(type);
  const sharedTypes: WalletType[] = [type];

  if (provider) {
    for (const [key, p] of Array.from(ctx.providers.entries())) {
      const k = key as WalletType;
      if (k !== type && p === provider && (k === 'evm' || k === 'stellar')) {
        if (!ctx.disconnecting.has(k)) {
          ctx.disconnecting.add(k);
          sharedTypes.push(k);
        }
      }
    }
  }

  const networkTag = (ctx.currentNetwork || 'mainnet').toUpperCase();
  console.info(`[WalletConnect:${networkTag}] Disconnecting session: ${type}`);

  if (provider) {
    ctx.registeredProviders.delete(provider);
    removeEVMListeners(provider);

    if (provider.session) {
      try {
        await provider.disconnect();
      } catch (err: any) {
        console.warn('[WalletService] Error during provider disconnect:', err);
      }
    }

    for (const [key, p] of Array.from(ctx.providers.entries())) {
      if (p === provider) {
        ctx.providers.delete(key);
      }
    }
  }

  for (const t of sharedTypes) {
    ctx.isSignRequestInFlight.set(t, false);
    ctx.providers.delete(t);
  }

  for (const t of sharedTypes) {
    ctx.derivationInProgress = false;
    ctx.sessions.delete(t);
    ctx.lastPingAt.delete(t);
    ctx.modals.get(t)?.closeModal();
    ctx.modals.delete(t);
    ctx.disconnecting.delete(t);
  }

  saveSession(ctx);

  if (ctx.sessions.size === 0) {
    await clearAppData();
  }

  for (const t of sharedTypes) {
    ctx.emitState(t, 'disconnected');
  }
}

// ---------------------------------------------------------------------------
// disconnectAll
// ---------------------------------------------------------------------------

export async function disconnectAll(ctx: WalletServiceContext): Promise<void> {
  const networkTag = (ctx.currentNetwork || 'mainnet').toUpperCase();
  console.info(`[WalletConnect:${networkTag}] Disconnecting all connected wallets`);

  const providers = new Set(ctx.providers.values());
  for (const provider of providers) {
    removeEVMListeners(provider);
    if (provider?.session) {
      try {
        await provider.disconnect();
      } catch (err) {
        console.warn('[WalletService] Error disconnecting provider:', err);
      }
    }
  }

  ctx.providers.clear();
  ctx.isSignRequestInFlight.clear();
  ctx.sessions.clear();
  ctx.modals.clear();
  ctx.lastPingAt.clear();
  ctx.disconnecting.clear();
  ctx.registeredProviders.clear();

  await clearAppData();
}

// ---------------------------------------------------------------------------
// clearAppData — localStorage + IndexedDB + API keys
// ---------------------------------------------------------------------------

export async function clearAppData(): Promise<void> {
  try {
    // Core session keys
    localStorage.removeItem('wallet_sessions');
    localStorage.removeItem('_sx_active_auth_addr');

    // Vendor prefixes that must be wiped on full disconnect
    const PURGE_PREFIXES = [
      '_sx_auth_',
      'stellar_active_',
      'wc@2:',
      'walletconnect',
      'WALLETCONNECT_',
      'walletlink:',
      '-walletlink',
      '@appkit/',
      'WCM_',
      'W3M_',
      '@StellarWalletsKit',
      'freighter',
      'swiftex_',
    ];

    const purgeStore = (store: Storage) => {
      const keysToRemove: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (!key) continue;
        if (
          key === 'wallet_sessions' ||
          PURGE_PREFIXES.some(
            prefix => key.startsWith(prefix) || key.toLowerCase().startsWith(prefix.toLowerCase())
          )
        ) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(k => store.removeItem(k));
    };

    purgeStore(localStorage);
    if (typeof sessionStorage !== 'undefined') {
      purgeStore(sessionStorage);
    }
  } catch (error) {
    console.warn('[WalletService] Storage clear failed:', error);
  }

  try {
    if (typeof indexedDB !== 'undefined') {
      indexedDB.deleteDatabase('_sx_v4_kv_28f3');
      indexedDB.deleteDatabase('WALLET_CONNECT_V2_INDEXED_DB'); // WC v2 IndexedDB
    }
  } catch (error) {
    console.error('[WalletService] Failed to clear IndexedDB:', error);
  }
}
